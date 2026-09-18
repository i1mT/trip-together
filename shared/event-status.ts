export const eventStatuses = ["planned", "completed", "cancelled"] as const;
export type EventStatus = (typeof eventStatuses)[number];
export function isPlanned(event: { status?: EventStatus }) {
  return !event.status || event.status === "planned";
}
export function eventStatusLabel(status?: EventStatus) {
  return status === "completed"
    ? "已结束"
    : status === "cancelled"
      ? "已取消"
      : "";
}
