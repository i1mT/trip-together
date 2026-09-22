import type { Map as MapLibreMap } from "maplibre-gl";
import { stopDays, type RouteGeometry } from "@/lib/route-geometry";
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
export const LINE_COLOR = "#6c4c96";
export const ARC_COLOR = "#9b7bd4";

export const ARROW_LAYER = `${ROUTE_ARROW_SOURCE}-symbol`;
export const STICKER_LAYER = `${ROUTE_DECOR_SOURCE}-stickers`;
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

/** 折线长度（公里），用于按线路长短缩放交通工具贴纸。 */
export function lengthKm(coordinates: [number, number][]) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const [lng1, lat1] = coordinates[i - 1],
      [lng2, lat2] = coordinates[i];
    const dx = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
    total += Math.hypot(dx, lat2 - lat1);
  }
  return total * 111.32;
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

function decorFeatures(route: RouteGeometry) {
  const lengths = route.segments.map((segment) =>
    lengthKm(segment.coordinates),
  );
  const longest = Math.max(...lengths, 0.001);
  return route.segments.map((segment, index) => {
    const scale = stickerScale(lengths[index] / longest);
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
          ["*", 0.16, ["get", "scale"]],
          7,
          ["*", 0.26, ["get", "scale"]],
          11,
          ["*", 0.38, ["get", "scale"]],
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
