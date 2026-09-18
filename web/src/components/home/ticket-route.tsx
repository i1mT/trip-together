import { ArrowRight } from "lucide-react";
import type { TripEvent } from "@/lib/models";
import { eventRoute } from "@/lib/event-route";
import {
  eventTime,
  eventEndDate,
  dateLabel,
  zoneName,
  type EventTiming,
} from "@/lib/time";
import { TravelSticker } from "../travel-sticker";

export function TicketRoute({
  event,
}: {
  event: EventTiming &
    Pick<TripEvent, "from" | "to" | "place"> & { subtitle?: string };
}) {
  const route = eventRoute(event);
  if (!route) return null;
  const endZone = event.endTimezone ?? event.timezone;
  return (
    <div className="ticket-route">
      <div className="route-endpoint">
        <small>起点</small>
        <strong>{route.from.name}</strong>
        <span>
          {route.from.code}
          {route.from.code && " · "}
          {route.from.detail}
        </span>
        <time>{eventTime(event)}</time>
        <small>
          {dateLabel(event.start, event.timezone).split("星期")[0]} ·{" "}
          {zoneName(event.timezone)}
        </small>
      </div>
      <div className="ticket-route-direction" aria-hidden="true">
        <TravelSticker kind={event.kind} />
        <ArrowRight size={22} />
      </div>
      <div className="route-endpoint">
        <small>终点</small>
        <strong>{route.to.name}</strong>
        <span>
          {route.to.code}
          {route.to.code && " · "}
          {route.to.detail}
        </span>
        <time>{eventTime(event, true)}</time>
        <small>
          {eventEndDate(event).split("星期")[0]} · {zoneName(endZone)}
        </small>
      </div>
    </div>
  );
}
