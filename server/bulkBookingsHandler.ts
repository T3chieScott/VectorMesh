import type { Request, Response } from "express";
import { z } from "zod";
import type { Event, ScreenEventBooking, InsertScreenEventBooking } from "../shared/schema";

// Per-row outcome of a bulk booking insert. The endpoint always returns
// HTTP 200 with a 1:1 list of results so the client can show per-row
// status (Pasted / Conflict / Skipped) without parsing top-level error
// shapes.
export type BulkBookingResult =
  | {
      index: number;
      status: "created";
      booking: ScreenEventBooking;
      input: { eventId: string; startsAt: string; endsAt: string };
    }
  | {
      index: number;
      status: "error";
      code: "overlap" | "forbidden" | "event_not_found" | "bad_request" | "server_error";
      error: string;
      input: { eventId: string; startsAt: string; endsAt: string };
    };

const itemSchema = z.object({
  eventId: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

const bodySchema = z.object({
  bookings: z.array(itemSchema).min(1).max(200),
});

export interface BulkBookingsDeps {
  getScreen: (id: string) => Promise<{ id: string; clientId: string | null } | undefined>;
  getEvent: (id: string) => Promise<Event | undefined>;
  createScreenEventBooking: (data: InsertScreenEventBooking) => Promise<ScreenEventBooking>;
}

export interface BulkBookingsAuth {
  canAccessClient: (req: Request, clientId: string) => boolean;
}

// Runs the per-row bulk insert. Reuses the existing single-booking
// storage method so the per-screen advisory lock + overlap check still
// serialises writes; we just loop here. Each row gets its own
// transaction (inside createScreenEventBooking) — partial success is
// the desired UX for paste, so a failure on one row never aborts the
// remaining rows.
export async function processBulkBookings(
  req: Request,
  screenId: string,
  body: unknown,
  deps: BulkBookingsDeps,
  auth: BulkBookingsAuth,
): Promise<{ status: number; payload: unknown }> {
  const screen = await deps.getScreen(screenId);
  if (!screen) return { status: 404, payload: { error: "Screen not found" } };
  if (screen.clientId && !auth.canAccessClient(req, screen.clientId)) {
    return { status: 403, payload: { error: "Access denied" } };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, payload: { error: parsed.error.errors } };
  }

  const eventCache = new Map<string, Event | undefined>();
  const getEvent = async (id: string) => {
    if (eventCache.has(id)) return eventCache.get(id);
    const ev = await deps.getEvent(id);
    eventCache.set(id, ev);
    return ev;
  };

  const results: BulkBookingResult[] = [];
  for (let i = 0; i < parsed.data.bookings.length; i++) {
    const item = parsed.data.bookings[i];
    const startsAt = new Date(item.startsAt);
    const endsAt = new Date(item.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      results.push({
        index: i,
        status: "error",
        code: "bad_request",
        error: "Invalid date",
        input: item,
      });
      continue;
    }
    if (!(endsAt > startsAt)) {
      results.push({
        index: i,
        status: "error",
        code: "bad_request",
        error: "End must be after start",
        input: item,
      });
      continue;
    }

    const event = await getEvent(item.eventId);
    if (!event) {
      results.push({
        index: i,
        status: "error",
        code: "event_not_found",
        error: "Event not found",
        input: item,
      });
      continue;
    }
    if (event.clientId && !auth.canAccessClient(req, event.clientId)) {
      results.push({
        index: i,
        status: "error",
        code: "forbidden",
        error: "Access denied to event",
        input: item,
      });
      continue;
    }

    try {
      const booking = await deps.createScreenEventBooking({
        screenId: screen.id,
        eventId: event.id,
        startsAt,
        endsAt,
      });
      results.push({ index: i, status: "created", booking, input: item });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create booking";
      const code: "overlap" | "bad_request" | "server_error" = msg.includes("overlap")
        ? "overlap"
        : msg.includes("end must be after start")
        ? "bad_request"
        : "server_error";
      results.push({ index: i, status: "error", code, error: msg, input: item });
    }
  }

  return { status: 200, payload: { results } };
}

export function buildBulkBookingsHandler(
  deps: BulkBookingsDeps,
  auth: BulkBookingsAuth,
  options?: {
    onAudit?: (req: Request, results: BulkBookingResult[]) => void;
  },
) {
  return async (req: Request, res: Response) => {
    try {
      const screenId = String((req.params as Record<string, string>).screenId || "");
      const out = await processBulkBookings(req, screenId, req.body, deps, auth);
      if (out.status === 200 && options?.onAudit) {
        options.onAudit(req, (out.payload as { results: BulkBookingResult[] }).results);
      }
      res.status(out.status).json(out.payload);
    } catch (error) {
      console.error("Error creating bulk bookings:", error);
      res.status(500).json({ error: "Failed to create bookings" });
    }
  };
}
