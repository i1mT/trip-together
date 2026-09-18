import { isPlanned } from "../../../shared/event-status";
import type { TripEvent } from "./models";
export function localDate(date: Date | string | number, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function clockTime(
  date: Date | string | number,
  timezone: string,
  seconds = false,
) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(seconds ? { second: "2-digit" as const } : {}),
  }).format(new Date(date));
}
export function dateLabel(date: Date | string | number, timezone = "UTC") {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(date));
}
export function selectEvents(events: TripEvent[], now: number) {
  const sorted = events
    .filter(isPlanned)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const timed = sorted.filter(
    (e) => e.timeMode !== "date" && !e.endUnspecified,
  );
  const current = timed
    .filter((e) => Date.parse(e.start) <= now && now < Date.parse(e.end))
    .at(-1);
  const next = timed.find((e) => Date.parse(e.start) > now);
  const flexible = sorted.find(
    (e) =>
      (e.timeMode === "date" || e.endUnspecified) &&
      (e.kind === "stay"
        ? localDate(now, e.endTimezone ?? e.timezone) <=
          (e.dateEnd ?? localDate(e.end, e.endTimezone ?? e.timezone))
        : localDate(now, e.timezone) <= localDate(e.start, e.timezone)),
  );
  const upcoming =
    next && flexible
      ? localDate(next.start, next.timezone) <=
        localDate(flexible.start, flexible.timezone)
        ? next
        : flexible
      : (next ?? flexible);
  return {
    current,
    next,
    featured: current ?? upcoming,
    finished: events.length > 0 && !current && !upcoming,
  };
}
export function countdown(target: string, now: number) {
  const remaining = Math.max(0, Math.ceil((Date.parse(target) - now) / 1000));
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const clock = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return days > 0 ? `${days} 天 ${clock}` : clock;
}
export { readableZone as zoneName } from "../../../shared/travel-options";
export type EventTiming = Pick<
  TripEvent,
  | "timeMode"
  | "kind"
  | "endUnspecified"
  | "end"
  | "start"
  | "endTimezone"
  | "timezone"
  | "dateEnd"
>;
export function eventTime(event: EventTiming, end = false) {
  if (event.timeMode === "date")
    return event.kind === "stay" ? (end ? "退房日期" : "入住日期") : "时间待定";
  if (end && event.endUnspecified) return "到达时间待定";
  return clockTime(
    end ? event.end : event.start,
    end ? (event.endTimezone ?? event.timezone) : event.timezone,
  );
}
export function eventEndDate(event: EventTiming) {
  return event.timeMode === "date" && event.dateEnd
    ? dateLabel(`${event.dateEnd}T12:00:00Z`, "UTC")
    : dateLabel(event.end, event.endTimezone ?? event.timezone);
}
