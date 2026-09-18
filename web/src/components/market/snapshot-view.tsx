"use client";
import type { PublicSnapshot } from "../../../../shared/market";
import { localInput } from "@/lib/zoned-input";
import { zoneName, eventTime, eventEndDate } from "@/lib/time";
import { eventRoute } from "@/lib/event-route";
import { TicketRoute } from "../home/ticket-route";
import { TravelSticker } from "../travel-sticker";
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
        <div>
          <span className="market-tag">
            {days} 天 · {events.length} 个事项
          </span>
          <h2>{trip.title}</h2>
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
      {[...groups].map(([date, items]) => (
        <section className="market-day" key={date}>
          <h3>{date}</h3>
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
        </section>
      ))}
    </div>
  );
}
