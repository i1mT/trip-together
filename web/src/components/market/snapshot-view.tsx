"use client";
import type { PublicSnapshot } from "../../../../shared/market";
import { localInput } from "@/lib/zoned-input";
import { zoneName } from "@/lib/time";
import { EventIcon } from "../ui";
export function SnapshotView({ snapshot }: { snapshot: PublicSnapshot }) {
  const { trip, events } = snapshot;
  const days =
    Math.round(
      (Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86400000,
    ) + 1;
  const groups = Map.groupBy(events, (e) =>
    localInput(e.start, e.timezone).slice(0, 10),
  );
  return (
    <div className="market-preview">
      <div className="market-summary">
        <span className="market-tag">
          {days} 天 · {events.length} 个事项
        </span>
        <h2>{trip.title}</h2>
        <p>
          {trip.destinations.map((d) => d.name).join(" · ") ||
            zoneName(trip.timezone)}
        </p>
        <small>
          原行程日期 {trip.start_date} — {trip.end_date}
        </small>
      </div>
      {[...groups].map(([date, items]) => (
        <section className="market-day" key={date}>
          <h3>{date}</h3>
          <div className="market-events">
            {items.map((e, index) => (
              <article key={index} className="market-event">
                <span className="market-event-icon">
                  <EventIcon kind={e.kind} />
                </span>
                <div>
                  <h4>{e.title}</h4>
                  <p>
                    {e.timeMode === "date"
                      ? "时间待定"
                      : `${localInput(e.start, e.timezone).slice(11)}${e.timeRange ? ` — ${localInput(e.end, e.endTimezone ?? e.timezone).replace("T", " ")}` : ""}`}{" "}
                    · {zoneName(e.timezone)}
                  </p>
                  {e.timeRange &&
                    e.endTimezone &&
                    e.endTimezone !== e.timezone && (
                      <small>结束时间：{zoneName(e.endTimezone)}</small>
                    )}
                  {e.dateEnd && <small>至 {e.dateEnd}</small>}
                  {(e.from || e.to) && (
                    <p>
                      {e.from || "起点待定"} → {e.to || "终点待定"}
                    </p>
                  )}
                  {e.departureLocation && (
                    <p>
                      出发：{e.departureLocation.name} ·{" "}
                      {e.departureLocation.address}
                    </p>
                  )}
                  <p>{e.location?.name || e.place}</p>
                  <small>{e.location?.address || e.address}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
