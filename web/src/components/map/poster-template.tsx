"use client";
import { forwardRef } from "react";
import type { TripData } from "@/lib/models";
import { buildRoute } from "@/lib/route-geometry";
import { TravelSticker } from "../travel-sticker";

function dayCount(start: string, end: string) {
  const from = Date.parse(`${start}T12:00:00Z`),
    to = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
  return Math.round((to - from) / 86400000) + 1;
}

export const PosterTemplate = forwardRef<
  HTMLDivElement,
  { data: TripData; image: string | null }
>(function PosterTemplate({ data, image }, ref) {
  const route = buildRoute(data.events);
  const first = route.points[0],
    last = route.points[route.points.length - 1];
  const destinations = (data.trip.destinations ?? [])
    .map((destination) => destination.name.split("·")[0].trim())
    .filter(Boolean)
    .slice(0, 3);
  const planned = data.events.filter(
    (event) => event.status !== "cancelled",
  ).length;
  return (
    <div className="poster" ref={ref}>
      <div className="poster-head">
        <TravelSticker kind="flight" className="poster-sticker" />
        <h3 className="poster-title">{data.trip.title}</h3>
        <p className="poster-dates">
          {data.trip.start_date} — {data.trip.end_date}
          <span>
            {" "}
            · {dayCount(data.trip.start_date, data.trip.end_date)} 天
          </span>
        </p>
      </div>
      <div className="poster-map">
        {image ? (
          <img src={image} alt="" />
        ) : (
          <div className="poster-map-fallback">
            {route.stops.map((stop, index) => (
              <span key={stop.key}>
                {index > 0 && <i>›</i>}
                {stop.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {first && last && route.points.length > 1 && (
        <div className="poster-route">
          <div>
            <small>起点</small>
            <strong>{first.name}</strong>
          </div>
          <span className="poster-route-line" aria-hidden="true" />
          <div>
            <small>终点</small>
            <strong>{last.name}</strong>
          </div>
        </div>
      )}
      <div className="poster-meta">
        {destinations.length > 0 && <span>{destinations.join(" · ")}</span>}
        <span>{planned} 项安排</span>
        <span>{route.stops.length} 个地点</span>
      </div>
      <p className="poster-foot">地图数据 © OpenStreetMap contributors</p>
    </div>
  );
});
