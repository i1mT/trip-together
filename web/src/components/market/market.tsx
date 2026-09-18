"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Search } from "lucide-react";
import type { MarketCard, PublicItinerary } from "../../../../shared/market";
import { api, ApiError } from "@/lib/api";
import { Sheet, SheetForm, SheetFooter } from "../ui";
import { MarketAuthor } from "./author";
import { SnapshotView } from "./snapshot-view";
export type CopyAttempt = { requestId: string; date: string; copiedId: string };
export function Market({
  initialId = "",
  memberId,
  pending,
  onBack,
  onLogin,
  onCopied,
}: {
  initialId?: string;
  memberId?: string;
  pending: Map<string, CopyAttempt>;
  onBack: () => void;
  onLogin: () => void;
  onCopied: (id: string) => Promise<void>;
}) {
  const [id, setId] = useState(initialId),
    [detail, setDetail] = useState<PublicItinerary | null>(null),
    [items, setItems] = useState<MarketCard[]>([]),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [copying, setCopying] = useState(false),
    [busy, setBusy] = useState(false),
    [date, setDate] = useState(""),
    [requestId, setRequestId] = useState(""),
    [copiedId, setCopiedId] = useState("");
  const signedIn = Boolean(memberId),
    pendingKey = `${memberId}:${id}`;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setDetail(null);
    (id
      ? api<PublicItinerary>(`/market/${id}`).then((r) => {
          if (alive) {
            setDetail(r);
            setDate(r.snapshot.trip.start_date);
          }
        })
      : api<{ items: MarketCard[]; hasMore: boolean }>(
          `/market?q=${encodeURIComponent(query)}&page=${page}`,
        ).then((r) => {
          if (alive) {
            setItems(r.items);
            setMore(r.hasMore);
          }
        })
    )
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, query, page, retry]);
  function open(next: string) {
    setId(next);
    setCopying(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("market");
    if (next) url.searchParams.set("share", next);
    else {
      url.searchParams.delete("share");
      url.searchParams.set("market", "1");
    }
    window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
  }
  async function copy(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setAttempted(true);
    pending.set(pendingKey, { requestId, date, copiedId });
    setError("");
    try {
      const result = copiedId
        ? { id: copiedId }
        : await api<{ id: string }>(`/market/${id}/copy`, {
            method: "POST",
            body: JSON.stringify({
              requestId,
              version: detail.version,
              start_date: date,
            }),
          });
      setCopiedId(result.id);
      pending.set(pendingKey, { requestId, date, copiedId: result.id });
      await onCopied(result.id);
      pending.delete(pendingKey);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onLogin();
        return;
      }
      if (
        !copiedId &&
        e instanceof ApiError &&
        [400, 404, 409].includes(e.status)
      ) {
        setAttempted(false);
        pending.delete(pendingKey);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content market-page">
      <button className="trip-back" onClick={() => (id ? open("") : onBack())}>
        <ArrowLeft size={20} />
        {id ? "返回行程市场" : "返回"}
      </button>
      {id ? (
        <>
          <div className="trip-manager-heading">
            <h1>行程预览</h1>
            <p>复制一份，再按自己的旅行计划修改。</p>
          </div>
          {detail && (
            <>
              <MarketAuthor author={detail.author} />
              <span className="market-code">分享口令 {detail.code}</span>
              {detail.introduction && (
                <p className="market-introduction-full">
                  {detail.introduction}
                </p>
              )}
              <SnapshotView snapshot={detail.snapshot} />
              <p className="market-privacy">
                只复制行程安排，不包含资料、成员、账本或预订信息。复制不会加入原行程。
              </p>
              <div className="market-copy-bar">
                <button
                  className="primary-button"
                  onClick={() => {
                    if (!signedIn) {
                      onLogin();
                      return;
                    }
                    const previous = pending.get(pendingKey);
                    setAttempted(Boolean(previous));
                    setCopying(true);
                    setRequestId(previous?.requestId ?? crypto.randomUUID());
                    setCopiedId(previous?.copiedId ?? "");
                    setDate(previous?.date ?? detail.snapshot.trip.start_date);
                    setError("");
                  }}
                >
                  {signedIn ? "复制为我的行程" : "登录后复制行程"}
                  <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="trip-manager-heading">
            <h1>行程市场</h1>
            <p>参考公开行程，复制成自己的旅行安排。</p>
          </div>
          <form
            className="market-search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(search);
            }}
          >
            <input
              aria-label="搜索公开行程"
              placeholder="搜索分享口令、目的地或行程名称"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button aria-label="搜索" disabled={loading}>
              <Search size={21} />
            </button>
          </form>
          {!loading && !error && items.length === 0 ? (
            <div className="empty-state">
              <Compass size={32} />
              <h2>{query ? "没有找到匹配的行程" : "还没有公开行程"}</h2>
              <p>
                {query
                  ? "换个目的地或名称试试。"
                  : "你可以在“我的行程”中，预览并公开分享自己的旅行安排。"}
              </p>
            </div>
          ) : (
            <div className="market-grid">
              {!loading &&
                items.map((item) => (
                  <button
                    className="trip-ticket market-card"
                    key={item.id}
                    onClick={() => open(item.id)}
                  >
                    <span className="market-tag">
                      {item.days} 天 · {item.event_count} 个事项
                    </span>
                    <strong>{item.title}</strong>
                    <MarketAuthor author={item.author} />
                    {item.introduction && (
                      <span className="market-introduction-excerpt">
                        {item.introduction}
                      </span>
                    )}
                    <span>
                      {item.destinations.join(" · ") || "查看旅行路线"}
                    </span>
                    <span className="trip-ticket-bottom">
                      预览行程
                      <ArrowRight size={18} />
                    </span>
                  </button>
                ))}
            </div>
          )}
          {(page > 0 || more) && (
            <div className="market-pagination">
              <button
                className="secondary-button"
                disabled={!page || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span>第 {page + 1} 页</span>
              <button
                className="secondary-button"
                disabled={!more || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
      {loading && <p role="status">正在加载行程…</p>}
      {error && !copying && (
        <div role="alert" className="error-message">
          {error}
          <button
            className="text-action"
            onClick={() => setRetry((n) => n + 1)}
          >
            重试
          </button>
        </div>
      )}
      <Sheet
        key={`${id}:${copying}`}
        open={copying}
        title="复制为我的行程"
        onClose={() => !busy && setCopying(false)}
      >
        <SheetForm className="editor-form" onSubmit={copy}>
          <p>会创建独立行程。原行程之后的修改不会影响你的安排。</p>
          <label>
            我的出发日期
            <input
              aria-label="我的出发日期"
              type="date"
              required
              value={date}
              disabled={busy || attempted || Boolean(copiedId)}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <small>
            全部事项按日期整体调整，保留各地当地时间；机票、住宿等需要自行重新预订。
          </small>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <SheetFooter>
            <button className="primary-button" disabled={busy || !date}>
              {busy
                ? "正在复制…"
                : copiedId
                  ? "打开已经复制的行程"
                  : "确认复制"}
            </button>
          </SheetFooter>
        </SheetForm>
      </Sheet>
    </main>
  );
}
