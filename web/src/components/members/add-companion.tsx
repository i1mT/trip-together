"use client";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Member } from "@/lib/models";
import { api } from "@/lib/api";
import { Sheet, SheetFooter, SheetForm } from "../ui";

export function AddCompanion({
  open,
  members,
  onClose,
  onCreated,
  onPick,
}: {
  open: boolean;
  members: Member[];
  onClose: () => void;
  onCreated: (member: Member) => void;
  onPick?: (member: Member) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const existing = members.find((member) => member.name === name.trim());
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ member: Member }>("/members", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      onCreated(result.member);
      setName("");
      setConfirming(false);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (existing && !confirming) {
      setConfirming(true);
      return;
    }
    await create();
  }
  return (
    <Sheet
      open={open}
      title="同伴怎么称呼？"
      onClose={() => !busy && onClose()}
    >
      <SheetForm className="editor-form" onSubmit={submit}>
        <label>
          昵称
          <input
            required
            maxLength={40}
            aria-label="同伴昵称"
            value={name}
            placeholder="例如：阿哲"
            onChange={(event) => {
              setName(event.target.value);
              setConfirming(false);
              setError("");
            }}
          />
        </label>
        <p className="muted">
          无需注册。对方加入行程并认领后，这些账会归到对方名下。
        </p>
        {confirming && existing && (
          <p role="alert" className="error-message">
            已有同伴叫「{existing.name}」。是同一个人吗？
          </p>
        )}
        <SheetFooter>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {confirming && existing ? (
            <>
              <button
                type="button"
                className="primary-button w-full"
                onClick={() => {
                  onPick?.(existing);
                  setName("");
                  setConfirming(false);
                  onClose();
                }}
              >
                选择 {existing.name}
              </button>
              <button className="secondary-button w-full" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  "不是，添加为另一个人"
                )}
              </button>
            </>
          ) : (
            <button className="primary-button w-full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                "添加并选中"
              )}
            </button>
          )}
          <button type="button" className="text-action" onClick={onClose}>
            取消
          </button>
        </SheetFooter>
      </SheetForm>
    </Sheet>
  );
}
