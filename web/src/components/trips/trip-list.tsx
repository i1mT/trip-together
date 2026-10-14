"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  ArrowLeft,
  ArrowRight,
  Ticket,
  Check,
  Users,
  CalendarDays,
} from "lucide-react";
import type { Bootstrap } from "@/lib/models";
import { api } from "@/lib/api";
import { TripManagement } from "./management";
import { TripForm } from "./trip-form";
import { zoneName } from "@/lib/time";
import { SheetForm, SheetFooter, Sheet } from "../ui";
import { money } from "@/lib/money";
export function TripList({
  data,
  selected,
  onSelect,
  onRefresh,
  onBack,
  onMarket,
  autoCreate = false,
}: {
  data: Bootstrap;
  selected: string;
  onSelect: (id: string) => void;
  onRefresh: () => Promise<void>;
  onBack: () => void;
  onMarket: () => void;
  autoCreate?: boolean;
}) {
  const [detailId, setDetailId] = useState("");
  const detail = data.trips.find((t) => t.id === detailId);
  const [creating, setCreating] = useState(false),
    [joining, setJoining] = useState(false),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<ClaimPreview | null>(null),
    [confirmId, setConfirmId] = useState("");
  useEffect(() => {
    if (autoCreate) setCreating(true);
  }, [autoCreate]);
  async function finishJoin() {
    const r = await api<{ id: string }>("/join", {
      method: "POST",
      body: JSON.stringify({ token: token.trim() }),
    });
    await onRefresh();
    onSelect(r.id);
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await api<ClaimPreview>("/join/preview", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      if (next.placeholders.length) {
        setPreview(next);
        setConfirmId("");
        return;
      }
      await finishJoin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function claim(memberId: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/claim", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), memberId }),
      });
      await onRefresh();
      onSelect(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (detail)
    return (
      <TripManagement
        key={detail.id}
        data={{ trip: detail, me: data.me }}
        active={detail.id === selected}
        onBack={() => setDetailId("")}
        onSelect={() => onSelect(detail.id)}
        onRefresh={onRefresh}
        onDeleted={async () => {
          await onRefresh();
          setDetailId("");
        }}
      />
    );
  return (
    <main className="page-content trip-lobby">
      <div className="trip-manager-heading page-heading-with-back">
        <button
          className="icon-button page-back-button"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1>我的行程</h1>
          <p>创建、加入与切换行程。</p>
        </div>
      </div>
      <div className="trip-entry-actions">
        <div className="trip-entry-row">
          <button
            className="trip-create-entry"
            onClick={() => setCreating(true)}
          >
            <span className="trip-action-icon">
              <Plus size={23} />
            </span>
            <span>
              <strong>创建行程</strong>
              <small>从日期和目的地开始</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <button
            className="trip-join-entry"
            onClick={() => {
              setJoining(true);
              setError("");
            }}
          >
            <span className="trip-action-icon">
              <Users size={21} />
            </span>
            <span>
              <strong>加入行程</strong>
              <small>使用同行人的邀请口令</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </div>
        <button className="trip-join-entry" onClick={onMarket}>
          <span className="trip-action-icon">
            <Ticket size={22} />
          </span>
          <span>
            <strong>旅行攻略市场</strong>
            <small>预览并复制别人分享的行程</small>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="section-heading">
        <h2>行程列表</h2>
        <span className="muted">{data.trips.length} 个行程</span>
      </div>
      {data.trips.length ? (
        <div className="trip-list">
          {data.trips.map((t) => (
            <button
              className={`trip-ticket ${selected === t.id ? "is-active" : ""}`}
              key={t.id}
              onClick={() => setDetailId(t.id)}
              aria-label={`管理行程：${t.title}`}
              aria-pressed={selected === t.id}
            >
              <span className="trip-ticket-top">
                <span>
                  {t.owner_id === data.me.id ? "我创建的" : "我加入的"}
                </span>
                {selected === t.id ? (
                  <span className="trip-current">
                    <Check size={13} />
                    当前行程
                  </span>
                ) : (
                  <ArrowRight size={17} />
                )}
              </span>
              <strong>{t.title}</strong>
              <span className="trip-ticket-date">
                <CalendarDays size={15} />
                {t.start_date} — {t.end_date}
              </span>
              <span className="trip-ticket-bottom">
                {zoneName(t.timezone)}
                <span>管理行程</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="trip-list-empty">
          <Ticket size={29} strokeWidth={1.3} />
          <h3>你的行程会显示在这里</h3>
          <p>可以创建或加入多个行程，随时切换当前查看的旅行。</p>
        </div>
      )}
      {creating && (
        <TripForm
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            await onRefresh();
            onSelect(id);
          }}
        />
      )}
      {joining && (
        <Sheet
          open
          title={preview ? "你是以下哪位？" : "加入行程"}
          onClose={() => !busy && (setJoining(false), setPreview(null))}
        >
          {preview ? (
            <div className="claim-list">
              <p className="muted">
                「{preview.title}
                」里有这些未注册的同伴。认领后，历史账目归到你名下，不用改每一笔。
              </p>
              {preview.placeholders.map((person) => (
                <div className="claim-card" key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                    <p>
                      参与 {person.expenseCount} 笔账 · 累计分摊{" "}
                      {person.approximate ? "约 " : ""}
                      {money(person.shareCny, "CNY")}
                    </p>
                  </div>
                  {confirmId === person.id ? (
                    <div className="claim-confirm">
                      <p>
                        确认你是「{person.name}」？之后可以联系行程创建者更改。
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void claim(person.id)}
                      >
                        确认认领
                      </button>
                      <button type="button" onClick={() => setConfirmId("")}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(person.id)}
                    >
                      认领
                    </button>
                  )}
                </div>
              ))}
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="text-action"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await finishJoin();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                都不是？以新成员加入行程
              </button>
            </div>
          ) : (
            <SheetForm className="editor-form trip-join-form" onSubmit={join}>
              <div className="trip-form-intro">
                <Ticket size={24} />
                <p>
                  向行程创建者索取邀请口令，加入后即可查看安排、资料和共同账本。
                </p>
              </div>
              <label>
                邀请口令
                <input
                  maxLength={6}
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="邀请口令"
                  required
                  value={token}
                  autoComplete="off"
                  placeholder="输入 6 位字母口令"
                  onChange={(e) => {
                    setToken(e.target.value.replace(/\s/g, "").toUpperCase());
                    setError("");
                  }}
                />
              </label>
              <div className="trip-join-submit">
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
                <SheetFooter>
                  <button className="primary-button" disabled={busy}>
                    {busy ? "正在加入…" : "确认加入行程"}
                  </button>
                </SheetFooter>
              </div>
            </SheetForm>
          )}
        </Sheet>
      )}
    </main>
  );
}

type ClaimPreview = {
  tripId: string;
  title: string;
  placeholders: {
    id: string;
    name: string;
    expenseCount: number;
    shareCny: number;
    approximate: boolean;
  }[];
};
