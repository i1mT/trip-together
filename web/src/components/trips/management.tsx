"use client";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Settings2,
  ChevronRight,
  Users,
  Copy,
  Trash2,
  Check,
  ArrowRight,
} from "lucide-react";
import type { TripData } from "@/lib/models";
import { api } from "@/lib/api";
import { SheetFooter, Sheet } from "../ui";
import { ShareManager } from "../market/share-manager";
import { TripForm } from "./trip-form";
import { useToast } from "../toast";
export function TripManagement({
  data,
  active,
  onRefresh,
  onBack,
  onSelect,
  onDeleted,
}: {
  data: Pick<TripData, "trip" | "me">;
  active: boolean;
  onRefresh: () => Promise<void>;
  onBack: () => void;
  onSelect: () => void;
  onDeleted: () => Promise<void>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false),
    [invite, setInvite] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false),
    [revoking, setRevoking] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const owner = data.trip.owner_id === data.me.id;
  const invitePath = `/trips/${data.trip.id}/invites`;
  const [inviteLoading, setInviteLoading] = useState(owner);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    api<{ token: string | null }>(invitePath)
      .then((r) => {
        if (active) setInvite(r.token ?? "");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setInviteLoading(false);
      });
    return () => {
      active = false;
    };
  }, [invitePath, owner]);
  async function generate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ token: string }>(invitePath, {
        method: "POST",
        body: "{}",
      });
      setInvite(r.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-content trip-lobby trip-management">
      <div className="trip-manager-heading page-heading-with-back">
        <button
          className="icon-button page-back-button"
          onClick={onBack}
          aria-label="返回我的行程"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1>{data.trip.title}</h1>
          <p>
            {data.trip.start_date} — {data.trip.end_date}
          </p>
        </div>
      </div>
      <div className="trip-detail-status">
        <span>{owner ? "我创建的行程" : "我加入的行程"}</span>
        {active ? (
          <span>
            <Check size={14} />
            当前行程
          </span>
        ) : (
          <button className="text-action" onClick={onSelect}>
            设为当前行程
            <ArrowRight size={15} />
          </button>
        )}
      </div>
      {owner ? (
        <>
          <div className="trip-management-actions">
            <button
              className="trip-setting-row"
              onClick={() => setEditing(true)}
            >
              <Settings2 size={21} />
              <span>
                <strong>行程设置</strong>
                <small>名称、日期、时区与币种</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <ShareManager tripId={data.trip.id} />
          </div>
          <section className="trip-invitation">
            <div className="section-heading">
              <h2>
                <Users size={19} />
                同行邀请
              </h2>
            </div>
            <p>通过邀请口令加入此行程，共享安排、资料和账本。</p>
            {invite ? (
              <>
                <label className="invite-code-label">
                  同行邀请口令
                  <input
                    className="short-invite-code"
                    aria-label="同行邀请口令"
                    readOnly
                    value={invite}
                  />
                </label>
                <small>有效期为 7 天。生成新口令后，旧口令会失效。</small>
                <button
                  className="secondary-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invite);
                      setNotice("邀请口令已经复制");
                    } catch {
                      setError("无法复制，请手动选择口令");
                    }
                  }}
                >
                  <Copy size={16} />
                  复制邀请口令
                </button>
              </>
            ) : (
              <small>口令有效期为 7 天。生成新口令后，旧口令会失效。</small>
            )}
            <button
              className={invite ? "text-action" : "secondary-button"}
              disabled={busy || inviteLoading}
              onClick={() => void generate()}
            >
              {inviteLoading
                ? "正在读取…"
                : busy
                  ? "正在生成…"
                  : invite
                    ? "重新生成邀请口令"
                    : "生成同行邀请"}
            </button>
            <button
              className="text-action"
              disabled={busy || inviteLoading}
              onClick={() => setRevoking(true)}
            >
              撤销所有邀请
            </button>
          </section>
          <div className="trip-danger-zone">
            <button
              className="text-danger"
              onClick={() => {
                setError("");
                setDeleting(true);
              }}
            >
              <Trash2 size={16} />
              删除整个行程
            </button>
            <small>删除会影响所有同行成员，需要再次确认。</small>
          </div>
        </>
      ) : (
        <div className="trip-member-note">
          <Users size={23} />
          <p>
            你可以共同维护行程安排、资料和账本。行程设置、邀请和删除由创建者管理。
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {editing && (
        <TripForm
          trip={data.trip}
          onClose={() => setEditing(false)}
          onSaved={onRefresh}
        />
      )}
      {revoking && (
        <Sheet
          open
          title="撤销同行邀请"
          onClose={() => !busy && setRevoking(false)}
        >
          <div className="editor-form">
            <p>
              撤销后，现有口令不能继续加入此行程。已经加入的成员不会受到影响。
            </p>
            {error && <p role="alert">{error}</p>}
            <SheetFooter>
              <button
                className="primary-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(invitePath, { method: "DELETE" });
                    setInvite("");
                    setNotice("邀请已经全部撤销");
                    setRevoking(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                确认撤销邀请
              </button>
            </SheetFooter>
          </div>
        </Sheet>
      )}
      {deleting && (
        <Sheet
          open
          title="删除整个行程"
          onClose={() => !busy && setDeleting(false)}
        >
          <div className="editor-form">
            <p>
              将删除「{data.trip.title}
              」的所有事项、共享文件、账本、邀请和清单。个人账号与个人证件保留。
            </p>
            <label>
              输入行程名称确认
              <input
                aria-label="输入行程名称确认"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <SheetFooter>
              <button
                className="danger-button"
                disabled={busy || confirmation !== data.trip.title}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(`/trips/${data.trip.id}`, {
                      method: "DELETE",
                      body: JSON.stringify({ title: confirmation }),
                    });
                    await onDeleted();
                    toast("行程已删除");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                确认删除整个行程
              </button>
            </SheetFooter>
          </div>
        </Sheet>
      )}
    </main>
  );
}
