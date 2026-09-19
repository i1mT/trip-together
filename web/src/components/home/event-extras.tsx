import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  BedDouble,
  ChevronRight,
  Info,
} from "lucide-react";
import type { TripEvent } from "@/lib/models";
import { dateLabel, eventTime } from "@/lib/time";
export function EventExtras({
  event,
  events,
  onEvent,
}: {
  event: TripEvent;
  events: TripEvent[];
  onEvent: (event: TripEvent) => void;
}) {
  const index = events.findIndex((item) => item.id === event.id);
  const previous = events[index - 1],
    next = events[index + 1];
  const stay = events.slice(index + 1).find((item) => item.kind === "stay");
  return (
    <div className="event-extras">
      <div className="event-neighbors">
        {previous && (
          <button onClick={() => onEvent(previous)} aria-label="查看上一项">
            <span>
              <ArrowLeft size={15} />
              上一项
            </span>
            <strong>{previous.title}</strong>
          </button>
        )}
        {next && (
          <button onClick={() => onEvent(next)} aria-label="查看下一项">
            <span>
              下一项
              <ArrowRight size={15} />
            </span>
            <strong>{next.title}</strong>
          </button>
        )}
      </div>
      {(event.note || event.address) && (
        <div className="surface event-reminder">
          <h2>
            <Info size={17} />
            本项提醒
          </h2>
          {event.note && <p>{event.note}</p>}
          {event.address && (
            <div>
              <MapPin size={15} />
              <span>{event.address}</span>
            </div>
          )}
        </div>
      )}
      {stay && (
        <button className="surface upcoming-stay" onClick={() => onEvent(stay)}>
          <span className="stay-icon">
            <BedDouble size={23} />
          </span>
          <span>
            <small>
              接下来的住宿 ·{" "}
              {dateLabel(stay.start, stay.timezone).split("星期")[0]}
            </small>
            <strong>{stay.title}</strong>
            <small>
              {eventTime(stay)} ·{" "}
              {stay.certainty === "suggested" ? "建议入住时间" : "计划入住时间"}
            </small>
          </span>
          <ChevronRight size={17} />
        </button>
      )}
    </div>
  );
}
