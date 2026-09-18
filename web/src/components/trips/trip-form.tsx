"use client";
import { useEffect, useRef, useState } from "react";
import type { Trip } from "@/lib/models";
import { api } from "@/lib/api";
import { localDate } from "@/lib/time";
import {
  currencyNames,
  readableZone,
  type Destination,
} from "../../../../shared/travel-options";
import { SheetForm, SheetFooter, Sheet } from "../ui";
import { Field, ZoneField, CurrencyField } from "../editors/fields";
import { DestinationPicker } from "./destination-picker";
export function TripForm({
  trip,
  onClose,
  onSaved,
}: {
  trip?: Trip;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const preferenceKey = useRef("");
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [v, setV] = useState({
    title: trip?.title ?? "",
    start_date: trip?.start_date ?? localDate(new Date(), deviceZone),
    end_date: trip?.end_date ?? localDate(new Date(), deviceZone),
    timezone: trip?.timezone ?? deviceZone,
    home_timezone: trip?.home_timezone ?? deviceZone,
    currency: trip?.currency ?? "CNY",
    home_currency: trip?.home_currency ?? "CNY",
  });
  const [places, setPlaces] = useState<Destination[]>(trip?.destinations ?? []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (trip) return;
    let mounted = true;
    void api<{ me: { id: string } }>("/bootstrap")
      .then(({ me }) => {
        if (!mounted) return;
        preferenceKey.current = `trip-home:${me.id}`;
        try {
          const stored = localStorage.getItem(preferenceKey.current);
          if (stored) {
            const pref = JSON.parse(stored);
            new Intl.DateTimeFormat("en", { timeZone: pref.home_timezone });
            if (pref.home_currency in currencyNames)
              setV((prev) => ({
                ...prev,
                home_timezone: pref.home_timezone,
                home_currency: pref.home_currency,
              }));
          }
        } catch {}
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [trip]);
  const change = (key: string, value: string) => setV({ ...v, [key]: value });
  function changePlaces(next: Destination[]) {
    setPlaces(next);
    if (next[0] && next[0] !== places[0])
      setV({ ...v, timezone: next[0].timezone, currency: next[0].currency });
  }
  const suggested = places.length
    ? `${places.map((d) => d.name.split(" · ")[0].split(" / ")[0]).join("、")}旅行`
    : "我的旅行";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!trip && !places.length) {
      setError("请选择一个目的地");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ id: string }>(
        trip ? `/trips/${trip.id}` : "/trips",
        {
          method: trip ? "PUT" : "POST",
          body: JSON.stringify({
            ...v,
            title: v.title.trim() || suggested.slice(0, 100),
            destinations: places,
            version: trip?.version,
          }),
        },
      );
      try {
        if (preferenceKey.current)
          localStorage.setItem(
            preferenceKey.current,
            JSON.stringify({
              home_timezone: v.home_timezone,
              home_currency: v.home_currency,
            }),
          );
      } catch {}
      await onSaved(trip?.id ?? result.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      title={trip ? "行程设置" : "创建行程"}
      onClose={() => !busy && onClose()}
    >
      <SheetForm className="editor-form" onSubmit={save}>
        <DestinationPicker value={places} onChange={changePlaces} />
        <div className="form-grid">
          <Field
            label="出发日期"
            type="date"
            value={v.start_date}
            required
            onChange={(start_date) =>
              setV({
                ...v,
                start_date,
                end_date: v.end_date < start_date ? start_date : v.end_date,
              })
            }
          />
          <Field
            label="返回日期"
            type="date"
            value={v.end_date}
            min={v.start_date}
            required
            onChange={(x) => change("end_date", x)}
          />
        </div>
        <Field
          label="行程名称（选填）"
          value={v.title}
          placeholder={suggested}
          maxLength={100}
          onChange={(x) => change("title", x)}
        />
        <p className="muted">
          使用{currencyNames[v.currency as keyof typeof currencyNames]} ·{" "}
          {readableZone(v.timezone)}
        </p>
        <details className="optional-details">
          <summary>调整时间与币种</summary>
          <div className="optional-fields">
            <div className="form-grid">
              <ZoneField
                label="目的地当地时间"
                value={v.timezone}
                onChange={(x) => change("timezone", x)}
              />
              <CurrencyField
                label="目的地币种"
                value={v.currency}
                onChange={(x) => change("currency", x)}
              />
            </div>
            <div className="form-grid">
              <ZoneField
                label="常住地时间"
                value={v.home_timezone}
                onChange={(x) => change("home_timezone", x)}
              />
              <CurrencyField
                label="常用币种"
                value={v.home_currency}
                onChange={(x) => change("home_currency", x)}
              />
            </div>
            <small>跨国旅行的每个事项可以选择自己的当地时间。</small>
          </div>
        </details>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <SheetFooter>
          <button className="primary-button" disabled={busy}>
            {busy ? "正在保存…" : trip ? "保存行程" : "创建行程"}
          </button>
        </SheetFooter>
      </SheetForm>
    </Sheet>
  );
}
