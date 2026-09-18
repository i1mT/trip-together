"use client";
import { useEffect, useState } from "react";
import { Globe, Copy } from "lucide-react";
import { api } from "@/lib/api";
import type { ShareDraft } from "../../../../shared/market";
import { Sheet, SheetFooter } from "../ui";
import { SnapshotView } from "./snapshot-view";
export function ShareManager({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<ShareDraft | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [revoking, setRevoking] = useState(false);
  const path = `/trips/${tripId}/share`;
  async function load() {
    setError("");
    setData(await api<ShareDraft>(path));
    setConfirmed(false);
  }
  useEffect(() => {
    if (open) {
      setData(null);
      void load().catch((e) => setError(e.message));
    }
  }, [open, tripId]);
  async function mutate(remove = false) {
    setBusy(true);
    setError("");
    try {
      await api(path, {
        method: remove ? "DELETE" : "POST",
        body: JSON.stringify(
          remove
            ? {
                version: data?.current?.version,
                publicationId: data?.current?.id,
              }
            : {
                hash: data?.hash,
                publicationId: data?.current?.id ?? null,
                version: data?.current?.version ?? 0,
                confirmed,
              },
        ),
      });
      await load();
      setRevoking(false);
      setNotice(
        remove ? "已经取消公开分享" : "公开行程已经发布，可在行程市场查看",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const url = data?.current
    ? `${typeof window === "undefined" ? "" : window.location.origin}/?share=${data.current.id}`
    : "";
  return (
    <>
      <button
        className="trip-setting-row"
        onClick={() => {
          setOpen(true);
          setNotice("");
          setRevoking(false);
        }}
      >
        <Globe size={21} />
        <span>
          <strong>公开分享行程</strong>
          <small>发布到行程市场，供别人预览和复制</small>
        </span>
      </button>
      <Sheet
        open={open}
        title="公开分享行程"
        onClose={() => !busy && setOpen(false)}
      >
        <div className="market-share">
          {data?.current && (
            <div className="market-share-link">
              <strong>这个行程已经公开</strong>
              <input aria-label="公开分享链接" readOnly value={url} />
              <button
                className="secondary-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setNotice("分享链接已经复制");
                  } catch {
                    setError("无法自动复制，请选择上方链接手动复制");
                  }
                }}
              >
                <Copy size={16} />
                复制分享链接
              </button>
              <button
                className="text-action"
                disabled={busy}
                onClick={() => setRevoking(true)}
              >
                取消公开分享
              </button>
            </div>
          )}
          {revoking ? (
            <p>
              取消后，公开链接和市场预览将无法访问。别人已经复制的行程会保留。
            </p>
          ) : (
            <>
              <p className="market-privacy">
                公开后，任何人都能查看下方名称、日期、时间、地点与路线，并复制行程。请确认这些内容中没有私人信息。资料、成员、账本、电话、预订编号与备注不会公开。
              </p>
              {data?.snapshot ? (
                <>
                  <SnapshotView snapshot={data.snapshot} />
                  <label className="market-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    我已检查预览内容，同意公开分享
                  </label>
                </>
              ) : data ? (
                <p className="empty-state">请先添加行程事项，再公开分享。</p>
              ) : (
                !error && <p role="status">正在准备预览…</p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
              <button
                className="text-action"
                onClick={() => void load().catch((e) => setError(e.message))}
              >
                重新读取
              </button>
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <SheetFooter>
            {revoking ? (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setRevoking(false)}
                >
                  保留分享
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void mutate(true)}
                >
                  确认取消分享
                </button>
              </>
            ) : (
              <button
                className="primary-button"
                disabled={busy || !data?.snapshot || !confirmed}
                onClick={() => void mutate()}
              >
                {busy
                  ? "正在发布…"
                  : data?.current
                    ? "更新公开版本"
                    : "确认公开发布"}
              </button>
            )}
          </SheetFooter>
        </div>
      </Sheet>
    </>
  );
}
