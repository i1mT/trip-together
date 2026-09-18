"use client";
import { useState } from "react";
import type { Profile } from "@/lib/models";
import { api } from "@/lib/api";
import { uploadFile, validateFiles } from "@/lib/files/upload";
import { SheetForm, SheetFooter, Sheet } from "../ui";
import { Avatar } from "../avatar";
import { Field } from "../editors/fields";
export function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState(profile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<number | null>(null);
  const fields = {
    name: "昵称",
    english_name: "英文姓名",
    passport: "护照号码",
    identity_number: "身份证号码",
    expiry: "证件有效期",
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/profile", { method: "PUT", body: JSON.stringify(v) });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function avatar(file?: File) {
    setBusy(true);
    setError("");
    try {
      if (file) {
        validateFiles([file], true);
        await uploadFile("/api/avatar", file, setProgress).promise;
      } else await api("/avatar", { method: "DELETE" });
      const result = await api<{ me: Profile }>("/bootstrap");
      setV((prev) => ({
        ...prev,
        version: result.me.version,
        has_avatar: result.me.has_avatar,
      }));
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  return (
    <Sheet open title="编辑个人资料" onClose={() => !busy && onClose()}>
      <SheetForm className="editor-form" onSubmit={save}>
        <label className="profile-editor-avatar">
          <Avatar member={v} className="profile-avatar-large" />
          <span>点击更换头像</span>
          <input
            type="file"
            hidden
            aria-label="上传头像"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void avatar(file);
            }}
          />
        </label>
        {progress !== null && (
          <progress
            className="profile-editor-progress"
            value={progress}
            max={100}
            aria-label="头像上传进度"
          />
        )}
        {v.has_avatar ? (
          <button
            type="button"
            className="text-action profile-editor-remove"
            disabled={busy}
            onClick={() => void avatar()}
          >
            移除头像
          </button>
        ) : null}
        <Field
          label="昵称"
          value={v.name}
          required
          maxLength={60}
          onChange={(name) => setV({ ...v, name })}
        />
        <details className="optional-details">
          <summary>证件信息（选填，仅自己可见）</summary>
          <div className="optional-fields">
            {Object.entries(fields)
              .filter(([key]) => key !== "name")
              .map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type={key === "expiry" ? "date" : "text"}
                  value={v[key as keyof typeof fields]}
                  onChange={(value) => setV({ ...v, [key]: value })}
                />
              ))}
          </div>
        </details>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <SheetFooter>
          <button className="primary-button" disabled={busy}>
            保存个人资料
          </button>
        </SheetFooter>
      </SheetForm>
    </Sheet>
  );
}
export function PasswordEditor({
  onClose,
  onLogout,
}: {
  onClose: () => void;
  onLogout: () => Promise<void>;
}) {
  const [currentPassword, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Sheet
      open
      title={saved ? "密码已经更新" : "修改密码"}
      onClose={() => !busy && !saved && onClose()}
    >
      {saved ? (
        <div className="editor-form">
          <p>密码已经更新，请使用新密码重新登录。</p>
          <SheetFooter>
            <button
              className="primary-button"
              onClick={() => void onLogout().catch(() => location.reload())}
            >
              重新登录
            </button>
          </SheetFooter>
        </div>
      ) : (
        <SheetForm
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/password", {
                method: "PUT",
                body: JSON.stringify({ currentPassword, password }),
              });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="当前密码"
            type="password"
            value={currentPassword}
            required
            onChange={setCurrent}
          />
          <Field
            label="新密码"
            type="password"
            value={password}
            required
            onChange={setPassword}
          />
          <small>至少 10 个字符，区分大小写。</small>
          {error && <p role="alert">{error}</p>}
          <SheetFooter>
            <button className="primary-button" disabled={busy}>
              保存新密码
            </button>
          </SheetFooter>
        </SheetForm>
      )}
    </Sheet>
  );
}
