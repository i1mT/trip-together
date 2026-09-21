import type { Map as MapLibreMap } from "maplibre-gl";
import type { RouteGeometry } from "@/lib/route-geometry";
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

const ARROW_LAYER = `${ROUTE_ARROW_SOURCE}-symbol`;
const STICKER_LAYER = `${ROUTE_DECOR_SOURCE}-stickers`;

export function lineFeatures(route: RouteGeometry) {
  return route.segments.map((segment) => ({
    type: "Feature" as const,
    properties: {
      arc: segment.arc,
      day: segment.toDate,
      fromDay: segment.fromDate,
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
  return route.segments.map((segment) => {
    const before = pointAt(segment.coordinates, 0.72),
      end = pointAt(segment.coordinates, 0.9);
    return {
      type: "Feature" as const,
      properties: { bearing: bearingBetween(before, end) },
      geometry: { type: "Point" as const, coordinates: end },
    };
  });
}

function decorFeatures(route: RouteGeometry) {
  return route.segments.map((segment) => ({
    type: "Feature" as const,
    properties: { imageId: stickerImageId(segmentSticker(segment.kind)) },
    geometry: {
      type: "Point" as const,
      coordinates: pointAt(segment.coordinates, 0.5),
    },
  }));
}

export function endpointFeatures(route: RouteGeometry) {
  const first = route.points[0],
    last = route.points[route.points.length - 1];
  const points = [first, last].filter(Boolean);
  return [...new Set(points)].map((stop, index, all) => ({
    type: "Feature" as const,
    properties: {
      role: all.length === 1 ? "both" : index === 0 ? "start" : "end",
    },
    geometry: {
      type: "Point" as const,
      coordinates: [stop.longitude, stop.latitude] as [number, number],
    },
  }));
}

/** 往地图实例上补充路线、方向箭头、行程贴纸与起终点图层，幂等。 */
export async function ensureRouteLayers(
  map: MapLibreMap,
  route: RouteGeometry,
) {
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
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0.07,
          7,
          0.12,
          11,
          0.18,
        ],
        "icon-padding": 4,
        "icon-rotation-alignment": "viewport",
      },
    });

  const points = {
    type: "FeatureCollection" as const,
    features: endpointFeatures(route),
  };
  const pointSource = map.getSource(ROUTE_POINT_SOURCE) as
    { setData: (value: typeof points) => void } | undefined;
  if (pointSource) pointSource.setData(points);
  else {
    map.addSource(ROUTE_POINT_SOURCE, { type: "geojson", data: points });
    map.addLayer({
      id: `${ROUTE_POINT_SOURCE}-start`,
      type: "circle",
      source: ROUTE_POINT_SOURCE,
      filter: ["in", ["get", "role"], ["literal", ["start", "both"]]],
      paint: {
        "circle-radius": 7,
        "circle-color": "#3f8f6b",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
    map.addLayer({
      id: `${ROUTE_POINT_SOURCE}-end`,
      type: "circle",
      source: ROUTE_POINT_SOURCE,
      filter: ["in", ["get", "role"], ["literal", ["end", "both"]]],
      paint: {
        "circle-radius": 7,
        "circle-color": "#b8544c",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
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
