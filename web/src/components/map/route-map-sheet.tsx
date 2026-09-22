"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { AlertCircle, ChevronDown, Pause, Play, Share2 } from "lucide-react";
import type { TripData, TripEvent } from "@/lib/models";
import { buildRoute, type RouteStop } from "@/lib/route-geometry";
import { mapStyleUrl } from "../../../../shared/map-source";
import {
  ARROW_LAYER,
  ensureRouteLayers,
  fitRouteBounds,
  ROUTE_POINT_SOURCE,
  ROUTE_SOURCE,
  STICKER_LAYER,
} from "./route-layer";
import { segmentSticker } from "./stickers";
import { EmptyState } from "../empty-state";
import { Sheet } from "../ui";

const PROGRESS_SOURCE = "trip-route-progress";
const PROGRESS_LAYER = "trip-route-progress-line";
const SEGMENT_DURATION = 1100;

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
  const runner = useRef<{
    marker: MapLibreMarker;
    sticker: HTMLSpanElement;
    kind: string;
  } | null>(null);
  const frame = useRef(0);
  const bar = useRef<HTMLSpanElement>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState(false);
  const [failed, setFailed] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [missingOpen, setMissingOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const hasStops = route.stops.length > 0;

  const days = useMemo(
    () => [...new Set(route.points.map((point) => point.date))].sort(),
    [route.points],
  );

  /**
   * 按行程顺序把各段坐标拼成完整轨迹：累计距离、每个顶点所属的段与段类型，
   * 以及每个去重地点首次到达时的距离（用于播放时逐个点亮站点）。
   */
  const journey = useMemo(() => {
    const coordinates: [number, number][] = [];
    const cumulative: number[] = [];
    const kinds: string[] = [];
    const segmentOf: number[] = [];
    const pointDistances: number[] = [0];
    let total = 0;
    route.segments.forEach((segment, segmentIndex) => {
      for (const point of segment.coordinates) {
        const previous = coordinates[coordinates.length - 1];
        if (previous)
          total += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        coordinates.push(point);
        cumulative.push(total);
        kinds.push(segment.kind);
        segmentOf.push(segmentIndex);
      }
      pointDistances.push(total);
    });
    const firstVisit = new Map<string, number>();
    route.points.forEach((point, index) => {
      if (!firstVisit.has(point.key))
        firstVisit.set(point.key, pointDistances[index] ?? 0);
    });
    const stopDistances = route.stops.map(
      (stop) => firstVisit.get(stop.key) ?? 0,
    );
    return {
      coordinates,
      cumulative,
      kinds,
      segmentOf,
      stopDistances,
      total,
    };
  }, [route.segments, route.points, route.stops]);

  /** 结束播放并把地图恢复成静态路线。 */
  const stopPlayback = useCallback(
    (resetCamera = true) => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      const instance = map.current;
      if (instance) {
        instance.setPaintProperty(`${ROUTE_SOURCE}-line`, "line-opacity", 0.85);
        instance.setPaintProperty(`${ROUTE_SOURCE}-arc`, "line-opacity", 0.9);
        for (const id of [
          `${ROUTE_POINT_SOURCE}-start`,
          `${ROUTE_POINT_SOURCE}-end`,
        ])
          if (instance.getLayer(id))
            instance.setPaintProperty(id, "circle-opacity", 1);
        for (const id of [ARROW_LAYER, STICKER_LAYER])
          if (instance.getLayer(id)) instance.setFilter(id, ["all"] as never);
        const source = instance.getSource(PROGRESS_SOURCE) as
          { setData: (value: FeatureCollection) => void } | undefined;
        source?.setData({ type: "FeatureCollection", features: [] });
      }
      markers.current.forEach((marker) => {
        const element = marker.getElement();
        if (element) element.style.visibility = "";
      });
      runner.current?.marker.remove();
      runner.current = null;
      if (bar.current) bar.current.style.width = "0%";
      setPlaying(false);
      if (resetCamera && instance) fitRouteBounds(instance, route);
    },
    [route],
  );

  useEffect(() => {
    if (!open) stopPlayback();
  }, [open, stopPlayback]);

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
      stopPlayback();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance?.remove();
      map.current = null;
      module.current = null;
      setReady(false);
      setCreated(false);
    };
  }, [open, hasStops, container, route.stops, stopPlayback]);

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
    void ensureRouteLayers(instance, route);
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

  function play() {
    const instance = map.current,
      maplibre = module.current;
    if (!instance || !maplibre || !journey.total || !journey.coordinates.length)
      return;
    stopPlayback(false);
    setPlayed(false);

    if (!instance.getSource(PROGRESS_SOURCE)) {
      instance.addSource(PROGRESS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer({
        id: PROGRESS_LAYER,
        type: "line",
        source: PROGRESS_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#6c4c96",
          "line-width": 4.5,
          "line-opacity": 0.95,
        },
      });
    }

    // 开场先清空：没有路线，只有一条随播放画出来的新线。
    instance.setPaintProperty(`${ROUTE_SOURCE}-line`, "line-opacity", 0);
    instance.setPaintProperty(`${ROUTE_SOURCE}-arc`, "line-opacity", 0);
    for (const id of [
      `${ROUTE_POINT_SOURCE}-start`,
      `${ROUTE_POINT_SOURCE}-end`,
    ])
      if (instance.getLayer(id))
        instance.setPaintProperty(id, "circle-opacity", 0);
    for (const id of [ARROW_LAYER, STICKER_LAYER])
      if (instance.getLayer(id))
        instance.setFilter(id, ["==", ["get", "index"], -1] as never);
    markers.current.forEach((marker) => {
      const element = marker.getElement();
      if (element) element.style.visibility = "hidden";
    });

    const element = document.createElement("div");
    element.className = "route-runner";
    element.setAttribute("aria-hidden", "true");
    const runnerSticker = document.createElement("span");
    runnerSticker.className = "travel-sticker sticker-flight";
    element.append(runnerSticker);
    const marker = new maplibre.Marker({ element, anchor: "center" })
      .setLngLat(journey.coordinates[0])
      .addTo(instance);
    runner.current = { marker, sticker: runnerSticker, kind: "" };

    // 每段对准该段起终点（+buffer）所需的缩放，播放时保持当前载具居中。
    const segmentZooms = route.segments.map((segment) => {
      const lngs = segment.coordinates.map((coordinate) => coordinate[0]),
        lats = segment.coordinates.map((coordinate) => coordinate[1]);
      const camera = instance!.cameraForBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 64, maxZoom: 12 },
      );
      return camera?.zoom ?? 10;
    });

    const total = journey.total,
      duration = Math.min(
        45000,
        Math.max(2600, route.segments.length * SEGMENT_DURATION),
      );
    const started = performance.now();
    let zoom = segmentZooms[0] ?? instance.getZoom(),
      segment = -1,
      revealedStops = 0;
    setPlaying(true);

    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration),
        target = progress * total;
      const { cumulative, coordinates, segmentOf } = journey;
      let index = cumulative.findIndex((value) => value >= target);
      if (index < 0) index = cumulative.length - 1;
      const from = coordinates[Math.max(0, index - 1)],
        to = coordinates[index],
        span = cumulative[index] - (cumulative[index - 1] ?? 0);
      const ratio =
        span === 0 ? 0 : (target - (cumulative[index - 1] ?? 0)) / span;
      const position: [number, number] = [
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio,
      ];

      const source = instance!.getSource(PROGRESS_SOURCE) as
        { setData: (value: FeatureCollection) => void } | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                ...coordinates.slice(0, Math.max(1, index)),
                position,
              ],
            },
          },
        ],
      });

      const current = runner.current;
      if (current) {
        current.marker.setLngLat(position);
        const kind = segmentSticker(journey.kinds[index] ?? "drive");
        if (kind !== current.kind) {
          current.kind = kind;
          current.sticker.className = `travel-sticker sticker-${kind}`;
        }
      }

      // 走完一段才落下一段的箭头与贴纸。
      const currentSegment = segmentOf[index] ?? 0;
      if (currentSegment !== segment) {
        segment = currentSegment;
        for (const id of [ARROW_LAYER, STICKER_LAYER])
          if (instance!.getLayer(id))
            instance!.setFilter(id, [
              "<=",
              ["get", "index"],
              segment - 1,
            ] as never);
      }
      while (
        revealedStops < journey.stopDistances.length &&
        journey.stopDistances[revealedStops] <= target
      ) {
        const stopElement = markers.current[revealedStops]?.getElement();
        if (stopElement) stopElement.style.visibility = "";
        revealedStops += 1;
      }

      zoom += ((segmentZooms[segment] ?? zoom) - zoom) * 0.12;
      instance!.jumpTo({ center: position, zoom });

      if (bar.current) bar.current.style.width = `${progress * 100}%`;
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else {
        frame.current = 0;
        stopPlayback(true);
        setPlayed(true);
      }
    };
    frame.current = requestAnimationFrame(step);
  }

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
              data-map-playing={playing ? "true" : "false"}
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
                  disabled={playing}
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
                    disabled={playing}
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
            <div className="route-play">
              <span className="route-play-track" aria-hidden="true">
                <span className="route-play-bar" ref={bar} />
              </span>
              <button
                type="button"
                className="route-play-button"
                aria-label={
                  playing ? "停止播放" : played ? "重新播放路线" : "播放路线"
                }
                onClick={() => (playing ? stopPlayback() : play())}
              >
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

type FeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};
