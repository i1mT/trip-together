"use client";
import { useState } from "react";
import type { Member, TripData } from "@/lib/models";
import { api } from "@/lib/api";
import { isMe } from "@/lib/money";
import { Avatar } from "../avatar";
import { SectionTitle } from "../ui";
import { AddCompanion } from "./add-companion";
import { MemberSelect } from "./member-select";

export function CompanionAdmin({
  data,
  onRefresh,
}: {
  data: Pick<TripData, "me" | "members"> & { trip?: TripData["trip"] };
  onRefresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data.trip) return null;
  const owner = data.trip.owner_id === data.me.id;
  const claimed = data.members.filter(
    (member) => member.status !== "placeholder",
  );
  const placeholders = data.members.filter(
    (member) => member.status === "placeholder",
  );
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
      await onRefresh();
      setMergeId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle action="添加同伴" onClick={() => setAdding(true)}>
        同行同伴 <span className="section-count">{data.members.length}</span>
      </SectionTitle>
      <div className="surface divided companion-list">
        {[...claimed, ...placeholders].map((member) => (
          <CompanionRow
            key={member.id}
            member={member}
            mine={isMe(member, data.me.id)}
            owner={owner}
            busy={busy}
            onUnclaim={() =>
              void run(() =>
                api(`/members/${member.id}/unclaim`, {
                  method: "POST",
                  body: "{}",
                }),
              )
            }
            onDelete={() =>
              void run(() => api(`/members/${member.id}`, { method: "DELETE" }))
            }
            onMerge={() => {
              setMergeId(member.id);
              setTargetId("");
            }}
          />
        ))}
      </div>
      {placeholders.length > 0 && (
        <p className="muted companion-note">
          未注册的同伴仍参与分摊。邀请注册后，对方可以认领并在线查看。
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {mergeId && (
        <form
          className="companion-merge"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              api(`/members/${mergeId}/merge`, {
                method: "POST",
                body: JSON.stringify({ targetId }),
              }),
            );
          }}
        >
          <div className="member-field">
            <span>合并到</span>
            <MemberSelect
              label="合并目标"
              members={data.members.filter((member) => member.id !== mergeId)}
              value={targetId}
              onChange={setTargetId}
            />
          </div>
          <button className="primary-button" disabled={busy || !targetId}>
            确认合并
          </button>
          <button type="button" onClick={() => setMergeId("")}>
            取消
          </button>
        </form>
      )}
      <AddCompanion
        open={adding}
        members={data.members}
        onClose={() => setAdding(false)}
        onCreated={async () => {
          await onRefresh();
        }}
      />
    </>
  );
}

function CompanionRow({
  member,
  mine,
  owner,
  busy,
  onUnclaim,
  onDelete,
  onMerge,
}: {
  member: Member;
  mine: boolean;
  owner: boolean;
  busy: boolean;
  onUnclaim: () => void;
  onDelete: () => void;
  onMerge: () => void;
}) {
  const placeholder = member.status === "placeholder";
  return (
    <div className="companion-row">
      <Avatar member={member} />
      <div>
        <strong>
          {member.name}
          {mine && <small> 我</small>}
        </strong>
        {placeholder && <span className="unregistered-badge">未注册</span>}
      </div>
      {owner && !mine && (
        <div className="companion-actions">
          {placeholder ? (
            <>
              {(member.expense_count ?? 0) > 0 ? (
                <button type="button" disabled={busy} onClick={onMerge}>
                  合并到…
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={onDelete}>
                  删除
                </button>
              )}
            </>
          ) : (
            <button type="button" disabled={busy} onClick={onUnclaim}>
              解除认领
            </button>
          )}
        </div>
      )}
    </div>
  );
}
