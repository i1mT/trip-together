"use client";
import { googleMapLink, mapLink, type Place } from "../../../../shared/places";
import { Sheet } from "../ui";

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
    <Sheet open title="打开地图" onClose={onClose}>
      <div className="map-app-choices">
        <a href={apple} target="_blank" rel="noreferrer" onClick={onClose}>
          苹果地图
        </a>
        <a href={google} target="_blank" rel="noreferrer" onClick={onClose}>
          谷歌地图
        </a>
      </div>
    </Sheet>
  );
}
