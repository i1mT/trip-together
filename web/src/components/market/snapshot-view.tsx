"use client";
import { useState } from "react";
import type { PublicSnapshot } from "../../../../shared/market";
import { localInput } from "@/lib/zoned-input";
import { zoneName, eventTime } from "@/lib/time";
import { eventRoute } from "@/lib/event-route";
import { TravelSticker } from "../travel-sticker";
import { EmptyState } from "../empty-state";
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
      {items.length ? (
        <>
          <div className="section-heading">
            <h2>{items[0]?.location?.name || items[0]?.place || "当天安排"}</h2>
            <span className="list-caption">{items.length} 项安排</span>
          </div>
          <div className="timeline">
            {items.map((e, index) => {
              const route = eventRoute(e);
              return (
                <div className="timeline-event" key={index}>
                  <div className="timeline-time">
                    <strong>{eventTime(e)}</strong>
                  </div>
                  <div className={`timeline-icon ${e.kind}`}>
                    <TravelSticker kind={e.kind} />
                  </div>
                  <div className="timeline-card">
                    <small>{zoneName(e.timezone)}</small>
                    <h3>{e.title}</h3>
                    <p>
                      {route
                        ? `${route.from.name} → ${route.to.name}`
                        : e.location?.name || e.place}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState kind="explore" title="这一天还没有安排" />
      )}
    </div>
  );
}
