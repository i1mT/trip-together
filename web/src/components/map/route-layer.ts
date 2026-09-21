import type { Map as MapLibreMap } from "maplibre-gl";
import type { RouteGeometry } from "@/lib/route-geometry";

export const ROUTE_SOURCE = "trip-route";
export const ROUTE_POINT_SOURCE = "trip-route-points";
export const LINE_COLOR = "#6c4c96";
export const ARC_COLOR = "#9b7bd4";

export function lineFeatures(route: RouteGeometry) {
  return route.segments.map((segment) => ({
    type: "Feature" as const,
    properties: {
      arc: segment.arc,
      day: route.stops.find((stop) => stop.key === segment.to)?.date ?? "",
      fromDay:
        route.stops.find((stop) => stop.key === segment.from)?.date ?? "",
    },
    geometry: {
      type: "LineString" as const,
      coordinates: segment.coordinates,
    },
  }));
}

export function endpointFeatures(route: RouteGeometry) {
  const points = [route.stops[0], route.stops[route.stops.length - 1]].filter(
    Boolean,
  );
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

/** 往地图实例上补充路线与起终点图层，幂等，可重复调用。 */
export function ensureRouteLayers(map: MapLibreMap, route: RouteGeometry) {
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

export function fitRouteBounds(map: MapLibreMap, route: RouteGeometry) {
  if (!route.bounds) return;
  const [[minLng, minLat], [maxLng, maxLat]] = route.bounds;
  if (minLng === maxLng && minLat === maxLat)
    map.jumpTo({ center: [minLng, minLat], zoom: 9 });
  else map.fitBounds(route.bounds, { padding: 48, maxZoom: 11, duration: 0 });
}
