"use client";
import { useState } from "react";
import {
  destinations,
  type Destination,
} from "../../../../shared/travel-options";
import type { Place } from "../../../../shared/places";
import { PlacePicker } from "../editors/event/place-picker";
function toDestination(place: Place): Destination {
  const match = destinations.find((d) => {
    const city = d.name.split(" · ")[0];
    return (
      place.name.includes(city) ||
      city.includes(place.name) ||
      place.address.includes(city)
    );
  });
  return {
    name: match?.name ?? place.name,
    timezone:
      match?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    currency: match?.currency ?? "CNY",
  };
}
export function DestinationPicker({
  value,
  onChange,
}: {
  value: Destination[];
  onChange: (v: Destination[]) => void;
}) {
  const [adding, setAdding] = useState(!value.length);
  function add(place: Place | null) {
    if (!place) return;
    onChange([...value, toDestination(place)]);
    setAdding(false);
  }
  return (
    <div className="destination-picker">
      {value.map((d, i) => (
        <div className="destination-row" key={`${i}-${d.name}`}>
          <span>
            {d.name}
            {i === 0 && <small>主要目的地</small>}
          </span>
          <button
            type="button"
            className="text-action"
            aria-label={`移除${d.name}`}
            onClick={() => {
              onChange(value.filter((_, index) => index !== i));
              if (value.length === 1) setAdding(true);
            }}
          >
            移除
          </button>
        </div>
      ))}
      {adding && (
        <PlacePicker
          label="目的地"
          value={null}
          placeholder="搜索城市"
          onChange={add}
        />
      )}
      {!adding && value.length < 20 && (
        <button
          type="button"
          className="text-action"
          onClick={() => setAdding(true)}
        >
          ＋ 添加其他目的地
        </button>
      )}
    </div>
  );
}
