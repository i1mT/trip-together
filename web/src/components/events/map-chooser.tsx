"use client";
import { X } from "lucide-react";
import { googleMapLink, mapLink, type Place } from "../../../../shared/places";

export function MapChooser({
  location,
  address,
  onClose,
}: {
  location?: Place | null;
  address?: string;
  onClose: () => void;
}) {
  const query = address?.trim() || location?.name || "";
  const apple = location
    ? mapLink(location)
    : `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
  const google = location
    ? googleMapLink(location)
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <div className="confirmation-modal-root">
      <div className="sheet-overlay" onMouseDown={onClose} />
      <div
        className="sheet confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-label="打开地图"
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>打开地图</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="map-app-choices">
          <a href={apple} target="_blank" rel="noreferrer" onClick={onClose}>
            苹果地图
          </a>
          <a href={google} target="_blank" rel="noreferrer" onClick={onClose}>
            谷歌地图
          </a>
        </div>
      </div>
    </div>
  );
}
