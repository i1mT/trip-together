import type { TripEvent } from "./models";

export type RouteStop = {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  date: string;
  timezone: string;
  kinds: TripEvent["kind"][];
  eventIds: string[];
};

export type RouteSegment = {
  from: string;
  to: string;
  fromDate: string;
  toDate: string;
  kind: TripEvent["kind"];
  arc: boolean;
  coordinates: [number, number][];
};

export type MissingEvent = {
  eventId: string;
  title: string;
  date: string;
  timezone: string;
};

export type RouteGeometry = {
  /** 按行程顺序（可能重复到达同一地点）的站点序列。 */
  points: RouteStop[];
  /** 去重后的地点，用于地图标记与地点数量。 */
  stops: RouteStop[];
  segments: RouteSegment[];
  missing: MissingEvent[];
  bounds: [[number, number], [number, number]] | null;
};

type Point = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  date: string;
  kind: TripEvent["kind"];
  eventId: string;
};

const toRad = Math.PI / 180;
const toDeg = 180 / Math.PI;
const coordinateDigits = 5;

function localDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function roundedKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(coordinateDigits)},${longitude.toFixed(coordinateDigits)}`;
}

/** 球面两点之间的大圆插值，用于航班弧线。 */
export function greatCircle(
  from: [number, number],
  to: [number, number],
  steps = 32,
): [number, number][] {
  const [lng1, lat1] = from,
    [lng2, lat2] = to;
  const phi1 = lat1 * toRad,
    lambda1 = lng1 * toRad,
    phi2 = lat2 * toRad,
    lambda2 = lng2 * toRad;
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((phi2 - phi1) / 2) ** 2 +
            Math.cos(phi1) *
              Math.cos(phi2) *
              Math.sin((lambda2 - lambda1) / 2) ** 2,
        ),
      ),
    );
  if (!Number.isFinite(d) || d === 0) return [from, to];
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps,
      a = Math.sin((1 - t) * d) / Math.sin(d),
      b = Math.sin(t * d) / Math.sin(d);
    const x =
      a * Math.cos(phi1) * Math.cos(lambda1) +
      b * Math.cos(phi2) * Math.cos(lambda2);
    const y =
      a * Math.cos(phi1) * Math.sin(lambda1) +
      b * Math.cos(phi2) * Math.sin(lambda2);
    const z = a * Math.sin(phi1) + b * Math.sin(phi2);
    points.push([
      Math.atan2(y, x) * toDeg,
      Math.atan2(z, Math.hypot(x, y)) * toDeg,
    ]);
  }
  return points;
}

function eventPoints(event: TripEvent): Point[] {
  const points: Point[] = [];
  const base = {
    timezone: event.timezone,
    date: localDate(event.start, event.timezone),
    kind: event.kind,
    eventId: event.id,
  };
  if (event.departureLocation)
    points.push({
      ...base,
      name: event.departureLocation.name,
      latitude: event.departureLocation.latitude,
      longitude: event.departureLocation.longitude,
    });
  if (event.location)
    points.push({
      ...base,
      name: event.location.name,
      latitude: event.location.latitude,
      longitude: event.location.longitude,
    });
  return points;
}

function merge(target: RouteStop, point: Point) {
  if (!target.kinds.includes(point.kind)) target.kinds.push(point.kind);
  if (!target.eventIds.includes(point.eventId))
    target.eventIds.push(point.eventId);
  if (target.name === "未命名地点" && point.name) target.name = point.name;
}

/**
 * 按开始时间把有坐标的安排连成路线；已取消的安排不参与。
 * 结果只包含坐标与元数据，不依赖任何地图库，便于单元测试。
 */
export function buildRoute(events: TripEvent[]): RouteGeometry {
  const ordered = events
    .filter((event) => event.status !== "cancelled")
    .slice()
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const points: RouteStop[] = [];
  const stops: RouteStop[] = [];
  const missing: MissingEvent[] = [];
  const seen = new Map<string, RouteStop>();
  let previous: RouteStop | null = null;

  for (const event of ordered) {
    const fromEvent = eventPoints(event);
    if (!fromEvent.length) {
      missing.push({
        eventId: event.id,
        title: event.title,
        date: localDate(event.start, event.timezone),
        timezone: event.timezone,
      });
      continue;
    }
    for (const point of fromEvent) {
      const key = roundedKey(point.latitude, point.longitude);
      if (previous?.key === key) {
        // 连续到达同一地点（例如到达后住宿）合并为一次停留。
        merge(previous, point);
        const existing = seen.get(key);
        if (existing) merge(existing, point);
        continue;
      }
      const visit: RouteStop = {
        key,
        name: point.name || "未命名地点",
        latitude: point.latitude,
        longitude: point.longitude,
        date: point.date,
        timezone: point.timezone,
        kinds: [point.kind],
        eventIds: [point.eventId],
      };
      points.push(visit);
      previous = visit;
      const existing = seen.get(key);
      if (existing) merge(existing, point);
      else {
        seen.set(key, visit);
        stops.push(visit);
      }
    }
  }

  const segments: RouteSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1],
      to = points[i];
    const arc = to.kinds.includes("flight");
    const start: [number, number] = [from.longitude, from.latitude];
    const end: [number, number] = [to.longitude, to.latitude];
    segments.push({
      from: from.key,
      to: to.key,
      fromDate: from.date,
      toDate: to.date,
      kind: to.kinds[0],
      arc,
      coordinates: arc ? greatCircle(start, end) : [start, end],
    });
  }

  const bounds =
    points.length > 0
      ? (() => {
          const lngs = points.map((stop) => stop.longitude);
          const lats = points.map((stop) => stop.latitude);
          return [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ] as [[number, number], [number, number]];
        })()
      : null;

  return { points, stops, segments, missing, bounds };
}
