/**
 * Targeted browser coverage for the presenter-record threshold.
 *
 * The fixture deliberately wraps both sides of every presenter/company pair.
 * The assertions therefore exercise the measured row boundary in the real
 * AgendaDisplayWidget rather than counting newline characters or using the
 * resolver in isolation.
 */
import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray, like } from "drizzle-orm";
import {
  agendaItems,
  agendaWidgetConfigs,
  auditLogs,
  clients,
  users,
} from "../../shared/schema";

const MARK = "ZZTEST-PRESENTER-THRESHOLD-BROWSER-";
const RUN = Math.random().toString(36).slice(2, 9);
const PREFIX = `${MARK}${RUN}-`;
const USER_PREFIX = PREFIX.toLowerCase();
const ADMIN_EMAIL = `${USER_PREFIX}admin@example.test`;
const SITE_NAME = `${PREFIX}site`;
const NOW = "2031-07-04T09:00:00Z";
const AT = encodeURIComponent(NOW);
const counts = [2, 3, 4] as const;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, {
  schema: { agendaItems, agendaWidgetConfigs, auditLogs, clients, users },
});

// The four-record case waits for the whole-card stage before the presenter
// stage, so the browser spec needs enough time to observe both.
test.describe.configure({ timeout: 90_000 });

type Fixture = {
  clientId: string;
  configIds: Record<(typeof counts)[number], string>;
  itemIds: Record<(typeof counts)[number], string>;
};

async function cleanup() {
  const ownedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${USER_PREFIX}%`));
  if (ownedUsers.length) {
    await db.delete(auditLogs).where(
      inArray(auditLogs.userId, ownedUsers.map((row) => row.id)),
    );
  }
  await db.delete(agendaItems).where(like(agendaItems.title, `${PREFIX}%`));
  await db.delete(agendaWidgetConfigs).where(like(agendaWidgetConfigs.name, `${PREFIX}%`));
  await db.delete(clients).where(eq(clients.name, SITE_NAME));
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%`));
}

function configurePage(page: Page) {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(45_000);
}

async function login(page: Page) {
  const response = await page.request.post("/api/auth/test-login", {
    data: { email: ADMIN_EMAIL.toLowerCase() },
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  expect(response.status(), `test-login failed: ${await response.text()}`).toBe(200);
}

function wrappedRecord(kind: "Presenter" | "Company", count: number, index: number) {
  return (
    `${PREFIX}${kind}-${count}-${index} deliberately wrapped ${kind.toLowerCase()} ` +
    "record text crosses the available browser width"
  );
}

async function seed(): Promise<Fixture> {
  await db.insert(users).values({
    email: ADMIN_EMAIL.toLowerCase(),
    firstName: "Presenter Threshold",
    lastName: "Browser Test",
    role: "admin",
    isActive: true,
    mustChangePassword: false,
    twoFactorEnabled: true,
    // Test-only nonempty marker: the test-login route accepts this seeded
    // account without needing a real credential.
    passwordHash: `${PREFIX}test-only-password-hash`,
  });

  const [{ id: clientId }] = await db.insert(clients).values({
    name: SITE_NAME,
    timezone: "Europe/London",
  }).returning({ id: clients.id });

  const configIds = {} as Fixture["configIds"];
  const itemIds = {} as Fixture["itemIds"];
  for (const count of counts) {
    const room = `${PREFIX}room-${count}`;
    const [{ id: configId }] = await db.insert(agendaWidgetConfigs).values({
      clientId,
      name: `${PREFIX}config-${count}`,
      displayMode: "full",
      layoutMode: "landscape",
      roomFilter: [room],
      maxItemsPerPage: 1,
      rotationIntervalSeconds: 60,
      refreshIntervalSeconds: 5,
      presenterVisibleLines: 3,
      showPresenter: true,
      showPresenterCompany: true,
      showCompany: false,
      showDescription: false,
      showSessionCount: false,
      showEventName: false,
      showCurrentTime: false,
      showDayName: false,
      showDate: false,
      showAgendaDayHeading: false,
      showNowNextLabel: false,
      showRoom: false,
      showTrack: false,
      showStatus: false,
      showSessionDuration: false,
      showSessionEndTime: false,
    }).returning({ id: agendaWidgetConfigs.id });
    const [{ id: itemId }] = await db.insert(agendaItems).values({
      clientId,
      title: `${PREFIX}record-count-${count}`,
      room,
      presenter: Array.from({ length: count }, (_, index) =>
        wrappedRecord("Presenter", count, index + 1),
      ).join("\n"),
      presenterCompany: Array.from({ length: count }, (_, index) =>
        wrappedRecord("Company", count, index + 1),
      ).join("\n"),
      startsAt: new Date("2031-07-04T08:00:00Z"),
      endsAt: new Date("2031-07-04T10:00:00Z"),
      status: "scheduled",
      sortOrder: 0,
    }).returning({ id: agendaItems.id });
    configIds[count] = configId;
    itemIds[count] = itemId;
  }
  return { clientId, configIds, itemIds };
}

type PresenterSnapshot = {
  offset: number;
  fullyVisibleRows: number;
  rowCount: number;
  nthRowFullyVisible: boolean;
  finalRowReadable: boolean;
};

async function readPresenterSnapshot(page: Page, itemId: string): Promise<PresenterSnapshot> {
  return page.getByTestId(`agenda-row-${itemId}`).evaluate((row) => {
    const viewport = row.querySelector<HTMLElement>(
      "[data-testid^='agenda-presenter-viewport-']",
    );
    const content = viewport?.firstElementChild as HTMLElement | null;
    if (!viewport || !content) throw new Error("presenter viewport was not rendered");
    const viewportRect = viewport.getBoundingClientRect();
    const rows = [...content.querySelectorAll<HTMLElement>("[data-agenda-presenter-row]")];
    const fullyVisible = rows.filter((presenterRow) => {
      const rect = presenterRow.getBoundingClientRect();
      return rect.top >= viewportRect.top - 1.5 &&
        rect.bottom <= viewportRect.bottom + 1.5;
    });
    const offset = (() => {
      const transform = getComputedStyle(content).transform;
      if (transform === "none") return 0;
      try {
        return new DOMMatrixReadOnly(transform).m42;
      } catch {
        return 0;
      }
    })();
    const finalRow = rows.at(-1);
    let finalRowReadable = false;
    if (finalRow) {
      const textNode = (() => {
        let node: Node | null = finalRow;
        while (node?.lastChild) node = node.lastChild;
        return node?.nodeType === Node.TEXT_NODE ? node : null;
      })();
      if (textNode?.textContent) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const finalLine = [...range.getClientRects()].at(-1);
        finalRowReadable = Boolean(
          finalLine &&
          finalLine.top >= viewportRect.top - 1.5 &&
          finalLine.bottom <= viewportRect.bottom + 1.5,
        );
      }
    }
    return {
      offset,
      fullyVisibleRows: fullyVisible.length,
      rowCount: rows.length,
      nthRowFullyVisible: Boolean(rows[2]) &&
        rows[2].getBoundingClientRect().top >= viewportRect.top - 1.5 &&
        rows[2].getBoundingClientRect().bottom <= viewportRect.bottom + 1.5,
      finalRowReadable,
    };
  });
}

async function waitForPresenterGeometry(page: Page, itemId: string, expectedRows: number) {
  await expect.poll(
    () => readPresenterSnapshot(page, itemId).then((snapshot) => snapshot.rowCount),
    {
      timeout: 15_000,
      message: `presenter record count should settle at ${expectedRows}`,
    },
  ).toBe(expectedRows);
}

async function assertInitialFrame(
  page: Page,
  itemId: string,
  recordCount: number,
  threshold = 3,
) {
  await waitForPresenterGeometry(page, itemId, recordCount);
  const snapshot = await readPresenterSnapshot(page, itemId);
  expect(snapshot.fullyVisibleRows, `${recordCount} fully visible presenter rows`)
    .toBe(Math.min(recordCount, threshold));
  expect(snapshot.nthRowFullyVisible, "the third presenter record is fully visible")
    .toBe(recordCount >= threshold);
  expect(snapshot.offset, `${recordCount} presenter records must start at the top`)
    .toBe(0);
  expect(snapshot.finalRowReadable, `${recordCount} final record should be readable when it fits`)
    .toBe(recordCount <= threshold);
}

test.describe("fixed presenter threshold N=3 in browser rendering", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    await cleanup();
    fixture = await seed();
  });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  test("counts 2, 3, and 4 use three wrapped presenter records as the threshold", async ({ page }) => {
    configurePage(page);
    await page.setViewportSize({ width: 640, height: 480 });

    for (const count of counts) {
      const itemId = fixture.itemIds[count];
      await page.goto(
        `/display/agenda/${fixture.configIds[count]}?at=${AT}`,
        { waitUntil: "domcontentloaded", timeout: 45_000 },
      );
      const root = page.getByTestId("agenda-display-root");
      await expect(root).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId(`agenda-title-${itemId}`)).toContainText(
        `${PREFIX}record-count-${count}`,
        { timeout: 30_000 },
      );
      await expect(page.getByTestId(`agenda-presenter-${itemId}`)).toContainText(
        `${PREFIX}Presenter-${count}-1`,
      );
      await expect(page.getByTestId(`agenda-presenter-company-${itemId}`)).toContainText(
        `${PREFIX}Company-${count}-1`,
      );

      await assertInitialFrame(page, itemId, count);
      if (count < 4) {
        await expect.poll(
          () => readPresenterSnapshot(page, itemId).then((snapshot) => snapshot.offset),
          {
            timeout: 4_000,
            intervals: [100, 250, 500],
            message: `${count} presenter records must never start a reveal`,
          },
        ).toBe(0);
      }
      if (count === 4) {
        await expect.poll(
          () => readPresenterSnapshot(page, itemId).then((snapshot) => snapshot.offset),
          {
            timeout: 20_000,
            intervals: [100, 250, 500],
            message: "fourth presenter record should trigger presenter movement",
          },
        ).toBeLessThan(-1);
        await expect.poll(
          () => readPresenterSnapshot(page, itemId).then((snapshot) => snapshot.finalRowReadable),
          {
            timeout: 30_000,
            intervals: [100, 250, 500],
            message: "the final wrapped presenter/company record should become readable",
          },
        ).toBe(true);
        await expect(page.getByTestId(`agenda-presenter-${itemId}:3`)).toContainText(
          `${PREFIX}Presenter-4-4`,
        );
        await expect(page.getByTestId(`agenda-presenter-company-${itemId}:3`)).toContainText(
          `${PREFIX}Company-4-4`,
        );
      }
    }
  });

  test("real editor saves a changed threshold and rendering uses it after reload", async ({ page }) => {
    test.setTimeout(90_000);
    configurePage(page);
    const itemId = fixture.itemIds[4];
    const configId = fixture.configIds[4];
    await login(page);
    await page.addInitScript((clientId) => {
      localStorage.setItem("vectormesh_selected_client_id", clientId);
    }, fixture.clientId);
    // Exercise the real editor at the same 1440×1000 geometry used by the
    // display surface. This catches measurement feedback loops while the
    // threshold is being edited, before the saved config is reloaded below.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/agenda/displays", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expect(page.getByTestId("text-agenda-configs-title")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId(`button-edit-config-${configId}`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Edit Widget Config");
    const thresholdInput = page.getByTestId("input-presenter-visible-lines");
    const saveButton = dialog.getByTestId("button-save-config");
    await expect(thresholdInput).toHaveValue("3");
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    await thresholdInput.fill("2");
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText("Config updated", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog).toBeHidden();

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.getByTestId(`button-edit-config-${configId}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`button-edit-config-${configId}`).click();
    await expect(page.getByRole("dialog")).toContainText("Edit Widget Config");
    await expect(page.getByTestId("input-presenter-visible-lines")).toHaveValue("2");

    // Return to the narrow actual-browser surface after the editor preview.
    // This is the geometry on which the saved threshold is proved.
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(`/display/agenda/${configId}?at=${AT}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await expect(page.getByTestId("agenda-display-root")).toBeVisible({
      timeout: 30_000,
    });
    await waitForPresenterGeometry(page, itemId, 4);
    await expect.poll(
      () => readPresenterSnapshot(page, itemId).then((snapshot) => snapshot.fullyVisibleRows),
      { timeout: 10_000 },
    ).toBe(2);
    const snapshot = await readPresenterSnapshot(page, itemId);
    expect(snapshot.nthRowFullyVisible, "saved threshold of two must hide the third row")
      .toBe(false);
    await expect.poll(
      () => readPresenterSnapshot(page, itemId).then((value) => value.offset),
      { timeout: 20_000, intervals: [100, 250, 500] },
    ).toBeLessThan(-1);
  });
});