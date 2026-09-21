"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { AlertCircle, ChevronDown, Share2 } from "lucide-react";
import type { TripData, TripEvent } from "@/lib/models";
import { buildRoute, type RouteStop } from "@/lib/route-geometry";
import { mapStyleUrl } from "../../../../shared/map-source";
import { ensureRouteLayers, fitRouteBounds, ROUTE_SOURCE } from "./route-layer";
import { EmptyState } from "../empty-state";
import { Sheet } from "../ui";

type MapLibreModule = typeof import("maplibre-gl");

function markerElement(stop: RouteStop, index: number, total: number) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "route-stop-marker";
  if (index === 0) element.classList.add("is-first");
  if (index === total - 1) element.classList.add("is-last");
  element.setAttribute("aria-label", `第 ${index + 1} 站：${stop.name}`);
  const badge = document.createElement("span");
  badge.className = "route-stop-index";
  badge.textContent = String(index + 1);
  const name = document.createElement("span");
  name.className = "route-stop-name";
  name.textContent = stop.name;
  element.append(badge, name);
  return element;
}

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
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const module = useRef<MapLibreModule | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState(false);
  const [failed, setFailed] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [missingOpen, setMissingOpen] = useState(false);
  const hasStops = route.stops.length > 0;

  const days = useMemo(
    () => [...new Set(route.points.map((point) => point.date))].sort(),
    [route.points],
  );

  useEffect(() => {
    if (!open || !hasStops || !container) return;
    const node = container;
    let disposed = false;
    let instance: MapLibreMap | null = null;
    setReady(false);
    setCreated(false);
    setFailed("");
    (async () => {
      try {
        const maplibre = await (await import("./maplibre")).loadMapLibre();
        if (disposed) return;
        module.current = maplibre;
        instance = new maplibre.Map({
          container: node,
          style: mapStyleUrl,
          center: [route.stops[0].longitude, route.stops[0].latitude],
          zoom: 4,
          attributionControl: { compact: true },
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
        map.current = instance;
        instance.on("load", () => {
          if (!disposed) setReady(true);
        });
        instance.on("error", () => {
          if (!disposed) setFailed("底图加载失败，可以稍后重试");
        });
        setCreated(true);
      } catch {
        if (!disposed) setFailed("地图组件加载失败，请检查网络后重试");
      }
    })();
    return () => {
      disposed = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance?.remove();
      map.current = null;
      module.current = null;
      setReady(false);
      setCreated(false);
    };
  }, [open, hasStops, container, route.stops]);

  useEffect(() => {
    const instance = map.current,
      maplibre = module.current;
    if (!instance || !created || !maplibre) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = route.stops.map((stop, index) => {
      const element = markerElement(stop, index, route.stops.length);
      element.addEventListener("click", () => {
        const event = data.events.find((item) => item.id === stop.eventIds[0]);
        if (event) handler.current(event);
      });
      return new maplibre.Marker({ element })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(instance);
    });
  }, [created, route, data.events]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    ensureRouteLayers(instance, route);
    fitRouteBounds(instance, route);
  }, [ready, route]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const filter =
      selectedDay === ""
        ? (["all"] as never)
        : ([
            "any",
            ["==", ["get", "day"], selectedDay],
            ["==", ["get", "fromDay"], selectedDay],
          ] as never);
    for (const id of [`${ROUTE_SOURCE}-line`, `${ROUTE_SOURCE}-arc`])
      if (instance.getLayer(id)) instance.setFilter(id, filter);
  }, [selectedDay, ready]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="行程路线"
      className="route-sheet"
      titleExtra={
        <button
          type="button"
          className="text-action"
          onClick={onPoster}
          disabled={!hasStops}
        >
          <Share2 size={15} />
          生成海报
        </button>
      }
    >
      <div className="route-map-body">
        {!hasStops ? (
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
              ref={setContainer}
              data-map-ready={ready ? "true" : "false"}
              aria-label="行程路线地图"
            />
            {!created && !failed && (
              <div className="route-map-status" role="status">
                正在加载地图…
              </div>
            )}
            {failed && (
              <div className="route-map-status route-map-failed" role="alert">
                {failed}
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
                  className={selectedDay === "" ? "selected" : ""}
                  aria-pressed={selectedDay === ""}
                  onClick={() => setSelectedDay("")}
                >
                  全程
                </button>
                {days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={selectedDay === day ? "selected" : ""}
                    aria-pressed={selectedDay === day}
                    onClick={() =>
                      setSelectedDay(selectedDay === day ? "" : day)
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
          </>
        )}
      </div>
    </Sheet>
  );
}
