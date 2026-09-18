"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Compass, RefreshCw } from "lucide-react";
import type { TripData, TripDocument, TripEvent } from "@/lib/models";
import { api, ApiError } from "@/lib/api";
import { EventEditor } from "../editors/event-editor";
import { SheetFooter, Sheet } from "../ui";
import { Today } from "../views/today";
import { Itinerary, EventDetail } from "../views/itinerary";
import { Documents, DocumentPreview } from "../views/documents";
import { Ledger } from "../views/ledger";
import { Profile } from "../views/profile";
export function TripWorkspace({
  onTripList,
  onSessionExpired,
  tab,
  onNavigate,
  onAccountRefresh,
  tripControls,
}: {
  onTripList: () => void;
  onSessionExpired: () => void;
  tab: string;
  onNavigate: (tab: string) => void;
  onAccountRefresh: () => Promise<void>;
  tripControls: ReactNode;
}) {
  const [data, setData] = useState<TripData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [now, setNow] = useState(Date.now()),
    [preview, setPreview] = useState<{
      time: number;
      startedAt: number;
    } | null>(null);
  const [doc, setDoc] = useState<TripDocument | null>(null),
    [event, setEvent] = useState<TripEvent | null>(null),
    [offline, setOffline] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{
      event: TripEvent;
      step: 1 | 4;
    } | null>(null),
    [deletingEvent, setDeletingEvent] = useState<TripEvent | null>(null),
    [deleting, setDeleting] = useState(false);
  const displayNow = preview ? preview.time + (now - preview.startedAt) : now;
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const result = await api<TripData>("/trip");
      if (mounted.current) {
        setData(result);
        setEvent((current) =>
          current
            ? (result.events.find((item) => item.id === current.id) ?? null)
            : null,
        );
        setError("");
      }
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status === 401) {
        onSessionExpired();
        setData(null);
        setDoc(null);
        setEvent(null);
      } else if (e instanceof ApiError && e.status === 404) {
        setData(null);
        onTripList();
      } else throw e;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    function online() {
      setOffline(false);
      void refresh().catch((e) => setError(e.message));
    }
    function disconnected() {
      setOffline(true);
    }
    function focus() {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector('[role="dialog"]')
      ) {
        setNow(Date.now());
        void refresh().catch((e) => setError(e.message));
      }
    }
    window.addEventListener("online", online);
    window.addEventListener("offline", disconnected);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", disconnected);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  function navigate(id: string) {
    onNavigate(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function logout() {
    await api("/logout", { method: "POST", body: "{}" });
    onSessionExpired();
    setData(null);
    setDoc(null);
    setEvent(null);
    setPreview(null);
    onNavigate("today");
  }
  if (loading)
    return (
      <div className="loading-screen">
        <Compass size={35} strokeWidth={1.2} />
        <h1>旅行计划</h1>
        <p>正在加载…</p>
      </div>
    );
  if (!data)
    return (
      <div className="empty-state">
        <p role="alert">{error || "正在更新行程…"}</p>
        <button
          className="secondary-button"
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          重试
        </button>
      </div>
    );
  return (
    <>
      {(offline || error) && (
        <div className="network-banner" role="alert">
          {offline ? "当前离线，显示上次加载内容；修改需要网络连接。" : error}
          <button
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            <RefreshCw size={15} />
            重试
          </button>
        </div>
      )}
      <main id="main-content" key={tab} className="view-transition">
        {tab === "today" && (
          <Today
            data={data}
            now={displayNow}
            realNow={now}
            preview={preview !== null}
            onExitPreview={() => setPreview(null)}
            onEvent={setEvent}
            onNavigate={navigate}
          />
        )}
        {tab === "itinerary" && (
          <Itinerary
            data={data}
            onRefresh={refresh}
            now={displayNow}
            onEvent={setEvent}
            onPreview={(date) => {
              const startedAt = Date.now();
              setNow(startedAt);
              setPreview({ time: date, startedAt });
              navigate("today");
            }}
          />
        )}
        {tab === "documents" && (
          <Documents
            onRefresh={refresh}
            documents={data.documents}
            onOpen={setDoc}
          />
        )}
        {tab === "ledger" && (
          <Ledger data={data} onRefresh={refresh} onDocument={setDoc} />
        )}
        {tab === "profile" && (
          <Profile
            data={data}
            onRefresh={async () => {
              await refresh();
              await onAccountRefresh();
            }}
            tripControls={tripControls}
            onLogout={logout}
            onDocument={setDoc}
          />
        )}
      </main>
      <EventDetail
        event={event}
        data={data}
        onRefresh={refresh}
        onStatusChanged={async (updated) => {
          setEvent((current) =>
            current?.id === updated.id ? updated : current,
          );
          setData((current) =>
            current
              ? {
                  ...current,
                  events: current.events.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                }
              : current,
          );
          await refresh().catch((e) => setError(e.message));
        }}
        onEdit={(e, step = 1) => {
          setEvent(null);
          setEditingEvent({ event: e, step });
        }}
        onDelete={(e) => {
          setEvent(null);
          setDeletingEvent(e);
        }}
        onClose={() => setEvent(null)}
        onDocument={(d) => {
          setEvent(null);
          setDoc(d);
        }}
      />
      {editingEvent && (
        <EventEditor
          event={editingEvent.event}
          initialStep={editingEvent.step}
          data={data}
          onClose={() => setEditingEvent(null)}
          onSaved={refresh}
        />
      )}
      {deletingEvent && (
        <Sheet
          open
          title="删除事项"
          onClose={() => !deleting && setDeletingEvent(null)}
        >
          <div className="editor-form">
            <p>确定删除「{deletingEvent.title}」吗？关联文件会保留。</p>
            <SheetFooter>
              <button
                className="primary-button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api(`/events/${deletingEvent.id}`, {
                      method: "DELETE",
                      body: JSON.stringify({ version: deletingEvent.version }),
                    });
                    setDeletingEvent(null);
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                确认删除事项
              </button>
            </SheetFooter>
          </div>
        </Sheet>
      )}
      <DocumentPreview
        key={doc?.id}
        doc={doc}
        onClose={() => setDoc(null)}
        onRenamed={(updated) => {
          setDoc(updated);
          setData((current) =>
            current
              ? {
                  ...current,
                  documents: current.documents.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                }
              : current,
          );
        }}
      />
    </>
  );
}
