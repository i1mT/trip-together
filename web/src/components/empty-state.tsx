import type { ReactNode } from "react";
import type { TripEvent } from "@/lib/models";
import { TravelSticker } from "./travel-sticker";
export function EmptyState({
  kind = "luggage",
  title,
  text,
  action,
  onAction,
  extra,
}: {
  kind?: TripEvent["kind"] | "luggage";
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="surface empty-state">
      <TravelSticker kind={kind} className="empty-state-sticker" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && (
        <button className="text-action" onClick={onAction}>
          {action}
        </button>
      )}
      {extra}
    </div>
  );
}
