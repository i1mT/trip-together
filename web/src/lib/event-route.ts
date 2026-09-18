import type { TripEvent } from "./models";
function endpoint(value: string) {
  return { name: value.trim(), detail: "", code: "" };
}
export function eventRoute(
  event: Pick<TripEvent, "from" | "to" | "place"> & { subtitle?: string },
) {
  if (event.from && event.to)
    return { from: endpoint(event.from), to: endpoint(event.to) };
  const route = [event.place, event.subtitle].find((value) =>
    value?.includes("→"),
  );
  const points = route?.split("→").map((value) => value.trim());
  if (points?.length === 2 && points.every(Boolean))
    return { from: endpoint(points[0]), to: endpoint(points[1]) };
  return null;
}
