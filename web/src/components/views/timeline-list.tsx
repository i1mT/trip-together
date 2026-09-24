"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowUpRight, GripVertical } from "lucide-react";
import type { TripEvent } from "@/lib/models";
import { eventStatusLabel } from "../../../../shared/event-status";
import { eventTime, zoneName } from "@/lib/time";
import { TravelSticker } from "../travel-sticker";

const LONG_PRESS_MS = 450;

/**
 * 安排列表：长按后整项跟手拖动，其余项实时让位（transform 过渡）。
 * 各项目绝对定位并按顺序累加高度算出纵向位置，顺序变化时用过渡自动补间。
 */
export function TimelineList({
  events,
  onOpen,
  onReorder,
}: {
  events: TripEvent[];
  onOpen: (event: TripEvent) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState<string[]>(() => events.map((e) => e.id));
  // 事件处理器可能拿到旧闭包，用 ref 作为顺序的同步真源。
  const orderRef = useRef<string[]>(order);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  dragRef.current = dragId;
  const [dragY, setDragY] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppress = useRef(false);
  const gesture = useRef<{
    id: string;
    pointerId: number;
    grabOffset: number;
  } | null>(null);

  // events 每次渲染都是新数组，用 id 串作为依赖，避免无谓重置拖拽中的顺序。
  const eventsKey = events.map((e) => e.id).join(",");
  useEffect(() => {
    const ids = events.map((e) => e.id);
    orderRef.current = ids;
    setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);

  // 顺序或内容变化后重新测量每项高度，作为绝对定位的基准。
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let changed = false;
    for (const [id, element] of itemRefs.current) {
      const height = element.offsetHeight;
      next[id] = height;
      if (heights[id] !== height) changed = true;
    }
    if (changed) setHeights(next);
  }, [events, order, heights]);

  // 拖拽时阻止页面滚动。
  useEffect(() => {
    if (!dragId) return;
    const block = (event: TouchEvent) => event.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [dragId]);

  const offsets: Record<string, number> = {};
  let total = 0;
  for (const id of order) {
    offsets[id] = total;
    total += heights[id] ?? 0;
  }
  const listTop = () => listRef.current?.getBoundingClientRect().top ?? 0;

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function swap(indexA: number, indexB: number) {
    const next = [...orderRef.current];
    [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
    orderRef.current = next;
    setOrder(next);
  }
  function startPress(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    clearTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = {
      id,
      pointerId: event.pointerId,
      grabOffset: event.clientY - rect.top,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 某些环境不支持指针捕获，忽略即可。
    }
    timer.current = setTimeout(() => {
      if (!gesture.current) return;
      setDragId(id);
      suppress.current = true;
      // 从该项当前的槽位开始跟手，避免激活瞬间跳动。
      setDragY(offsets[id] ?? 0);
    }, LONG_PRESS_MS);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!gesture.current || !dragRef.current) return;
    const pointerY = event.clientY - listTop();
    setDragY(pointerY - gesture.current.grabOffset);
    const current = orderRef.current;
    const index = current.indexOf(dragRef.current);
    if (index > 0) {
      const previous = current[index - 1];
      const mid = offsets[previous] + (heights[previous] ?? 0) / 2;
      if (pointerY < mid) {
        swap(index, index - 1);
        return;
      }
    }
    if (index >= 0 && index < current.length - 1) {
      const next = current[index + 1];
      const mid = offsets[next] + (heights[next] ?? 0) / 2;
      if (pointerY > mid) swap(index, index + 1);
    }
  }
  function finish() {
    clearTimer();
    const wasDragging = Boolean(dragRef.current && gesture.current);
    gesture.current = null;
    setDragId(null);
    if (!wasDragging) return;
    // 拖拽后抑制紧随其后的 click，稍后再恢复，避免吞掉下一次正常点击。
    window.setTimeout(() => {
      suppress.current = false;
    }, 300);
    const finalOrder = orderRef.current;
    const initial = events.map((event) => event.id);
    if (finalOrder.some((id, index) => id !== initial[index]))
      onReorder(finalOrder);
  }

  return (
    <div
      className="timeline"
      ref={listRef}
      style={{ height: total }}
      aria-label="安排列表"
    >
      {events.map((event) => {
        const dragging = dragId === event.id;
        const y = dragging ? dragY : (offsets[event.id] ?? 0);
        return (
          <button
            key={event.id}
            ref={(element) => {
              if (element) itemRefs.current.set(event.id, element);
              else itemRefs.current.delete(event.id);
            }}
            className="timeline-event"
            data-event-id={event.id}
            data-dragging={dragging ? "true" : "false"}
            style={{ transform: `translateY(${y}px)` }}
            onClick={() => {
              if (suppress.current) {
                suppress.current = false;
                return;
              }
              onOpen(event);
            }}
            onPointerDownCapture={(event) => startPress(event.currentTarget.dataset.eventId ?? "", event)}
            onPointerMoveCapture={move}
            onPointerUpCapture={finish}
            onPointerCancelCapture={finish}
          >
            <span className="timeline-drag-handle" aria-hidden="true">
              <GripVertical size={15} />
            </span>
            <div className="timeline-time">
              <strong>{eventTime(event)}</strong>
              {!eventStatusLabel(event.status) && (
                <span>{event.certainty === "suggested" ? "建议" : "已确认"}</span>
              )}
            </div>
            <div className={`timeline-icon ${event.kind}`}>
              <TravelSticker kind={event.kind} />
            </div>
            <div className="timeline-card">
              <small>
                {zoneName(event.timezone)}
                {event.code ? ` · ${event.code}` : ""}
              </small>
              <h3>{event.title}</h3>
              {eventStatusLabel(event.status) && (
                <span className={`event-status-tag ${event.status}`}>
                  {eventStatusLabel(event.status)}
                </span>
              )}
              <p>{event.subtitle}</p>
              <span className="timeline-link">
                查看详情与资料
                <ArrowUpRight size={15} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
