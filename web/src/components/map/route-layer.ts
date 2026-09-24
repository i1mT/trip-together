import type { Map as MapLibreMap } from "maplibre-gl";
import { distanceKm, stopDays, type RouteGeometry } from "@/lib/route-geometry";
import {
  ARROW_IMAGE_ID,
  registerRouteImages,
  segmentSticker,
  stickerImageId,
} from "./stickers";

export const ROUTE_SOURCE = "trip-route";
export const ROUTE_POINT_SOURCE = "trip-route-points";
export const ROUTE_DECOR_SOURCE = "trip-route-decor";
export const ROUTE_ARROW_SOURCE = "trip-route-arrows";
export const ROUTE_METRIC_SOURCE = "trip-route-metrics";
export const ROUTE_METRIC_LANE_SOURCE = "trip-route-metrics-lane1";
export const LINE_COLOR = "#6c4c96";
export const ARC_COLOR = "#9b7bd4";

export const ARROW_LAYER = `${ROUTE_ARROW_SOURCE}-symbol`;
export const STICKER_LAYER = `${ROUTE_DECOR_SOURCE}-stickers`;
export const METRIC_LAYER = `${ROUTE_METRIC_SOURCE}-labels`;
export const METRIC_LANE_LAYER = `${ROUTE_METRIC_LANE_SOURCE}-labels`;
/** 路程文字分上下两层，去/回等中点重合的段分别落在两侧，避免文字叠在一起。 */
export const METRIC_LAYERS = [METRIC_LAYER, METRIC_LANE_LAYER];
export const STOP_DOT_LAYER = `${ROUTE_POINT_SOURCE}-dot`;
export const STOP_LABEL_LAYER = `${ROUTE_POINT_SOURCE}-label`;
export const STOP_LAYERS = [STOP_DOT_LAYER, STOP_LABEL_LAYER];

/** 只保留某天到访过或当天有线段经过的地点；空字符串表示不筛选。 */
export function stopFilter(day: string) {
  return day === ""
    ? (["all"] as never)
    : (["!=", ["index-of", day, ["get", "days"]], -1] as never);
}

export function lineFeatures(route: RouteGeometry) {
  return route.segments.map((segment) => ({
    type: "Feature" as const,
    properties: {
      arc: segment.arc,
      day: segment.toDate,
    },
    geometry: {
      type: "LineString" as const,
      coordinates: segment.coordinates,
    },
  }));
}

/** 按累计距离取折线上某一点（fraction 0-1）。 */
function pointAt(coordinates: [number, number][], fraction: number) {
  if (coordinates.length <= 1) return coordinates[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const length = Math.hypot(
      coordinates[i][0] - coordinates[i - 1][0],
      coordinates[i][1] - coordinates[i - 1][1],
    );
    lengths.push(length);
    total += length;
  }
  let target = total * fraction;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const ratio = lengths[i] === 0 ? 0 : target / lengths[i];
      return [
        coordinates[i][0] + (coordinates[i + 1][0] - coordinates[i][0]) * ratio,
        coordinates[i][1] + (coordinates[i + 1][1] - coordinates[i][1]) * ratio,
      ] as [number, number];
    }
    target -= lengths[i];
  }
  return coordinates[coordinates.length - 1];
}

function bearingBetween(from: [number, number], to: [number, number]) {
  const latitude = ((from[1] + to[1]) / 2) * (Math.PI / 180);
  const dx = (to[0] - from[0]) * Math.cos(latitude),
    dy = to[1] - from[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** 每段只在靠近终点处放一个箭头，方向由该段的最后一段走向决定。 */
function arrowFeatures(route: RouteGeometry) {
  return route.segments.map((segment, index) => {
    const before = pointAt(segment.coordinates, 0.72),
      end = pointAt(segment.coordinates, 0.9);
    return {
      type: "Feature" as const,
      properties: {
        index,
        bearing: bearingBetween(before, end),
        day: segment.toDate,
      },
      geometry: { type: "Point" as const, coordinates: end },
    };
  });
}

/**
 * 交通工具贴纸的缩放系数（0.12–1.5）。曲线刻意做成非线性：线路越长贴纸越大，
 * 但短途线路要迅速变小，否则密集的城市间移动会挤满贴纸、盖住地名。
 */
export function stickerScale(ratio: number) {
  const clamped = Math.min(1, Math.max(0, ratio));
  return 0.12 + 1.38 * Math.pow(clamped, 0.6);
}

/** 每段贴纸的缩放系数，按该段占最长段的比例计算。 */
function segmentScales(route: RouteGeometry) {
  const lengths = route.segments.map(
    (segment) => segment.distanceKm || distanceKm(segment.coordinates),
  );
  const longest = Math.max(...lengths, 0.001);
  return lengths.map((length) => stickerScale(length / longest));
}

function decorFeatures(route: RouteGeometry) {
  const scales = segmentScales(route);
  return route.segments.map((segment, index) => {
    const scale = scales[index];
    return {
      type: "Feature" as const,
      properties: {
        index,
        scale: Number(scale.toFixed(3)),
        day: segment.toDate,
        imageId: stickerImageId(segmentSticker(segment.kind)),
      },
      geometry: {
        type: "Point" as const,
        coordinates: pointAt(segment.coordinates, 0.5),
      },
    };
  });
}

function formatDuration(minutes: number | null) {
  if (!minutes || minutes < 1) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分钟`;
  return rest ? `${hours}小时 ${rest}分` : `${hours}小时`;
}

function metricFeatures(route: RouteGeometry) {
  const lanes = new Map<string, number>();
  return route.segments.map((segment, index) => {
    const distance =
      segment.distanceKm >= 100
        ? `${Math.round(segment.distanceKm).toLocaleString("zh-CN")} km`
        : `${segment.distanceKm.toFixed(1)} km`;
    const duration = formatDuration(segment.durationMinutes);
    const center = pointAt(segment.coordinates, 0.5);
    // 中点相同的段（如去程与回程）依次分到不同层，让文字上下错开。
    const key = `${center[0].toFixed(5)},${center[1].toFixed(5)}`;
    const lane = Math.min(lanes.get(key) ?? 0, 1);
    lanes.set(key, (lanes.get(key) ?? 0) + 1);
    return {
      type: "Feature" as const,
      properties: {
        day: segment.toDate,
        index,
        lane,
        distanceKm: segment.distanceKm,
        label: duration ? `约 ${distance} · ${duration}` : `约 ${distance}`,
      },
      geometry: {
        type: "Point" as const,
        coordinates: center,
      },
    };
  });
}

/**
 * 路程文字在当前缩放下的最小显示长度（屏幕像素）。线段太短时文字会挤在一起，
 * 只有缩放后段长超过该阈值才显示。MapLibre 的 zoom 只能作为顶层 step / interpolate
 * 的输入，因此按缩放档位换算出最小公里数，再由各段的 distanceKm 决定是否显示。
 */
const METRIC_MIN_PIXELS = 110;
const METRIC_PIXELS_PER_KM = 512 / 40075;
const metricMinKm = (zoom: number) =>
  METRIC_MIN_PIXELS / (METRIC_PIXELS_PER_KM * 2 ** zoom);
const metricOpacity = [
  "step",
  ["zoom"],
  ...([3, 4, 5, 6, 7, 8, 10, 12] as const).flatMap((zoom, index) => {
    const output = [
      "case",
      [">=", ["get", "distanceKm"], metricMinKm(zoom)],
      0.95,
      0,
    ];
    return index === 0 ? [output] : [zoom, output];
  }),
] as never;

/** 查看状态下的站点：每个地点一个圆点加地名，不带序号。 */
export function stopFeatures(route: RouteGeometry) {
  const last = route.stops.length - 1;
  const days = stopDays(route);
  return route.stops.map((stop, index) => ({
    type: "Feature" as const,
    properties: {
      name: stop.name,
      days: days[stop.key] ?? stop.dates,
      eventId: stop.eventIds[0] ?? "",
      role:
        last === 0
          ? "both"
          : index === 0
            ? "start"
            : index === last
              ? "end"
              : "mid",
    },
    geometry: {
      type: "Point" as const,
      coordinates: [stop.longitude, stop.latitude] as [number, number],
    },
  }));
}

const boosted = new WeakSet<object>();

/** 底图样式自带的文字偏小，这里统一放大一档（幂等）。 */
function boostLabelSizes(map: MapLibreMap, factor = 1.3) {
  if (boosted.has(map)) return;
  boosted.add(map);
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    const size = layer.layout?.["text-size"];
    try {
      if (typeof size === "number") {
        map.setLayoutProperty(layer.id, "text-size", size * factor);
      } else if (
        Array.isArray(size) &&
        typeof size[0] === "string" &&
        size[0].startsWith("interpolate")
      ) {
        const scaled = [...size.slice(0, 3)];
        for (let i = 3; i < size.length; i += 2)
          scaled.push(
            size[i],
            typeof size[i + 1] === "number"
              ? size[i + 1] * factor
              : size[i + 1],
          );
        map.setLayoutProperty(layer.id, "text-size", scaled as never);
      }
    } catch {
      // 覆盖不了的图层保持原样。
    }
  }
}

/** 往地图实例上补充路线、方向箭头、行程贴纸与起终点图层，幂等。 */
export async function ensureRouteLayers(
  map: MapLibreMap,
  route: RouteGeometry,
) {
  boostLabelSizes(map);
  const lines = {
    type: "FeatureCollection" as const,
    features: lineFeatures(route),
  };
  const lineSource = map.getSource(ROUTE_SOURCE) as
    { setData: (value: typeof lines) => void } | undefined;
  if (lineSource) lineSource.setData(lines);
  else {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: lines });
    map.addLayer({
      id: `${ROUTE_SOURCE}-line`,
      type: "line",
      source: ROUTE_SOURCE,
      filter: ["!=", ["get", "arc"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": LINE_COLOR,
        "line-width": 4,
        "line-opacity": 0.85,
      },
    });
    map.addLayer({
      id: `${ROUTE_SOURCE}-arc`,
      type: "line",
      source: ROUTE_SOURCE,
      filter: ["==", ["get", "arc"], true],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": ARC_COLOR,
        "line-width": 3,
        "line-opacity": 0.9,
        "line-dasharray": [2, 1.6],
      },
    });
  }

  const metrics = metricFeatures(route);
  const metricLayers = [
    {
      id: METRIC_LAYER,
      source: ROUTE_METRIC_SOURCE,
      lane: 0,
      anchor: "bottom" as const,
      offset: [0, -5.8] as [number, number],
    },
    {
      id: METRIC_LANE_LAYER,
      source: ROUTE_METRIC_LANE_SOURCE,
      lane: 1,
      anchor: "top" as const,
      offset: [0, 5.8] as [number, number],
    },
  ];
  for (const spec of metricLayers) {
    const data = {
      type: "FeatureCollection" as const,
      features: metrics.filter((feature) => feature.properties.lane === spec.lane),
    };
    const source = map.getSource(spec.source) as
      { setData: (value: typeof data) => void } | undefined;
    if (source) source.setData(data);
    else map.addSource(spec.source, { type: "geojson", data });
    if (map.getLayer(spec.id)) continue;
    map.addLayer({
      id: spec.id,
      type: "symbol",
      source: spec.source,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 8, 11, 12, 13],
        // 距离/时间与同在中点的交通工具贴纸会重叠：把文字沿屏幕上下让到贴纸之外
        // （正立文字与正立贴纸方向一致）。MapLibre 的 text-offset 只接受常量，
        // 这里按全览时最大贴纸（最长段）的高度取固定偏移。
        "text-anchor": spec.anchor,
        "text-offset": spec.offset,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#4d3864",
        "text-halo-color": "#fffdfd",
        "text-halo-width": 2,
        "text-opacity": metricOpacity,
      },
    });
  }

  await registerRouteImages(
    map,
    route.segments.map((segment) => segmentSticker(segment.kind)),
  );

  const arrows = {
    type: "FeatureCollection" as const,
    features: arrowFeatures(route),
  };
  const arrowSource = map.getSource(ROUTE_ARROW_SOURCE) as
    { setData: (value: typeof arrows) => void } | undefined;
  if (arrowSource) arrowSource.setData(arrows);
  else map.addSource(ROUTE_ARROW_SOURCE, { type: "geojson", data: arrows });
  if (!map.getLayer(ARROW_LAYER) && map.hasImage(ARROW_IMAGE_ID))
    map.addLayer({
      id: ARROW_LAYER,
      type: "symbol",
      source: ROUTE_ARROW_SOURCE,
      layout: {
        "icon-image": ARROW_IMAGE_ID,
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0.32,
          8,
          0.44,
          12,
          0.58,
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });

  const decor = {
    type: "FeatureCollection" as const,
    features: decorFeatures(route),
  };
  const decorSource = map.getSource(ROUTE_DECOR_SOURCE) as
    { setData: (value: typeof decor) => void } | undefined;
  if (decorSource) decorSource.setData(decor);
  else map.addSource(ROUTE_DECOR_SOURCE, { type: "geojson", data: decor });
  const hasStickerImage = route.segments.some((segment) =>
    map.hasImage(stickerImageId(segmentSticker(segment.kind))),
  );
  if (!map.getLayer(STICKER_LAYER) && hasStickerImage)
    map.addLayer({
      id: STICKER_LAYER,
      type: "symbol",
      source: ROUTE_DECOR_SOURCE,
      layout: {
        "icon-image": ["get", "imageId"],
        // 顶层用 zoom 插值（MapLibre 要求），每档输出再按该段长度系数缩放。
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          ["*", 0.18, ["get", "scale"]],
          7,
          ["*", 0.34, ["get", "scale"]],
          11,
          ["*", 0.5, ["get", "scale"]],
          14,
          ["*", 0.58, ["get", "scale"]],
        ],
        "icon-padding": 4,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": "viewport",
      },
    });

  const points = {
    type: "FeatureCollection" as const,
    features: stopFeatures(route),
  };
  const pointSource = map.getSource(ROUTE_POINT_SOURCE) as
    { setData: (value: typeof points) => void } | undefined;
  if (pointSource) pointSource.setData(points);
  else {
    map.addSource(ROUTE_POINT_SOURCE, { type: "geojson", data: points });
    map.addLayer({
      id: STOP_DOT_LAYER,
      type: "circle",
      source: ROUTE_POINT_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          4,
          8,
          5.5,
          12,
          7,
        ],
        "circle-color": [
          "match",
          ["get", "role"],
          "end",
          "#b8544c",
          "mid",
          "#6c4c96",
          "#3f8f6b",
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: STOP_LABEL_LAYER,
      type: "symbol",
      source: ROUTE_POINT_SOURCE,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          10,
          8,
          12,
          12,
          14,
        ],
        "text-anchor": "top",
        "text-offset": [0, 1],
        "text-max-width": 8,
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#3a2f4a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }
}

export function fitRouteBounds(
  map: MapLibreMap,
  route: RouteGeometry,
  padding:
    number | { top: number; bottom: number; left: number; right: number } = 48,
) {
  if (!route.bounds) return;
  const [[minLng, minLat], [maxLng, maxLat]] = route.bounds;
  if (minLng === maxLng && minLat === maxLat)
    map.jumpTo({ center: [minLng, minLat], zoom: 9 });
  else map.fitBounds(route.bounds, { padding, maxZoom: 11, duration: 0 });
}
