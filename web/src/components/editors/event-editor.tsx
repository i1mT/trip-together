"use client";
import { useEffect } from "react";
import { track } from "@/lib/analytics/client";
import { useRef, useState } from "react";
import type { TripData, TripEvent, TripDocument } from "@/lib/models";
import { api } from "@/lib/api";
import { localInput, zonedChoices } from "@/lib/zoned-input";
import { localDate } from "@/lib/time";
import { SheetForm, SheetFooter, Sheet, EventIcon } from "../ui";
import { Field } from "./fields";
import { EventTimeFields, type Timing } from "./event-time-fields";
import { DocumentChoices } from "./document-choices";
import { DocumentUpload } from "../files/document-manager";
import { resolveTiming } from "./event/timing";
import { PlacePicker } from "./event/place-picker";
import { useToast } from "../toast";
import type { Place } from "../../../../shared/places";
const kinds = {
  explore: "活动",
  flight: "航班",
  stay: "住宿",
  drive: "自驾",
  transfer: "交通",
} as const;
export function EventEditor({
  event,
  data,
  initialDate,
  initialStep = 1,
  onClose,
  onSaved,
}: {
  event?: TripEvent;
  data: TripData;
  initialDate?: string;
  initialStep?: 1 | 4;
  onClose: () => void;
  onSaved: (date?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [step, setStep] = useState<number>(initialStep);
  useEffect(() => {
    track("event_form_opened", "itinerary");
  }, []);
  useEffect(() => {
    track("event_step_viewed", "itinerary", step);
  }, [step]);
  const zone = event?.timezone ?? data.trip.timezone;
  const day = initialDate ?? data.trip.start_date;
  const [v, setV] = useState({
    title: event?.title ?? "",
    subtitle: event?.subtitle ?? "",
    kind: event?.kind ?? "explore",
    certainty: event?.certainty ?? "suggested",
    place: event?.place ?? "",
    address: event?.address ?? "",
    phone: event?.phone ?? "",
    note: event?.note ?? "",
    from: event?.from ?? "",
    to: event?.to ?? "",
    code: event?.code ?? "",
  });
  const [timing, setTiming] = useState<Timing>({
    range: event
      ? (event.timeRange ??
        (event.timeMode === "date"
          ? !!event.dateEnd && event.dateEnd !== localDate(event.start, zone)
          : !event.endUnspecified))
      : false,
    date: event ? localDate(event.start, zone) : day,
    endDate: event
      ? (event.dateEnd ?? localDate(event.end, event.endTimezone ?? zone))
      : day,
    startTime:
      event && event.timeMode !== "date"
        ? localInput(event.start, zone).slice(11)
        : "",
    endTime:
      event && event.timeMode !== "date" && !event.endUnspecified
        ? localInput(event.end, event.endTimezone ?? zone).slice(11)
        : "",
    timezone: zone,
    endTimezone: event?.endTimezone ?? zone,
    timeMode: event?.timeMode ?? (event ? "timed" : "date"),
    firstChoice: event
      ? String(
          zonedChoices(localInput(event.start, zone), zone).findIndex(
            (x) => Date.parse(x) === Date.parse(event.start),
          ),
        )
      : "",
    lastChoice: event
      ? String(
          zonedChoices(
            localInput(event.end, event.endTimezone ?? zone),
            event.endTimezone ?? zone,
          ).findIndex((x) => Date.parse(x) === Date.parse(event.end)),
        )
      : "",
  });
  const [location, setLocation] = useState<Place | null>(
    event?.location ?? null,
  );
  const [departure, setDeparture] = useState<Place | null>(
    event?.departureLocation ?? null,
  );
  const [documents, setDocuments] = useState(event?.documents ?? []),
    [uploaded, setUploaded] = useState<TripDocument[]>([]),
    [uploading, setUploading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const draft = JSON.stringify({ v, timing, location, departure, documents });
  const initialDraft = useRef(draft);
  const change = (key: string, value: string) => setV({ ...v, [key]: value });
  const transport = ["flight", "drive", "transfer"].includes(v.kind),
    stay = v.kind === "stay";
  const suggested = transport && v.from && v.to ? `${v.from} → ${v.to}` : "";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (step < 4) {
      try {
        if (step === 2) resolveTiming(timing, v.kind);
        setError("");
        setStep(step + 1);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    setError("");
    setBusy(true);
    try {
      const resolved = resolveTiming(timing, v.kind);
      await api(`/events${event ? `/${event.id}` : ""}`, {
        method: event ? "PUT" : "POST",
        body: JSON.stringify({
          ...v,
          from: transport ? v.from : "",
          to: transport ? v.to : "",
          code: transport || stay ? v.code : "",
          phone: stay ? v.phone : "",
          title: v.title.trim() || suggested,
          place: location?.name || v.place,
          ...resolved,
          location,
          departureLocation: transport ? departure : null,
          source: event?.source || "手动添加",
          documents,
          version: event?.version,
        }),
      });
      await onSaved(timing.date);
      toast(event ? "安排已更新" : "安排已创建");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const docs = [
    ...data.documents.filter((d) => d.trip_id === data.trip.id),
    ...uploaded,
  ].filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i);
  return (
    <Sheet
      open
      title={event ? "修改事项" : "添加事项"}
      className="event-entry-sheet event-wizard"
      hasChanges={draft !== initialDraft.current}
      onClose={() => !busy && onClose()}
    >
      <SheetForm className="editor-form" onSubmit={save}>
        {step === 1 && (
          <>
            <div
              className="event-type-picker"
              role="group"
              aria-label="事项类型"
            >
              {Object.entries(kinds).map(([kind, name]) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={v.kind === kind}
                  onClick={() => change("kind", kind)}
                >
                  <EventIcon kind={kind as TripEvent["kind"]} size={21} />
                  {name}
                </button>
              ))}
            </div>
            <Field
              label={stay ? "酒店名称" : transport ? "事项名称" : "活动名称"}
              value={v.title}
              required
              maxLength={150}
              onChange={(s) => change("title", s)}
            />
            <details className="optional-details">
              <summary>补充说明（选填）</summary>
              <div className="optional-fields">
                {(stay || transport) && (
                  <Field
                    label={v.kind === "flight" ? "航班号" : "预订编号"}
                    value={v.code}
                    onChange={(s) => change("code", s)}
                  />
                )}
                {stay && (
                  <Field
                    label="酒店电话"
                    type="tel"
                    value={v.phone}
                    onChange={(s) => change("phone", s)}
                  />
                )}
                <label>
                  说明
                  <textarea
                    aria-label="说明"
                    value={v.note}
                    maxLength={3000}
                    onChange={(e) => change("note", e.target.value)}
                  />
                </label>
              </div>
            </details>
          </>
        )}
        {step === 2 && (
          <EventTimeFields v={timing} kind={v.kind} onChange={setTiming} />
        )}
        <div hidden={step !== 3} className="event-place-step">
          <p className="muted">
            搜索并选择地点后，自动保存地址。请核对城市与名称；尚未确定可以直接下一步。
          </p>
          {transport && (
            <PlacePicker
              label="出发地"
              value={departure}
              legacy={v.from}
              onChange={(place) => {
                setDeparture(place);
                setV((prev) => ({ ...prev, from: place?.name ?? "" }));
              }}
            />
          )}
          <PlacePicker
            label={transport ? "目的地" : "地点"}
            value={location}
            legacy={[v.place || (transport ? v.to : ""), v.address]
              .filter(Boolean)
              .join(" · ")}
            onChange={(place) => {
              setLocation(place);
              setV((prev) => ({
                ...prev,
                place: place?.name ?? "",
                address: place?.address ?? "",
                ...(transport ? { to: place?.name ?? "" } : {}),
              }));
            }}
          />
        </div>
        {step === 4 && (
          <section className="event-document-section" aria-label="关联资料选择">
            <h3>
              关联资料
              <small>
                {documents.length
                  ? `已选 ${documents.length} 份`
                  : "点击选择，可多选"}
              </small>
            </h3>
            <DocumentChoices
              documents={docs}
              selected={documents}
              onChange={setDocuments}
              onUpload={() => setUploading(true)}
            />
            <p className="muted">上传后自动关联，并保存到旅行资料中。</p>
          </section>
        )}
        <SheetFooter className="entry-step-actions">
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {step > 1 && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              上一步
            </button>
          )}
          <button className="primary-button" disabled={busy}>
            {busy
              ? "正在保存…"
              : step < 4
                ? "下一步"
                : event
                  ? "保存修改"
                  : `添加${kinds[v.kind]}`}
          </button>
        </SheetFooter>
      </SheetForm>
      {uploading && (
        <DocumentUpload
          categories={docs.map((d) => d.category)}
          category={stay ? "住宿" : transport ? "交通" : "行程"}
          onClose={() => setUploading(false)}
          onUploaded={(docs) => {
            setUploaded((prev) => [...prev, ...docs]);
            setDocuments((prev) => [
              ...new Set([...prev, ...docs.map((d) => d.id)]),
            ]);
          }}
          onSaved={async () => {}}
        />
      )}
    </Sheet>
  );
}
