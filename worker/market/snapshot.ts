import {
  snapshotSchema,
  publicTripSchema,
  publicEventSchema,
} from "../../shared/market";
import { localInput, zonedInstant } from "../../shared/zoned-input";
import type { PublicSnapshot } from "../../shared/market";
import type { Trip } from "../trips/access";
import { HttpError } from "../http";
export async function draft(env: Env, trip: Trip) {
  const rows = await env.DB.prepare(
    "SELECT data FROM events WHERE trip_id=? ORDER BY json_extract(data,'$.start'),id",
  )
    .bind(trip.id)
    .all<{ data: string }>();
  if (rows.results.length > 200)
    throw new HttpError(400, "单次公开分享最多支持 200 个事项，请先精简行程");
  const snapshot = rows.results.length
    ? snapshotSchema.parse({
        trip: publicTripSchema.parse({
          ...trip,
          destinations: JSON.parse(trip.destinations ?? "[]"),
        }),
        events: rows.results.map((r) =>
          publicEventSchema.parse(JSON.parse(r.data)),
        ),
      })
    : null;
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  const hash = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { snapshot, hash };
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function shiftSnapshot(
  snapshot: PublicSnapshot,
  start: string,
): PublicSnapshot {
  const days =
    (Date.parse(start) - Date.parse(snapshot.trip.start_date)) / 86400000;
  if (!days) return structuredClone(snapshot);
  function shift(instant: string, zone: string) {
    const local = localInput(instant, zone);
    return zonedInstant(
      shiftDate(local.slice(0, 10), days) + local.slice(10),
      zone,
    );
  }
  try {
    return snapshotSchema.parse({
      trip: {
        ...snapshot.trip,
        start_date: start,
        end_date: shiftDate(snapshot.trip.end_date, days),
      },
      events: snapshot.events.map((e) => {
        const start = shift(e.start, e.timezone),
          end = shift(e.end, e.endTimezone ?? e.timezone);
        if (Date.parse(end) <= Date.parse(start))
          throw Error("日期调整后结束时间早于开始时间");
        return {
          ...e,
          start,
          end,
          ...(e.dateEnd ? { dateEnd: shiftDate(e.dateEnd, days) } : {}),
        };
      }),
    });
  } catch {
    throw new HttpError(
      400,
      "所选日期存在当地时钟调整或时间冲突，请选择其他出发日期，或按原日期复制后修改时间",
    );
  }
}
