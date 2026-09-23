import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent as MapLibreLayerMouseEvent,
} from "maplibre-gl";
import type { TripData, TripEvent } from "@/lib/models";
import {
  buildJourney,
  stopDays,
  type RouteGeometry,
} from "@/lib/route-geometry";
import { mapStyleUrl } from "../../../../shared/map-source";
import {
  ARROW_LAYER,
  ensureRouteLayers,
  fitRouteBounds,
  METRIC_LAYER,
  ROUTE_DECOR_SOURCE,
  ROUTE_SOURCE,
  STICKER_LAYER,
  STOP_DOT_LAYER,
  STOP_LABEL_LAYER,
  STOP_LAYERS,
  stopFilter,
} from "./route-layer";
import { startRoutePlayback, type PlaybackHandle } from "./route-playback";

type MapLibreModule = typeof import("maplibre-gl");

/**
 * 路线图的地图生命周期：初始化、图层、点击站点、按日期筛选、逐段播放。
 * 弹窗只负责渲染，不再关心里层的地图状态。
 */
export function useRouteMapView({
  open,
  route,
  data,
  onEvent,
}: {
  open: boolean;
  route: RouteGeometry;
  data: TripData;
  onEvent: (event: TripEvent) => void;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const module = useRef<MapLibreModule | null>(null);
  const playback = useRef<PlaybackHandle | null>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState(false);
  const [failed, setFailed] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [playingDay, setPlayingDay] = useState("");
  const [visibleStops, setVisibleStops] = useState(0);
  const [visibleStickers, setVisibleStickers] = useState(0);
  const hasStops = route.stops.length > 0;
  const stopDayMap = useMemo(() => stopDays(route), [route]);
  const journey = useMemo(() => buildJourney(route), [route]);

  /** 结束播放并把地图恢复成静态路线。 */
  const stopPlayback = useCallback((resetCamera = true) => {
    playback.current?.stop(resetCamera);
    playback.current = null;
  }, []);

  const togglePlay = useCallback(() => {
    if (playback.current) {
      stopPlayback();
      return;
    }
    const instance = map.current,
      maplibre = module.current;
    if (!instance || !maplibre || !journey.total || !journey.coordinates.length)
      return;
    setPlayed(false);
    setSelectedDay("");
    playback.current = startRoutePlayback({
      map: instance,
      maplibre,
      route,
      journey,
      bar: bar.current,
      onStart: () => setPlaying(true),
      onStop: () => {
        setPlaying(false);
        setPlayingDay("");
      },
      onFinish: () => setPlayed(true),
      onDay: (day) => setPlayingDay(day),
    });
  }, [journey, route, stopPlayback]);

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
          attributionControl: false,
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
      instance?.remove();
      map.current = null;
      module.current = null;
      setReady(false);
      setCreated(false);
    };
  }, [open, hasStops, container, route, stopPlayback]);

  // 站点是地图原生图层：点击圆点或地名打开对应安排，悬停显示手型。
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const openStop = (event: MapLibreLayerMouseEvent) => {
      const stop = event.features?.[0]?.properties;
      if (!stop) return;
      const found = data.events.find((item) => item.id === stop.eventId);
      if (found) handler.current(found);
    };
    const setCursor = () => {
      instance.getCanvas().style.cursor = "pointer";
    };
    const clearCursor = () => {
      instance.getCanvas().style.cursor = "";
    };
    instance.on("click", STOP_DOT_LAYER, openStop);
    instance.on("click", STOP_LABEL_LAYER, openStop);
    instance.on("mouseenter", STOP_DOT_LAYER, setCursor);
    instance.on("mouseleave", STOP_DOT_LAYER, clearCursor);
    return () => {
      instance.off("click", STOP_DOT_LAYER, openStop);
      instance.off("click", STOP_LABEL_LAYER, openStop);
      instance.off("mouseenter", STOP_DOT_LAYER, setCursor);
      instance.off("mouseleave", STOP_DOT_LAYER, clearCursor);
      instance.getCanvas().style.cursor = "";
    };
  }, [ready, data.events]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    void ensureRouteLayers(instance, route);
    fitRouteBounds(instance, route);
  }, [ready, route]);

  /**
   * 统计当前实际显示的站点与贴纸数量，供测试与调试核对筛选结果。
   * 站点按视野内绘制结果统计；贴纸按图层筛选条件统计（符号图层在播放时
   * 不会触发 idle，用渲染结果会读到上一帧的旧值）。
   */
  const countRendered = useCallback(() => {
    const instance = map.current;
    if (!instance) return;
    try {
      const stops = instance.getLayer(STOP_DOT_LAYER)
        ? instance.queryRenderedFeatures({ layers: [STOP_DOT_LAYER] })
        : [];
      setVisibleStops(new Set(stops.map((item) => item.properties?.name)).size);
      const filter = instance.getFilter(STICKER_LAYER) ?? ["all"];
      setVisibleStickers(
        instance.getLayer(STICKER_LAYER)
          ? instance.querySourceFeatures(ROUTE_DECOR_SOURCE, {
              filter: filter as never,
            }).length
          : 0,
      );
    } catch {
      setVisibleStops(0);
      setVisibleStickers(0);
    }
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const frame = requestAnimationFrame(countRendered);
    instance.on("idle", countRendered);
    return () => {
      cancelAnimationFrame(frame);
      instance.off("idle", countRendered);
    };
  }, [ready, route, selectedDay, playing, countRendered]);

  // 日期筛选：只保留当天所属的线段、箭头、贴纸与线段两端的地点。
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || playing) return;
    const filter =
      selectedDay === ""
        ? (["all"] as never)
        : (["==", ["get", "day"], selectedDay] as never);
    for (const id of [
      `${ROUTE_SOURCE}-line`,
      `${ROUTE_SOURCE}-arc`,
      ARROW_LAYER,
      STICKER_LAYER,
      METRIC_LAYER,
    ])
      if (instance.getLayer(id)) instance.setFilter(id, filter);
    for (const id of STOP_LAYERS)
      if (instance.getLayer(id))
        instance.setFilter(id, stopFilter(selectedDay));

    if (selectedDay === "") {
      fitRouteBounds(instance, route);
      return;
    }
    const segments = route.segments.filter(
      (segment) => segment.toDate === selectedDay,
    );
    const coordinates = segments.length
      ? segments.flatMap((segment) => segment.coordinates)
      : route.stops
          .filter((stop) =>
            (stopDayMap[stop.key] ?? stop.dates).includes(selectedDay),
          )
          .map((stop) => [stop.longitude, stop.latitude] as [number, number]);
    if (!coordinates.length) return;
    const lngs = coordinates.map((coordinate) => coordinate[0]),
      lats = coordinates.map((coordinate) => coordinate[1]);
    instance.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 70, maxZoom: 12, duration: 650 },
    );
  }, [selectedDay, ready, route, playing, stopDayMap]);

  return {
    setContainer,
    ready,
    created,
    failed,
    selectedDay,
    setSelectedDay,
    playing,
    played,
    playingDay,
    togglePlay,
    bar,
    visibleStops,
    visibleStickers,
    hasStops,
  };
}
