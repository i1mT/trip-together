"use client";
import { eventStatusLabel } from "../../../../shared/event-status";
import { EventStatusActions } from "../events/status-actions";
import { mapLink } from "../../../../shared/places";
import { useState } from "react";
import { useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  Map as MapIcon,
  MapPin,
  Phone,
  Clock3,
  CalendarDays,
  ArrowRight,
  AlertCircle,
  GripVertical,
} from "lucide-react";
import type { TripData, TripDocument, TripEvent } from "@/lib/models";
import {
  localDate,
  dateLabel,
  clockTime,
  zoneName,
  eventTime,
  eventEndDate,
} from "@/lib/time";
import { TravelSticker } from "../travel-sticker";
import { EmptyState } from "../empty-state";
import { AiGuideEntry } from "../ai-guide";
import { EventIcon, SheetFooter, Sheet, SectionTitle } from "../ui";
import { PreparationChecklist } from "../preparation/checklist";
import { EventEditor } from "../editors/event-editor";
import { RouteMapSheet } from "../map/route-map-sheet";
import { TripPosterSheet } from "../map/poster-sheet";
import { api } from "@/lib/api";
import { DocumentRow } from "./documents";
import { useToast } from "../toast";
export function Itinerary({
  data,
  onRefresh,
  now,
  onEvent,
  onPreview,
}: {
  data: TripData;
  onRefresh: () => Promise<void>;
  now: number;
  onEvent: (e: TripEvent) => void;
  onPreview: (date: number) => void;
}) {
  const { events } = data;
  const [editing, setEditing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const toast = useToast();
  const [mapOpen, setMapOpen] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const tripDays: string[] = [];
  for (
    let day = data.trip.start_date;
    day <= data.trip.end_date && tripDays.length < 730;
  ) {
    tripDays.push(day);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  const days = [
    ...new Set([
      ...tripDays,
      ...events.map((e) => localDate(e.start, e.timezone)),
    ]),
  ].sort();
  const [selected, setSelected] = useState(
    now < Date.parse(events[0]?.start ?? data.trip.start_date)
      ? "preparation"
      : days.includes(localDate(now, data.trip.timezone))
        ? localDate(now, data.trip.timezone)
        : (days[0] ?? "preparation"),
  );
  const filtered = events.filter(
    (e) => localDate(e.start, e.timezone) === selected,
  );
  function clearDragTimer() {
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = null;
  }
  function beginLongPress(id: string) {
    clearDragTimer();
    dragTimer.current = setTimeout(() => {
      setDraggingId(id);
      suppressClick.current = true;
    }, 450);
  }
  function finishDrag() {
    clearDragTimer();
    setDraggingId(null);
    setDragOverId(null);
  }
  async function reorderEvents(fromId: string, toId: string) {
    if (fromId === toId) return finishDrag();
    const visibleIds = filtered.map((event) => event.id);
    const moved = visibleIds.filter((id) => id !== fromId);
    const target = moved.indexOf(toId);
    moved.splice(target < 0 ? moved.length : target, 0, fromId);
    const cursor = { value: 0 };
    const ids = events.map((event) =>
      visibleIds.includes(event.id) ? moved[cursor.value++] : event.id,
    );
    try {
      await api("/events/order", {
        method: "PATCH",
        body: JSON.stringify({ ids }),
      });
      await onRefresh();
      toast("安排顺序已更新");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      finishDrag();
    }
  }
  return (
    <section className="page-content">
      <div className="page-title">
        <div className="page-heading-row">
          <h1>完整行程</h1>
          <button
            className="icon-button page-add-button"
            aria-label="查看路线图"
            onClick={() => setMapOpen(true)}
          >
            <MapIcon size={22} />
          </button>
          <button
            className="icon-button page-add-button"
            aria-label="添加安排"
            onClick={() => setEditing(true)}
          >
            <Plus size={23} />
          </button>
        </div>
        <p className="muted">
          {data.trip.start_date} — {data.trip.end_date} · 完整行程
        </p>
      </div>
      {editing && (
        <EventEditor
          data={data}
          initialDate={
            selected === "preparation" ? data.trip.start_date : selected
          }
          onClose={() => setEditing(false)}
          onSaved={async (date) => {
            await onRefresh();
            if (date) setSelected(date);
          }}
        />
      )}
      <div className="day-picker" aria-label="选择行程日期">
        <button
          className={`day-chip ${selected === "preparation" ? "selected" : ""}`}
          aria-pressed={selected === "preparation"}
          onClick={() => setSelected("preparation")}
        >
          <small>准备清单</small>
          <strong>出发前</strong>
          <span>随时查看</span>
        </button>
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
      {selected === "preparation" ? (
        <PreparationChecklist
          items={data.preparation}
          checked={data.packing}
          onRefresh={onRefresh}
        />
      ) : (
        <>
          <div className="section-heading">
            <h2>{filtered[0]?.place}</h2>
            <span className="list-caption">{filtered.length} 项安排</span>
          </div>
          {!filtered.length && (
            <EmptyState
              kind="explore"
              title="这一天还没有安排"
              text="可以先添加活动名称，具体时间稍后完善。"
              action="添加当天安排"
              onAction={() => setEditing(true)}
              extra={<AiGuideEntry className="text-action ai-guide-entry" />}
            />
          )}
          <div className="timeline">
            {filtered.map((e) => (
              <button
                key={e.id}
                className="timeline-event"
                draggable
                data-dragging={draggingId === e.id ? "true" : "false"}
                data-drag-over={dragOverId === e.id ? "true" : "false"}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onEvent(e);
                }}
                onPointerDown={() => beginLongPress(e.id)}
                onPointerEnter={() => {
                  if (draggingId && draggingId !== e.id) setDragOverId(e.id);
                }}
                onPointerUp={() => {
                  clearDragTimer();
                  if (draggingId && dragOverId) {
                    void reorderEvents(draggingId, dragOverId);
                  } else {
                    finishDrag();
                  }
                }}
                onPointerCancel={finishDrag}
                onDragStart={() => {
                  setDraggingId(e.id);
                  suppressClick.current = true;
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggingId && draggingId !== e.id) setDragOverId(e.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingId) void reorderEvents(draggingId, e.id);
                }}
                onDragEnd={finishDrag}
              >
                <span className="timeline-drag-handle" aria-hidden="true">
                  <GripVertical size={15} />
                </span>
                <div className="timeline-time">
                  <strong>{eventTime(e)}</strong>
                  {!eventStatusLabel(e.status) && (
                    <span>
                      {e.certainty === "suggested" ? "建议" : "已确认"}
                    </span>
                  )}
                </div>
                <div className={`timeline-icon ${e.kind}`}>
                  <TravelSticker kind={e.kind} />
                </div>
                <div className="timeline-card">
                  <small>
                    {zoneName(e.timezone)}
                    {e.code ? ` · ${e.code}` : ""}
                  </small>
                  <h3>{e.title}</h3>
                  {eventStatusLabel(e.status) && (
                    <span className={`event-status-tag ${e.status}`}>
                      {eventStatusLabel(e.status)}
                    </span>
                  )}
                  <p>{e.subtitle}</p>
                  <span className="timeline-link">
                    查看详情与资料
                    <ArrowUpRight size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {filtered.length > 0 && (
            <button
              className="secondary-button w-full"
              onClick={() => onPreview(Date.parse(filtered[0].start) + 60000)}
            >
              <Clock3 size={17} />
              预览这一天的首页
            </button>
          )}
          <p className="preview-hint">
            预览仅改变显示时间，随时可以返回实时行程。
          </p>
        </>
      )}
      <RouteMapSheet
        open={mapOpen}
        data={data}
        onClose={() => setMapOpen(false)}
        onEvent={onEvent}
        onPoster={() => {
          setMapOpen(false);
          setPosterOpen(true);
        }}
      />
      <TripPosterSheet
        open={posterOpen}
        data={data}
        onClose={() => setPosterOpen(false)}
      />
    </section>
  );
}
export function EventDetail({
  event,
  data,
  onClose,
  onDocument,
  onEdit,
  onDelete,
  onStatusChanged,
  onRefresh,
}: {
  event: TripEvent | null;
  data: TripData;
  onClose: () => void;
  onDocument: (d: TripDocument) => void;
  onEdit: (e: TripEvent, step?: 1 | 4) => void;
  onDelete: (e: TripEvent) => void;
  onStatusChanged: (event: TripEvent) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  if (!event) return null;
  const docs = data.documents.filter((d) => event.documents.includes(d.id));
  return (
    <Sheet
      open
      onClose={onClose}
      title={event.title}
      description={event.subtitle}
    >
      <div className="event-detail">
        <span className="detail-kind">
          <EventIcon kind={event.kind} />
          {eventStatusLabel(event.status) ||
            (event.certainty === "confirmed" ? "安排已确认" : "计划中")}
        </span>
        {event.from && (
          <div className="flight-route">
            <div>
              <strong>{event.from}</strong>
              <span>{eventTime(event)}</span>
            </div>
            <div className="flight-line">
              <span>{event.code}</span>
              <ArrowRight size={24} />
            </div>
            <div>
              <strong>{event.to}</strong>
              <span>{eventTime(event, true)}</span>
            </div>
          </div>
        )}
        <div className="detail-row">
          <CalendarDays size={19} />
          <span>
            {dateLabel(event.start, event.timezone)}
            <small>
              {eventTime(event)} · {zoneName(event.timezone)}
              {event.certainty === "suggested" ? "（建议时段）" : ""}
            </small>
          </span>
        </div>
        {(event.timeRange === true ||
          (event.timeRange === undefined &&
            (event.kind === "flight" || event.kind === "stay"))) && (
          <div className="detail-row">
            <Clock3 size={19} />
            <span>
              {event.kind === "stay"
                ? "退房："
                : event.kind === "flight"
                  ? "抵达："
                  : "结束："}
              {eventEndDate(event)}
              <small>
                {eventTime(event, true)} ·{" "}
                {zoneName(event.endTimezone ?? event.timezone)}
              </small>
            </span>
          </div>
        )}
        <div className="detail-row">
          <MapPin size={19} />
          <span>
            {event.place}
            <small>{event.address}</small>
          </span>
        </div>
        {(event.location || event.address) && (
          <a
            className="secondary-button w-full"
            target="_blank"
            rel="noreferrer"
            href={
              event.location
                ? mapLink(event.location)
                : `https://maps.apple.com/?q=${encodeURIComponent(event.address ?? "")}`
            }
          >
            {event.location ? "打开地图导航" : "在地图中搜索"}
            <ArrowUpRight size={16} />
          </a>
        )}
        {event.phone && (
          <a className="detail-row text-action" href={`tel:${event.phone}`}>
            <Phone size={18} />
            {event.phone}
          </a>
        )}
        {event.note && (
          <div className="detail-note">
            <AlertCircle size={18} />
            <p>{event.note}</p>
          </div>
        )}
        <EventStatusActions
          key={`${event.id}:${event.version}`}
          event={event}
          onChanged={onStatusChanged}
          onRefresh={onRefresh}
        />
        <SectionTitle>相关资料</SectionTitle>
        {docs.length ? (
          <>
            <div className="surface divided">
              {docs.map((d) => (
                <DocumentRow key={d.id} doc={d} onOpen={onDocument} />
              ))}
            </div>
            <button
              type="button"
              className="secondary-button event-add-documents"
              onClick={() => onEdit(event, 4)}
            >
              <Plus size={17} />
              添加更多资料
            </button>
          </>
        ) : (
          <EmptyState
            kind="luggage"
            title="尚未关联资料"
            text="可以直接上传图片、订单或关联已有资料。"
            action="关联资料"
            onAction={() => onEdit(event, 4)}
          />
        )}
        <p className="source-note">资料来源：{event.source || "手动添加"}</p>
        <SheetFooter>
          <button className="secondary-button" onClick={() => onEdit(event)}>
            修改安排
          </button>
          <button className="danger-button" onClick={() => onDelete(event)}>
            删除安排
          </button>
        </SheetFooter>
      </div>
    </Sheet>
  );
}
