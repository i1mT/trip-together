"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bootstrap, TripDocument } from "@/lib/models";
import { api, ApiError, setActiveTrip } from "@/lib/api";
import { track, type AnalyticsPage } from "@/lib/analytics/client";
import { ProfileTrips } from "./profile/trip-switcher";
import { Market, type CopyAttempt } from "./market/market";
import { Login } from "./login";
import { TripList } from "./trips/trip-list";
import { TripWorkspace } from "./trips/workspace";
import { Profile } from "./views/profile";
import { DocumentPreview } from "./views/documents";
import { NavigationDock } from "./navigation/dock";
import { EmptyWorkspace } from "./navigation/empty-workspace";
function savedTrip(memberId: string) {
  try {
    return localStorage.getItem(`active-trip:${memberId}`) || "";
  } catch {
    return "";
  }
}
function rememberTrip(memberId: string, id: string) {
  try {
    localStorage.setItem(`active-trip:${memberId}`, id);
  } catch {}
}
export function AppShell() {
  const [boot, setBoot] = useState<Bootstrap | null>(null),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("today"),
    [managing, setManaging] = useState(false),
    [manageCreate, setManageCreate] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [doc, setDoc] = useState<TripDocument | null>(null);
  const [market, setMarket] = useState(false),
    [shareId, setShareId] = useState(""),
    [marketLogin, setMarketLogin] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShareId(params.get("share") ?? "");
    setMarket(params.has("share") || params.has("market"));
  }, []);
  function browseMarket() {
    setShareId("");
    setMarket(true);
    setMarketLogin(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    url.searchParams.set("market", "1");
    window.history.replaceState(null, "", url);
  }
  function closeMarket() {
    setMarket(false);
    setMarketLogin(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    url.searchParams.delete("market");
    window.history.replaceState(null, "", url);
  }
  const selectedRef = useRef("");
  const pendingCopies = useRef(new Map<string, CopyAttempt>());
  useEffect(() => {
    if (!loading && boot)
      track("page_viewed", managing ? "trips" : (tab as AnalyticsPage));
  }, [loading, Boolean(boot), managing, tab]);
  const expired = useCallback(() => {
    setBoot(null);
    setSelected("");
    selectedRef.current = "";
    setActiveTrip("");
    setManaging(false);
    setTab("today");
    setDoc(null);
  }, []);
  const refresh = useCallback(
    async (requireSession = false) => {
      try {
        const result = await api<Bootstrap>("/bootstrap");
        const preferred = selectedRef.current || savedTrip(result.me.id);
        const id =
          result.trips.find((t) => t.id === preferred)?.id ||
          result.trips[0]?.id ||
          "";
        selectedRef.current = id;
        setActiveTrip(id);
        setSelected(id);
        rememberTrip(result.me.id, id);
        setBoot(result);
        setError("");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          expired();
          if (requireSession) throw e;
        } else throw e;
      }
    },
    [expired],
  );
  useEffect(() => {
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  function navigate(next: string) {
    setTab(next);
    setManaging(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function select(id: string) {
    if (!boot) return;
    selectedRef.current = id;
    setActiveTrip(id);
    setSelected(id);
    rememberTrip(boot.me.id, id);
    setDoc(null);
  }
  function manage() {
    setManageCreate(false);
    setManaging(true);
    void refresh().catch((e) => setError(e.message));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function manageAndCreate() {
    setManageCreate(true);
    setManaging(true);
    void refresh().catch((e) => setError(e.message));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function logout() {
    await api("/logout", { method: "POST", body: "{}" });
    expired();
  }
  if (loading) return <div className="loading-screen">正在加载…</div>;
  if (market && (!marketLogin || boot))
    return (
      <div className="app-shell">
        <Market
          initialId={shareId}
          memberId={boot?.me.id}
          pending={pendingCopies.current}
          onBack={closeMarket}
          onLogin={() => {
            expired();
            setShareId(
              new URLSearchParams(window.location.search).get("share") ?? "",
            );
            setMarketLogin(true);
          }}
          onCopied={async (id) => {
            await refresh(true);
            selectedRef.current = id;
            setActiveTrip(id);
            setSelected(id);
            if (boot) rememberTrip(boot.me.id, id);
            closeMarket();
            setManaging(false);
            setTab("itinerary");
          }}
        />
      </div>
    );
  if (!boot)
    return (
      <>
        {marketLogin && (
          <button className="trip-back" onClick={() => setMarketLogin(false)}>
            返回行程预览
          </button>
        )}
        <Login onLogin={refresh} onBrowseMarket={browseMarket} />
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </>
    );
  return (
    <div className="app-shell">
      {error && (
        <div role="alert" className="network-banner">
          {error}
          <button
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            重试
          </button>
        </div>
      )}
      {managing ? (
        <TripList
          data={boot}
          selected={selected}
          autoCreate={manageCreate}
          onBack={() => {
            setManageCreate(false);
            setManaging(false);
          }}
          onMarket={browseMarket}
          onRefresh={refresh}
          onSelect={(id) => {
            select(id);
            setManageCreate(false);
            setManaging(false);
            setTab("today");
          }}
        />
      ) : (
        <>
          {selected ? (
            <TripWorkspace
              key={selected}
              tab={tab}
              onNavigate={navigate}
              onTripList={manage}
              onSessionExpired={expired}
              onAccountRefresh={refresh}
              tripControls={
                <ProfileTrips
                  data={boot}
                  selected={selected}
                  onSelect={select}
                  onManage={manage}
                />
              }
            />
          ) : (
            <main id="main-content">
              {tab === "profile" ? (
                <Profile
                  data={{ me: boot.me, documents: boot.documents, members: [] }}
                  onRefresh={refresh}
                  onLogout={logout}
                  tripControls={
                    <ProfileTrips
                      data={boot}
                      selected={selected}
                      onSelect={select}
                      onManage={manage}
                    />
                  }
                  onDocument={setDoc}
                />
              ) : (
                <EmptyWorkspace
                  tab={tab}
                  onManage={manage}
                  onCreate={manageAndCreate}
                  onMarket={browseMarket}
                />
              )}
            </main>
          )}
          <NavigationDock data={boot} tab={tab} onNavigate={navigate} />
        </>
      )}
      <DocumentPreview doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
