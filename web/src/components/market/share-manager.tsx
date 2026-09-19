"use client";
import { useEffect, useState } from "react";
import {
  Globe,
  Copy,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { introductionLimit, type ShareDraft } from "../../../../shared/market";
import { Sheet, SheetFooter, SheetForm } from "../ui";
import { SnapshotView } from "./snapshot-view";
import { useToast } from "../toast";
export function ShareManager({ tripId }: { tripId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false),
    [data, setData] = useState<ShareDraft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirming, setConfirming] = useState(false),
    [revoking, setRevoking] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [introduction, setIntroduction] = useState("");
  const [title, setTitle] = useState("");
  const path = `/trips/${tripId}/share`;
  async function load() {
    setError("");
    const loaded = await api<ShareDraft>(path);
    setData(loaded);
    setIntroduction(loaded.current?.introduction ?? "");
    setTitle(
      loaded.current?.snapshot?.trip?.title ??
        loaded.snapshot?.trip?.title ??
        "",
    );
    setConfirming(false);
  }
  useEffect(() => {
    if (open) {
      setData(null);
      void load().catch((e) => setError(e.message));
    }
  }, [open, tripId]);
  async function mutate(remove = false) {
    const updating = Boolean(data?.current);
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
                confirmed: true,
                introduction,
                title: title.trim() || undefined,
              },
        ),
      });
      await load();
      setRevoking(false);
      toast(remove ? "已取消分享攻略" : updating ? "攻略已更新" : "攻略已发布");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="trip-setting-row"
        onClick={() => {
          setOpen(true);
          setRevoking(false);
          setConfirming(false);
        }}
      >
        <Globe size={21} />
        <span>
          <strong>分享我的行程攻略</strong>
          <small>发布到旅行攻略市场，供别人预览和复制</small>
        </span>
        <ChevronRight size={18} />
      </button>
      <Sheet
        open={open}
        hasChanges={
          confirming &&
          (introduction !== (data?.current?.introduction ?? "") ||
            title.trim() !==
              (data?.current?.snapshot?.trip?.title ??
                data?.snapshot?.trip?.title ??
                ""))
        }
        title={confirming ? "确认分享攻略" : "分享我的行程攻略"}
        onClose={() => {
          if (!busy) {
            if (confirming) setConfirming(false);
            else setOpen(false);
          }
        }}
      >
        <SheetForm
          className="market-share"
          onSubmit={(e) => e.preventDefault()}
        >
          {data?.current && !confirming && !revoking && (
            <div className="market-share-link">
              <button
                type="button"
                className="market-share-toggle"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                <span>这个行程已经公开</span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {expanded && (
                <div className="market-share-link-body">
                  <input
                    className="market-share-code"
                    aria-label="公开分享口令"
                    readOnly
                    value={data.current.code}
                  />
                  <small>
                    告诉朋友这个口令，在旅行攻略市场搜索即可预览和复制，不会加入你的行程。
                  </small>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(data.current!.code);
                        toast("分享口令已复制");
                      } catch {
                        setError("无法自动复制，请选择上方口令手动复制");
                      }
                    }}
                  >
                    <Copy size={16} />
                    复制分享口令
                  </button>
                  <button
                    type="button"
                    className="text-danger"
                    disabled={busy}
                    onClick={() => setRevoking(true)}
                  >
                    取消公开分享
                  </button>
                </div>
              )}
            </div>
          )}
          {confirming ? (
            <div className="market-publish-confirmation">
              <h3>公开「{title.trim() || data?.snapshot?.trip.title}」？</h3>
              <label className="market-introduction-editor">
                公开名称
                <input
                  aria-label="公开名称"
                  maxLength={100}
                  placeholder="默认使用原行程名称"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <small>{title.length}/100 字</small>
              </label>
              <label className="market-introduction-editor">
                行程介绍（选填）
                <textarea
                  aria-label="行程介绍"
                  maxLength={introductionLimit}
                  rows={3}
                  placeholder="介绍适合谁、路线特色或旅行建议"
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                />
                <small>
                  {introduction.length}/{introductionLimit} 字
                </small>
              </label>
              <p>
                作者头像、昵称和介绍也会公开，任何人都可以查看名称、日期、时间、地点和路线，并复制为自己的行程。请确认这些内容没有私人信息。
              </p>
              <small>
                资料、同行成员、账本、电话、预订编号和私人备注不会公开。之后可以取消分享。
              </small>
            </div>
          ) : revoking ? (
            <p>
              取消后，分享口令和市场预览将无法访问。别人已经复制的行程会保留。
            </p>
          ) : (
            <>
              <p className="market-privacy">
                公开后会展示在旅行攻略市场，任何人都能查看地点与路线，并复制行程。
                <strong>
                  资料、同行成员、账本、电话、预订编号与备注不会公开。
                </strong>
              </p>
              {data?.snapshot ? (
                <SnapshotView
                  snapshot={data.snapshot}
                  title={title.trim() || undefined}
                />
              ) : data ? (
                <p className="empty-state">请先添加行程安排，再公开分享。</p>
              ) : (
                !error && <p role="status">正在准备预览…</p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
              <button
                type="button"
                className="text-action"
                onClick={() => void load().catch((e) => setError(e.message))}
              >
                重新读取
              </button>
            </p>
          )}
          <SheetFooter>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  返回预览
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void mutate()}
                >
                  {busy ? "正在发布…" : "确认公开发布"}
                </button>
              </>
            ) : revoking ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setRevoking(false)}
                >
                  保留分享
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void mutate(true)}
                >
                  确认取消分享
                </button>
              </>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !data?.snapshot}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {busy
                  ? "正在发布…"
                  : data?.current
                    ? "更新公开版本"
                    : "公开发布"}
              </button>
            )}
          </SheetFooter>
        </SheetForm>
      </Sheet>
    </>
  );
}
