"use client";
import { useState } from "react";
import { CheckCheck, RotateCcw, CircleX, LoaderCircle } from "lucide-react";
import type { TripEvent } from "@/lib/models";
import { api, ApiError } from "@/lib/api";
import {
  isPlanned,
  eventStatusLabel,
  type EventStatus,
} from "../../../../shared/event-status";
export function EventStatusActions({
  event,
  onChanged,
  onRefresh,
}: {
  event: TripEvent;
  onChanged: (event: TripEvent) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  async function change(status: EventStatus) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ status: EventStatus; version: number }>(
        `/events/${event.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, version: event.version }),
        },
      );
      await onChanged({ ...event, ...result });
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="event-status-controls">
      <p>
        {isPlanned(event)
          ? "提前结束或不再前往，可以从首页移除这项安排。"
          : `${eventStatusLabel(event.status)}，首页不再展示。恢复后按原计划时间显示。`}
      </p>
      <small>资料和账本保留，不会取消实际预订。</small>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="event-status-buttons">
        {conflict ? (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRefresh();
                setConflict(false);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            刷新事项
          </button>
        ) : isPlanned(event) ? (
          <>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void change("completed")}
            >
              <CheckCheck size={17} />
              标记已结束
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void change("cancelled")}
            >
              <CircleX size={17} />
              取消事项
            </button>
          </>
        ) : (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void change("planned")}
          >
            <RotateCcw size={17} />
            恢复安排
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          <LoaderCircle size={16} className="animate-spin" />
          正在保存…
        </p>
      )}
    </div>
  );
}
