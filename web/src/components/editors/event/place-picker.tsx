"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X, LoaderCircle } from "lucide-react";
import type { Place } from "../../../../../shared/places";
import { api } from "@/lib/api";
export function PlacePicker({
  label,
  value,
  legacy,
  placeholder = "搜索城市、酒店、景点或机场",
  onChange,
}: {
  label: string;
  value: Place | null;
  legacy?: string;
  placeholder?: string;
  onChange: (place: Place | null) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Place[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function search() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if (query.trim().length < 2) {
      setError("请输入至少 2 个字的地点名称");
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    setResults([]);
    setSearched(false);
    try {
      const data = await api<{ places: Place[] }>(
        `/places?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setResults(data.places);
        setSearched(true);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="place-picker" aria-label={label}>
      <label>
        {label}
        <div className="place-search">
          <input
            aria-label={`搜索${label}`}
            placeholder={placeholder}
            maxLength={200}
            value={query}
            onChange={(e) => {
              pending.current?.abort();
              setBusy(false);
              setQuery(e.target.value);
              setResults([]);
              setSearched(false);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void search();
              }
            }}
          />
          <button
            type="button"
            className="secondary-button"
            aria-label={`搜索${label}结果`}
            disabled={busy}
            aria-busy={busy}
            onClick={() => void search()}
          >
            {busy ? (
              <LoaderCircle
                size={18}
                className="place-search-spinner"
                aria-hidden="true"
              />
            ) : (
              <Search size={18} aria-hidden="true" />
            )}
            {busy ? "搜索中" : "搜索"}
          </button>
        </div>
      </label>
      {(value || legacy) && (
        <div className="selected-place">
          <MapPin size={20} />
          <div>
            <strong>{value?.name ?? legacy}</strong>
            {value && <small>{value.address}</small>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`移除${label}`}
            onClick={() => onChange(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {searched && !results.length && (
        <p className="muted">
          没有找到匹配地点，试试加上城市名或使用当地名称，也可以稍后再选。
        </p>
      )}
      {results.length > 0 && (
        <div className="place-results" aria-label={`${label}搜索结果`}>
          {results.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() => {
                onChange(place);
                setResults([]);
                setSearched(false);
                setQuery("");
              }}
            >
              <MapPin size={18} />
              <span>
                <strong>{place.name}</strong>
                <small>{place.address}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {(searched || value) && (
        <small className="place-attribution">
          地点数据：
          <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
            Geoapify
          </a>{" "}
          /{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
        </small>
      )}
    </section>
  );
}
