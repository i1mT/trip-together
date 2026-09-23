"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Pause, Play, Share2 } from "lucide-react";
import type { TripData, TripEvent } from "@/lib/models";
import { buildRoute } from "@/lib/route-geometry";
import { EmptyState } from "../empty-state";
import { Sheet } from "../ui";
import { useRouteMapView } from "./route-map-view";

export function RouteMapSheet({
  open,
  data,
  onClose,
  onEvent,
  onPoster,
}: {
  open: boolean;
  data: TripData;
  onClose: () => void;
  onEvent: (event: TripEvent) => void;
  onPoster: () => void;
}) {
  const route = useMemo(() => buildRoute(data.events), [data.events]);
  const view = useRouteMapView({ open, route, data, onEvent });
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [missingOpen, setMissingOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // 播放期间收起所有控件，录屏里只有地图与路线动画；点屏幕可临时显示控件。
  useEffect(() => {
    if (view.playing) setRevealed(false);
  }, [view.playing]);
  const immersive = view.playing && !revealed;

  const days = useMemo(
    () => [...new Set(route.points.map((point) => point.date))].sort(),
    [route.points],
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="行程路线"
      className={`route-sheet${immersive ? " is-immersive" : ""}`}
      titleExtra={
        <button
          type="button"
          className="text-action"
          onClick={onPoster}
          disabled={!view.hasStops}
        >
          <Share2 size={15} />
          生成海报
        </button>
      }
    >
      <div className="route-map-body">
        {!view.hasStops ? (
          <div className="route-map-empty">
            <EmptyState
              kind="explore"
              title="安排还没有地点"
              text="给安排添加地点后，就能在这里看到整趟行程的路线。"
            />
            {route.missing.length > 0 && (
              <p className="route-map-empty-note">
                {route.missing.length} 项安排没有坐标，添加地点后即可显示。
              </p>
            )}
          </div>
        ) : (
          <>
            <div
              className="route-map-canvas"
              ref={view.setContainer}
              data-map-ready={view.ready ? "true" : "false"}
              data-map-playing={view.playing ? "true" : "false"}
              data-visible-stops={String(view.visibleStops)}
              data-visible-stickers={String(view.visibleStickers)}
              aria-label="行程路线地图"
            />
            {!view.created && !view.failed && (
              <div className="route-map-status" role="status">
                正在加载地图…
              </div>
            )}
            {view.failed && (
              <div className="route-map-status route-map-failed" role="alert">
                {view.failed}
                <ul className="route-map-fallback">
                  {route.stops.map((stop, index) => (
                    <li key={stop.key}>
                      第 {index + 1} 站 · {stop.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {days.length > 1 && (
              <div className="route-day-filter" aria-label="按日期筛选路线">
                <button
                  type="button"
                  disabled={view.playing}
                  className={view.selectedDay === "" ? "selected" : ""}
                  aria-pressed={view.selectedDay === ""}
                  onClick={() => view.setSelectedDay("")}
                >
                  全程
                </button>
                {days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    disabled={view.playing}
                    className={view.selectedDay === day ? "selected" : ""}
                    aria-pressed={view.selectedDay === day}
                    onClick={() =>
                      view.setSelectedDay(view.selectedDay === day ? "" : day)
                    }
                  >
                    {day.slice(5).replace("-", ".")}
                  </button>
                ))}
              </div>
            )}
            {route.missing.length > 0 && (
              <div className="route-missing">
                <button
                  type="button"
                  className="route-missing-toggle"
                  aria-expanded={missingOpen}
                  onClick={() => setMissingOpen((value) => !value)}
                >
                  <AlertCircle size={15} />
                  {route.missing.length} 项安排没有坐标
                  <ChevronDown
                    size={15}
                    className={missingOpen ? "rotated" : ""}
                  />
                </button>
                {missingOpen && (
                  <ul className="route-missing-list">
                    {route.missing.map((item) => (
                      <li key={item.eventId}>
                        <button
                          type="button"
                          onClick={() => {
                            const event = data.events.find(
                              (entry) => entry.id === item.eventId,
                            );
                            if (event) handler.current(event);
                          }}
                        >
                          <strong>{item.title || "未命名安排"}</strong>
                          <small>{item.date}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {immersive && (
              <button
                type="button"
                className="route-immersive-catch"
                aria-label="显示播放控件"
                onClick={() => setRevealed(true)}
              />
            )}
            <div className="route-play">
              <span className="route-play-track" aria-hidden="true">
                <span className="route-play-bar" ref={view.bar} />
              </span>
              <button
                type="button"
                className="route-play-button"
                aria-label={
                  view.playing
                    ? "停止播放"
                    : view.played
                      ? "重新播放路线"
                      : "播放路线"
                }
                onClick={view.togglePlay}
              >
                {view.playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
