import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { RouteGeometry } from "@/lib/route-geometry";
import {
  ARROW_LAYER,
  fitRouteBounds,
  ROUTE_SOURCE,
  STICKER_LAYER,
  STOP_DOT_LAYER,
  STOP_LABEL_LAYER,
  STOP_LAYERS,
  stickerScale,
} from "./route-layer";
import { segmentSticker } from "./stickers";

type MapLibreModule = typeof import("maplibre-gl");
type ProgressSource = { setData: (value: FeatureCollection) => void };
type FeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

const PROGRESS_SOURCE = "trip-route-progress";
const PROGRESS_LAYER = "trip-route-progress-line";
/** 谁都匹配不上的筛选，用来隐藏整个图层。 */
const NOTHING: never = ["==", ["get", "eventId"], "\u0000"] as never;

export type Journey = {
  coordinates: [number, number][];
  cumulative: number[];
  kinds: string[];
  segmentOf: number[];
  total: number;
};

/** 按行程顺序把各段坐标拼成完整轨迹：累计距离、每个顶点所属的段与段类型。 */
export function buildJourney(route: RouteGeometry): Journey {
  const coordinates: [number, number][] = [];
  const cumulative: number[] = [];
  const kinds: string[] = [];
  const segmentOf: number[] = [];
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
  });
  return { coordinates, cumulative, kinds, segmentOf, total };
}

function segmentDotElement(kind: "start" | "end") {
  const element = document.createElement("div");
  element.className = `route-segment-dot ${kind}`;
  const core = document.createElement("span");
  core.className = "route-segment-dot-core";
  const label = document.createElement("span");
  label.className = "route-segment-dot-name";
  element.append(core, label);
  return { element, label };
}

/** ease-in-out：起步与到达前后都放慢，段落切换更明显。 */
function easeInOut(value: number) {
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function ensureProgressLayer(map: MapLibreMap) {
  if (map.getSource(PROGRESS_SOURCE)) return;
  map.addSource(PROGRESS_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
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

export type PlaybackHandle = { stop: (resetCamera?: boolean) => void };

/**
 * 逐段播放路线：开场清空静态路线与站点，载具从起点拖线前进。
 * 每段先让镜头缩放到位（载具停在段起点），再开始拖线，两者不同时发生；
 * 播放中只有当前移动的载具是贴纸，箭头随段落推进出现。
 */
export function startRoutePlayback(options: {
  map: MapLibreMap;
  maplibre: MapLibreModule;
  route: RouteGeometry;
  journey: Journey;
  bar: HTMLElement | null;
  onStart: () => void;
  onStop: () => void;
  onFinish: () => void;
}): PlaybackHandle {
  const { map, maplibre, route, journey, bar } = options;
  ensureProgressLayer(map);

  let frame = 0;
  let runner: {
    marker: MapLibreMarker;
    element: HTMLDivElement;
    sticker: HTMLSpanElement;
    kind: string;
  } | null = null;
  let dots: {
    start: { marker: MapLibreMarker; label: HTMLSpanElement };
    end: { marker: MapLibreMarker; label: HTMLSpanElement };
  } | null = null;

  function stop(resetCamera = true) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    map.setPaintProperty(`${ROUTE_SOURCE}-line`, "line-opacity", 0.85);
    map.setPaintProperty(`${ROUTE_SOURCE}-arc`, "line-opacity", 0.9);
    map.setPaintProperty(STOP_DOT_LAYER, "circle-opacity", 1);
    map.setPaintProperty(STOP_LABEL_LAYER, "text-opacity", 1);
    for (const id of [...STOP_LAYERS, ARROW_LAYER, STICKER_LAYER])
      if (map.getLayer(id)) map.setFilter(id, ["all"] as never);
    (map.getSource(PROGRESS_SOURCE) as ProgressSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [],
    });
    runner?.marker.remove();
    runner = null;
    dots?.start.marker.remove();
    dots?.end.marker.remove();
    dots = null;
    if (bar) bar.style.width = "0%";
    options.onStop();
    if (resetCamera) fitRouteBounds(map, route);
  }

  const element = document.createElement("div");
  element.className = "route-runner";
  element.setAttribute("aria-hidden", "true");
  const runnerSticker = document.createElement("span");
  runnerSticker.className = "travel-sticker sticker-flight";
  element.append(runnerSticker);
  runner = {
    marker: new maplibre.Marker({ element, anchor: "center" })
      .setLngLat(journey.coordinates[0])
      .addTo(map),
    element,
    sticker: runnerSticker,
    kind: "",
  };

  // 当前一段的起终点：稍大的圆点 + 地名，段落切换时一眼可见。
  const startDot = segmentDotElement("start"),
    endDot = segmentDotElement("end");
  const origin: [number, number] = route.points[0]
    ? [route.points[0].longitude, route.points[0].latitude]
    : journey.coordinates[0];
  dots = {
    start: {
      marker: new maplibre.Marker({
        element: startDot.element,
        anchor: "center",
      })
        .setLngLat(origin)
        .addTo(map),
      label: startDot.label,
    },
    end: {
      marker: new maplibre.Marker({ element: endDot.element, anchor: "center" })
        .setLngLat(origin)
        .addTo(map),
      label: endDot.label,
    },
  };

  // 每段对准该段起终点（+buffer）所需的缩放；再退一档，保证载具居中时
  // 起点与终点都在画面里。前进时保持当前载具居中。
  const segmentZooms = route.segments.map((segment) => {
    const lngs = segment.coordinates.map((coordinate) => coordinate[0]),
      lats = segment.coordinates.map((coordinate) => coordinate[1]);
    const camera = map.cameraForBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 56, maxZoom: 13 },
    );
    return Math.min(13, Math.max(3, (camera?.zoom ?? 10) - 1.1));
  });

  // 每段起始距离，用于按长度分配时长与计算位置。
  const segmentStart: number[] = [];
  journey.segmentOf.forEach((segment, index) => {
    if (segmentStart[segment] === undefined)
      segmentStart[segment] = journey.cumulative[index] ?? 0;
  });
  const segmentLength = route.segments.map((_, index) => {
    const next =
      index + 1 < route.segments.length
        ? segmentStart[index + 1]
        : journey.total;
    return Math.max(0, next - segmentStart[index]);
  });
  const longest = Math.max(...segmentLength, 0.000001);
  // 当前地图中心与缩放，作为第一段「镜头就位」的起点。
  const initialCenter = map.getCenter();
  let clock = 0;
  const timings = route.segments.map((_, index) => {
    // 长段更快：时长随长度次线性增长，并夹在合理区间内。
    const duration = Math.min(
      3200,
      Math.max(
        1300,
        1200 + 2000 * Math.pow(segmentLength[index] / longest, 0.6),
      ),
    );
    // 就位时间随缩放差变化：跨度越大推得越久。
    const zoomFrom =
      index === 0 ? map.getZoom() : (segmentZooms[index - 1] ?? 4);
    const targetZoom = segmentZooms[index] ?? zoomFrom;
    const settle = Math.min(
      1400,
      Math.max(320, Math.abs(targetZoom - zoomFrom) * 150),
    );
    const first = route.segments[index].coordinates[0];
    const timing = {
      zoomFrom,
      centerFrom:
        index === 0
          ? ([initialCenter.lng, initialCenter.lat] as [number, number])
          : first,
      centerAt: first,
      zoomStart: clock,
      zoomDuration: settle,
      start: clock + settle,
      duration,
      from: segmentStart[index],
      length: segmentLength[index],
      factor: stickerScale(segmentLength[index] / longest),
    };
    clock += settle + duration;
    return timing;
  });
  const totalClock = Math.max(1, clock);
  const started = performance.now();
  let zoom = map.getZoom(),
    segment = -1;
  options.onStart();

  // 开场先清空：没有路线，只有一条随播放画出来的新线。
  map.setPaintProperty(`${ROUTE_SOURCE}-line`, "line-opacity", 0);
  map.setPaintProperty(`${ROUTE_SOURCE}-arc`, "line-opacity", 0);
  map.setPaintProperty(STOP_DOT_LAYER, "circle-opacity", 0);
  map.setPaintProperty(STOP_LABEL_LAYER, "text-opacity", 0);
  map.setFilter(STICKER_LAYER, NOTHING);
  map.setFilter(ARROW_LAYER, NOTHING);

  const step = (now: number) => {
    const elapsed = now - started;
    let current = timings.findIndex(
      (timing) => elapsed < timing.start + timing.duration,
    );
    if (current < 0) current = timings.length - 1;
    const timing = timings[current];
    // 镜头就位阶段：载具停在段起点，只把中心与缩放推到位。
    const settleLocal = Math.min(
        1,
        Math.max(0, (elapsed - timing.zoomStart) / timing.zoomDuration),
      ),
      settling = elapsed < timing.start;
    const local = settling
        ? 0
        : Math.min(1, Math.max(0, (elapsed - timing.start) / timing.duration)),
      target = timing.from + easeInOut(local) * timing.length;

    const { cumulative, coordinates } = journey;
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

    (map.getSource(PROGRESS_SOURCE) as ProgressSource | undefined)?.setData({
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

    if (runner) {
      runner.marker.setLngLat(position);
      const kind = segmentSticker(journey.kinds[index] ?? "drive");
      if (kind !== runner.kind) {
        runner.kind = kind;
        runner.sticker.className = `travel-sticker sticker-${kind}`;
      }
      // 播放时画面里只有这一个贴纸，整体比线段贴纸放大一档；
      // 段长的影响保留但压平，短途段位也不会小到看不清。
      const size = Math.round(
        Math.min(
          150,
          Math.max(
            44,
            58 * Math.pow(zoom / 4, 0.6) * (0.55 + 0.45 * timing.factor),
          ),
        ),
      );
      runner.element.style.setProperty("--runner-size", `${size}px`);
    }

    // 切换当前段时更新起终点标记与地名，并放出上一段的箭头。
    if (current !== segment) {
      segment = current;
      const a = route.points[current],
        b = route.points[current + 1];
      if (dots && a && b) {
        dots.start.marker.setLngLat([a.longitude, a.latitude]);
        dots.start.label.textContent = a.name;
        dots.end.marker.setLngLat([b.longitude, b.latitude]);
        dots.end.label.textContent = b.name;
      }
      if (map.getLayer(ARROW_LAYER))
        map.setFilter(ARROW_LAYER, [
          "<=",
          ["get", "index"],
          segment - 1,
        ] as never);
    }

    // 缩放：就位阶段用 ease-in-out 从上一段的缩放推到位，前进阶段保持不变。
    const zoomTarget = segmentZooms[segment] ?? zoom;
    if (settling)
      zoom =
        timing.zoomFrom +
        (zoomTarget - timing.zoomFrom) * easeInOut(settleLocal);
    else zoom = zoomTarget;
    const blend = easeInOut(settleLocal);
    // 就位阶段把镜头从上一段的位置推到本段起点，前进阶段始终跟着载具。
    map.jumpTo({
      center: settling
        ? [
            timing.centerFrom[0] +
              (timing.centerAt[0] - timing.centerFrom[0]) * blend,
            timing.centerFrom[1] +
              (timing.centerAt[1] - timing.centerFrom[1]) * blend,
          ]
        : position,
      zoom,
    });

    if (bar) bar.style.width = `${(elapsed / totalClock) * 100}%`;
    if (elapsed < totalClock) frame = requestAnimationFrame(step);
    else {
      frame = 0;
      stop(true);
      options.onFinish();
    }
  };
  frame = requestAnimationFrame(step);

  return { stop };
}
