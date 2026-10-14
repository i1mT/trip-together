"use client";
import { useState } from "react";
import type { Member, TripData } from "@/lib/models";
import { api } from "@/lib/api";
import { isMe } from "@/lib/money";
import { Avatar } from "../avatar";
import { SectionTitle, Sheet, SheetFooter, SheetForm } from "../ui";
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
  const [targetId, setTargetId] = useState("");
  const [modal, setModal] = useState<{
    type: "merge" | "unclaim" | "delete";
    member: Member;
  } | null>(null);
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
      setModal(null);
      setTargetId("");
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
            onUnclaim={() => {
              setError("");
              setModal({ type: "unclaim", member });
            }}
            onDelete={() => {
              setError("");
              setModal({ type: "delete", member });
            }}
            onMerge={() => {
              setError("");
              setModal({ type: "merge", member });
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
      {modal?.type === "merge" && (
        <Sheet
          open
          title="合并占位同伴"
          description={`将「${modal.member.name}」的历史账目归并到另一位同伴。`}
          onClose={() => !busy && setModal(null)}
          className="companion-confirm-sheet"
        >
          <SheetForm
            className="companion-confirm-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!targetId) return;
              void run(() =>
                api(`/members/${modal.member.id}/merge`, {
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
                members={data.members.filter(
                  (member) => member.id !== modal.member.id,
                )}
                value={targetId}
                onChange={setTargetId}
                disabled={busy}
              />
            </div>
            <p className="confirm-consequence">
              合并后，「{modal.member.name}
              」参与的账目和分摊会归到目标同伴名下。这项操作不可撤销，但会保留操作审计记录。
            </p>
            <SheetFooter>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button
                className="primary-button w-full"
                disabled={busy || !targetId}
              >
                确认合并
              </button>
              <button
                type="button"
                className="text-action"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                取消
              </button>
            </SheetFooter>
          </SheetForm>
        </Sheet>
      )}
      {modal?.type === "unclaim" && (
        <Sheet
          open
          title="解除认领"
          description={`将「${modal.member.name}」恢复为未注册占位同伴。`}
          onClose={() => !busy && setModal(null)}
          className="companion-confirm-sheet"
        >
          <div className="companion-confirm-content">
            <p>
              解除后，历史账目仍保留在「{modal.member.name}
              」名下，但对方会失去行程访问权限，需要重新认领。
            </p>
            <p className="confirm-consequence">
              这是可审计的成员状态变更，不会删除账目。
            </p>
          </div>
          <SheetFooter>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button
              className="danger-button w-full"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api(`/members/${modal.member.id}/unclaim`, {
                    method: "POST",
                    body: "{}",
                  }),
                )
              }
            >
              确认解除认领
            </button>
            <button
              className="text-action"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              取消
            </button>
          </SheetFooter>
        </Sheet>
      )}
      {modal?.type === "delete" && (
        <Sheet
          open
          title="删除未注册同伴"
          description={`删除没有账目的占位同伴「${modal.member.name}」。`}
          onClose={() => !busy && setModal(null)}
          className="companion-confirm-sheet"
        >
          <div className="companion-confirm-content">
            <p>这位同伴还没有账目，删除后不会影响分摊记录。</p>
            <p className="confirm-consequence">删除操作不可撤销。</p>
          </div>
          <SheetFooter>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button
              className="danger-button w-full"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api(`/members/${modal.member.id}`, { method: "DELETE" }),
                )
              }
            >
              确认删除
            </button>
            <button
              className="text-action"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              取消
            </button>
          </SheetFooter>
        </Sheet>
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
