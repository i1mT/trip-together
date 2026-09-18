"use client";
import { useState } from "react";
import type { PublicSnapshot } from "../../../../shared/market";
import { localInput } from "@/lib/zoned-input";
import { zoneName, eventTime, eventEndDate } from "@/lib/time";
import { eventRoute } from "@/lib/event-route";
import { TicketRoute } from "../home/ticket-route";
import { TravelSticker } from "../travel-sticker";
export function SnapshotView({
  snapshot,
  title,
}: {
  snapshot: PublicSnapshot;
  title?: string;
}) {
  const { trip, events } = snapshot;
  const tripDays: string[] = [];
  for (
    let day = trip.start_date;
    day <= trip.end_date && tripDays.length < 730;
  ) {
    tripDays.push(day);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  const days = [
    ...new Set([
      ...tripDays,
      ...events.map((e) => localInput(e.start, e.timezone).slice(0, 10)),
    ]),
  ].sort();
  const [selected, setSelected] = useState(days[0] ?? trip.start_date);
  const items = events.filter(
    (e) => localInput(e.start, e.timezone).slice(0, 10) === selected,
  );
  const dayCount =
    Math.round(
      (Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86400000,
    ) + 1;
  return (
    <div className="market-preview">
      <div className="market-summary">
        <div>
          <span className="market-tag">
            {dayCount} 天 · {events.length} 个事项
          </span>
          <h2>{title ?? trip.title}</h2>
          <p>
            {trip.destinations.map((d) => d.name).join(" · ") ||
              zoneName(trip.timezone)}
          </p>
        </div>
        <TravelSticker kind="luggage" />
        <small>
          原行程日期 {trip.start_date} — {trip.end_date}
        </small>
      </div>
      <div className="day-picker market-day-picker" aria-label="选择行程日期">
        {days.map((day, i) => (
          <button
            key={day}
            onClick={() => setSelected(day)}
            aria-pressed={selected === day}
            className={`day-chip ${selected === day ? "selected" : ""}`}
          >
            <small>第 {i + 1} 天</small>
            <strong>{day.slice(5).replace("-", ".")}</strong>
            <span>
              {new Intl.DateTimeFormat("zh-CN", {
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(day))}
            </span>
          </button>
        ))}
      </div>
      <div className="market-events">
        {items.map((e, index) => {
          const route = eventRoute(e);
          const range = e.timeRange ?? ["flight", "stay"].includes(e.kind);
          return (
            <article
              key={index}
              className={`market-event ${route ? "has-route" : ""}`}
            >
              <header className="market-event-heading">
                <h4>{e.title}</h4>
                {!route && <TravelSticker kind={e.kind} />}
              </header>
              {route ? (
                <TicketRoute event={e} />
              ) : (
                <div className="market-event-content">
                  <p className="market-event-time">
                    {eventTime(e)}
                    {range && ` — ${eventTime(e, true)}`}
                  </p>
                  <small>
                    {zoneName(e.timezone)}
                    {range && e.endTimezone && e.endTimezone !== e.timezone
                      ? ` → ${zoneName(e.endTimezone)}`
                      : ""}
                  </small>
                  {range && <small>至 {eventEndDate(e)}</small>}
                  <p>{e.location?.name || e.place}</p>
                </div>
              )}
              {(e.address ||
                e.location?.address ||
                e.departureLocation ||
                (route && (e.place || e.location?.name))) && (
                <div className="market-event-location">
                  {route && (e.location?.name || e.place) && (
                    <p>地点：{e.location?.name || e.place}</p>
                  )}
                  {e.departureLocation && (
                    <p>
                      出发：{e.departureLocation.name} ·{" "}
                      {e.departureLocation.address}
                    </p>
                  )}
                  {(e.location?.address || e.address) && (
                    <p>
                      {route ? "抵达：" : ""}
                      {e.location?.address || e.address}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
