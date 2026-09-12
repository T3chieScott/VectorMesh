import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;
const migrationSql = readFileSync(
  new URL("../migrations/0041_agenda_presenter_company.sql", import.meta.url),
  "utf8",
);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll(`"`, `""`)}"`;
}

function isolatedDatabaseUrl(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  // pg applies this connection option before the first query, including to
  // clients acquired by ensureAgendaPresenterCompanyMigration.
  url.searchParams.set("options", `-c search_path=${quoteIdentifier(schema)},public`);
  return url.toString();
}

test("0041 migration and startup retry are isolated, lossless, and idempotent", async () => {
  if (!process.env.DATABASE_URL) {
    // Keep a useful non-DB contract check for local runs without a provisioned
    // database. The acceptance path above is deliberately live-DB-only.
    assert.match(migrationSql, /current_schema\(\)/i);
    assert.match(migrationSql, /show_company = COALESCE\(show_presenter, TRUE\)/i);
    assert.match(migrationSql, /ROW_NUMBER\(\) OVER[\s\S]*ORDER BY starts_at ASC, id ASC/i);
    return;
  }

  const schema = `agenda_0041_acceptance_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  let isolatedPool: pg.Pool | undefined;

  try {
    await adminPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);

    isolatedPool = new Pool({
      connectionString: isolatedDatabaseUrl(process.env.DATABASE_URL, schema),
    });
    const isolatedClient = await isolatedPool.connect();
    try {
      await isolatedClient.query("BEGIN");
      await isolatedClient.query(`
        CREATE TABLE agenda_items (
          id VARCHAR PRIMARY KEY,
          external_sync_config_id VARCHAR,
          starts_at TIMESTAMP NOT NULL,
          presenter TEXT,
          company TEXT
        );
        CREATE TABLE agenda_widget_configs (
          id VARCHAR PRIMARY KEY,
          show_presenter BOOLEAN,
          single_global_now_next BOOLEAN NOT NULL DEFAULT FALSE
        );
        INSERT INTO agenda_items
          (id, external_sync_config_id, starts_at, presenter, company)
        VALUES
          ('tie-b', 'source-a', '2026-06-01T10:00:00Z', 'Ada', 'Sponsor B'),
          ('earliest', 'source-a', '2026-06-01T09:00:00Z', 'Grace', 'Sponsor A'),
          ('tie-a', 'source-a', '2026-06-01T10:00:00Z', 'Lin', 'Sponsor C'),
          ('other-source', 'source-b', '2026-06-01T12:00:00Z', 'Edsger', 'Sponsor D'),
          ('not-sourced', NULL, '2026-06-01T08:00:00Z', 'Katherine', 'Sponsor E');
        INSERT INTO agenda_widget_configs (id, show_presenter)
        VALUES
          ('legacy-visible', TRUE),
          ('legacy-hidden', FALSE),
          ('legacy-null', NULL);
      `);
      await isolatedClient.query("COMMIT");
    } catch (error) {
      await isolatedClient.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      isolatedClient.release();
    }

    const beforeSponsors = await isolatedPool.query(
      "SELECT id, company FROM agenda_items ORDER BY id",
    );

    const migrationClient = await isolatedPool.connect();
    try {
      await migrationClient.query("BEGIN");
      await migrationClient.query(migrationSql);
      await migrationClient.query("COMMIT");
    } catch (error) {
      await migrationClient.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      migrationClient.release();
    }

    const afterMigration = await isolatedPool.query<{
      id: string;
      company: string | null;
      presenter_company: string | null;
      source_ordinal: number | null;
    }>(
      `SELECT id, company, presenter_company, source_ordinal
       FROM agenda_items ORDER BY id`,
    );
    assert.deepEqual(
      afterMigration.rows.map(({ id, company }) => ({ id, company })),
      beforeSponsors.rows,
    );
    assert.deepEqual(
      Object.fromEntries(
        afterMigration.rows.map((row) => [row.id, row.source_ordinal]),
      ),
      {
        earliest: 0,
        "tie-a": 1,
        "tie-b": 2,
        "other-source": 0,
        "not-sourced": null,
      },
    );
    assert.ok(afterMigration.rows.every((row) => row.presenter_company === null));

    const configAfterMigration = await isolatedPool.query<{
      id: string;
      show_presenter: boolean | null;
      show_company: boolean;
      show_presenter_company: boolean;
    }>(
      `SELECT id, show_presenter, show_company, show_presenter_company
       FROM agenda_widget_configs ORDER BY id`,
    );
    assert.deepEqual(configAfterMigration.rows, [
      {
        id: "legacy-hidden",
        show_presenter: false,
        show_company: false,
        show_presenter_company: false,
      },
      {
        id: "legacy-null",
        show_presenter: null,
        show_company: true,
        show_presenter_company: false,
      },
      {
        id: "legacy-visible",
        show_presenter: true,
        show_company: true,
        show_presenter_company: false,
      },
    ]);

    // Simulate an operator changing the independent sponsor setting between
    // boots. A retry must not reapply the legacy show_presenter value.
    await isolatedPool.query(
      "UPDATE agenda_widget_configs SET show_company = FALSE WHERE id = 'legacy-visible'",
    );
    const beforeRetries = await isolatedPool.query(`
      SELECT
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM agenda_items a) AS items,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM agenda_widget_configs c) AS configs
    `);

    const { ensureAgendaPresenterCompanyMigration } = await import("../server/db");
    await ensureAgendaPresenterCompanyMigration(isolatedPool);
    await ensureAgendaPresenterCompanyMigration(isolatedPool);

    const afterRetries = await isolatedPool.query(`
      SELECT
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM agenda_items a) AS items,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM agenda_widget_configs c) AS configs
    `);
    assert.deepEqual(afterRetries.rows, beforeRetries.rows);
  } finally {
    await isolatedPool?.end().catch(() => {});
    // The schema is random and is dropped only after every client/pool has
    // been closed, so public/dev tables are never touched by this test.
    await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`).catch(() => {});
    await adminPool.end().catch(() => {});
  }
});