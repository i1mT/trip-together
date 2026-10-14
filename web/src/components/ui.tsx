"use client";
import {
  Plane,
  Car,
  BedDouble,
  Compass,
  ArrowRightLeft,
  ChevronRight,
} from "lucide-react";
import type { ReactNode } from "react";
import type { TripEvent } from "@/lib/models";
import { createPortal } from "react-dom";
export const eventIcons = {
  flight: Plane,
  drive: Car,
  stay: BedDouble,
  explore: Compass,
  transfer: ArrowRightLeft,
};
export function EventIcon({
  kind,
  size = 22,
}: {
  kind: TripEvent["kind"];
  size?: number;
}) {
  const Icon = eventIcons[kind];
  return <Icon size={size} strokeWidth={1.6} />;
}
export function SectionTitle({
  children,
  action,
  onClick,
}: {
  children: ReactNode;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {action && (
        <button className="text-action" onClick={onClick}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
export { Sheet, SheetForm, SheetFooter } from "./sheets/sheet";

export function ConfirmationModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="confirmation-modal-root">
      <div className="sheet-overlay" onMouseDown={onClose} />
      <div className="sheet confirmation-modal" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div>
            <div className="sheet-title-line">
              <h2>{title}</h2>
            </div>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        <footer className="sheet-footer">
          <div className="sheet-actions">{footer}</div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
