"use client";
import {
  ArrowRight,
  MapPin,
  ChevronRight,
  Check,
  CalendarDays,
} from "lucide-react";
import type { TripData, TripEvent } from "@/lib/models";
import {
  countdown,
  eventTime,
  selectEvents,
  dateLabel,
  clockTime,
  zoneName,
  localDate,
} from "@/lib/time";
import { isPlanned } from "../../../../shared/event-status";
import { EventExtras } from "../home/event-extras";
import { LocalClock } from "../home/local-clock";
import { TicketRoute } from "../home/ticket-route";
import { eventRoute } from "@/lib/event-route";
import { TravelSticker } from "../travel-sticker";
import { Avatar } from "../avatar";
import { SectionTitle } from "../ui";
export function Today({
  data,
  now,
  realNow,
  preview,
  onExitPreview,
  onEvent,
  onNavigate,
}: {
  data: TripData;
  now: number;
  realNow: number;
  preview: boolean;
  onExitPreview: () => void;
  onEvent: (e: TripEvent) => void;
  onNavigate: (tab: string) => void;
}) {
  const activeEvents = data.events.filter(isPlanned);
  const { current, featured, finished } = selectEvents(data.events, now);
  const before =
      now < Date.parse(activeEvents[0]?.start ?? data.trip.start_date),
    zone = featured?.timezone ?? data.trip.timezone;
  const sameDay = activeEvents.filter(
    (e) =>
      localDate(e.start, e.timezone) ===
      localDate(before && featured ? featured.start : now, zone),
  );
  const route = featured ? eventRoute(featured) : null;
  return (
    <section className="page-content today-page">
      {featured && !finished ? (
        <article className="event-feature">
          <div className="ticket-body">
            <div className="feature-top">
              <span className={`status-pill ${current ? "live" : ""}`}>
                {current ? (
                  <>
                    <span className="live-dot" />
                    正在进行
                  </>
                ) : (
                  "下一项安排"
                )}
              </span>
              <LocalClock
                now={realNow}
                homeZone={data.trip.home_timezone}
                destinationZone={data.trip.timezone}
              />
            </div>
            <button
              className="ticket-content-button"
              onClick={() => onEvent(featured)}
              aria-label={`查看${featured.title}详情`}
            >
              <div className={`feature-main ${route ? "has-route" : ""}`}>
                {!route && <TravelSticker kind={featured.kind} />}
                <div>
                  <h1>{featured.title}</h1>
                  <p>{featured.subtitle}</p>
                </div>
              </div>
              <TicketRoute event={featured} />
              <div className={`feature-footer ${route ? "route-footer" : ""}`}>
                <span>
                  <CalendarDays size={14} />
                  {route ? (
                    featured.code ||
                    {
                      drive: "自驾行程",
                      flight: "航班",
                      transfer: "机场接驳",
                      explore: "活动路线",
                      stay: "住宿",
                    }[featured.kind]
                  ) : (
                    <>
                      {dateLabel(featured.start, zone).split("星期")[0]} ·
                      计划时间 <strong>{eventTime(featured)}</strong>
                    </>
                  )}
                </span>
                <span>
                  {!route && `${zoneName(zone)} · `}
                  {featured.certainty === "suggested" ? "计划中" : "安排已确认"}
                </span>
              </div>
            </button>
          </div>
          <div className="ticket-perforation" aria-hidden="true" />
          <button className="ticket-stub" onClick={() => onEvent(featured)}>
            <div className="event-countdown-block">
              <span>
                {preview ? "行程预览 · " : ""}
                {featured.timeMode === "date"
                  ? "日期已安排"
                  : featured.endUnspecified && Date.parse(featured.start) <= now
                    ? "已到计划开始时间"
                    : current
                      ? "距离本项结束"
                      : "距离开始"}
                {featured.certainty === "suggested" ? "（建议时间）" : ""}
              </span>
              <span className="event-countdown" data-testid="event-countdown">
                {featured.timeMode === "date"
                  ? featured.kind === "stay"
                    ? "入住时间待定"
                    : "时间待定"
                  : featured.endUnspecified && Date.parse(featured.start) <= now
                    ? "结束时间待定"
                    : countdown(current ? featured.end : featured.start, now)}
              </span>
            </div>
            <div className="ticket-bottom-row">
              <span className="ticket-member">
                <Avatar member={data.me} />
                {data.me.name}
              </span>
              <span className="ticket-detail-link">
                查看详情
                <ChevronRight size={15} />
              </span>
            </div>
          </button>
        </article>
      ) : (
        <div className="surface empty-state">
          <Check size={28} />
          <h3>
            {data.events.length
              ? activeEvents.length
                ? "行程已结束"
                : "暂无待进行的安排"
              : "还没有行程事项"}
          </h3>
          <p>
            {data.events.length
              ? "行程、资料和账本仍然可以随时查看。"
              : "前往完整行程，添加航班、住宿或活动。"}
          </p>
          <button
            className="text-action"
            onClick={() => onNavigate("itinerary")}
          >
            查看完整行程
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      {featured && !finished && (
        <EventExtras event={featured} events={activeEvents} onEvent={onEvent} />
      )}
      {preview && (
        <button className="text-action" onClick={onExitPreview}>
          返回实时
        </button>
      )}
      {!finished && (
        <>
          <SectionTitle
            action="完整行程"
            onClick={() => onNavigate("itinerary")}
          >
            {before ? "出发当天的安排" : "今天的安排"}
          </SectionTitle>
          <div className="surface day-agenda">
            {sameDay.length ? (
              sameDay.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onEvent(e)}
                  className="agenda-row"
                >
                  <span>{eventTime(e)}</span>
                  <div
                    className={
                      e.timeMode !== "date" &&
                      !e.endUnspecified &&
                      Date.parse(e.end) <= now
                        ? "agenda-dot done"
                        : "agenda-dot"
                    }
                  />
                  <div>
                    <strong>{e.title}</strong>
                    <small>
                      {e.certainty === "suggested"
                        ? "建议时段"
                        : zoneName(e.timezone)}
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <p className="muted">今天没有新的安排，可以查看后续行程资料。</p>
            )}
          </div>
        </>
      )}
      <div className="travel-footnote">
        <MapPin size={13} />
        <span>时间随行程地点显示 · 航班以最新通知为准</span>
      </div>
    </section>
  );
}
