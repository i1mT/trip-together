"use client";
import { useState, type ReactNode } from "react";
import {
  LogOut,
  Eye,
  EyeOff,
  Copy,
  ClipboardCheck,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import type { TripData, TripDocument } from "@/lib/models";
import { PersonalDocuments } from "../profile/personal-documents";
import { ProfileEditor, PasswordEditor } from "../account/profile-editor";
import { Avatar } from "../avatar";
import { SectionTitle } from "../ui";
export function Profile({
  data,
  onRefresh,
  onLogout,
  tripControls,
  onDocument,
}: {
  data: Pick<TripData, "me" | "members" | "documents"> & {
    trip?: TripData["trip"];
  };
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
  tripControls: ReactNode;
  onDocument: (doc: TripDocument) => void;
}) {
  const [editing, setEditing] = useState(false),
    [passwordOpen, setPasswordOpen] = useState(false);
  const [visible, setVisible] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${data.me.english_name}\n${data.me.passport}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("无法复制，请手动选择证件信息");
    }
  }
  return (
    <section className="page-content">
      <div className="page-title">
        <h1>我的旅行</h1>
        <p className="muted">管理个人资料、行程与证件文件。</p>
      </div>
      <div className="profile-card">
        <Avatar member={data.me} className="profile-avatar" />
        <div>
          <h2>{data.me.name}</h2>
          <p>{data.me.english_name}</p>
        </div>
        <button
          className="icon-button"
          aria-label="编辑个人资料"
          onClick={() => setEditing(true)}
        >
          <Pencil size={19} />
        </button>
      </div>
      {tripControls}
      {editing && (
        <ProfileEditor
          profile={data.me}
          onSaved={onRefresh}
          onClose={() => setEditing(false)}
        />
      )}
      {passwordOpen && (
        <PasswordEditor
          onLogout={onLogout}
          onClose={() => setPasswordOpen(false)}
        />
      )}
      {data.trip && (
        <>
          <SectionTitle>
            同行成员{" "}
            <span className="section-count">{data.members.length}</span>
          </SectionTitle>
          <div className="member-gallery">
            {data.members.map((member) => (
              <div className="member-tile" key={member.id}>
                <Avatar member={member} />
                <span>{member.name}</span>
                {member.id === data.me.id && <small>我</small>}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="section-heading">
        <h2>证件与文件</h2>
        <span className="personal-private">
          <ShieldCheck size={13} />
          仅本人可见
        </span>
      </div>
      <div className="surface passport-card">
        <div className="passport-top">
          <span>个人证件 · 仅本人可见</span>
          <button
            className="icon-button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "隐藏证件" : "显示证件"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <dl>
          <div>
            <dt>护照号码</dt>
            <dd>
              {!data.me.passport
                ? "尚未填写"
                : visible
                  ? data.me.passport
                  : `${data.me.passport.slice(0, 2)}•••••${data.me.passport.slice(-2)}`}
            </dd>
          </div>
          <div>
            <dt>有效期至</dt>
            <dd>{data.me.expiry || "尚未填写"}</dd>
          </div>
          <div>
            <dt>身份证号码</dt>
            <dd>
              {!data.me.identity_number
                ? "尚未填写"
                : visible
                  ? data.me.identity_number
                  : "•••• •••• •••• •••• " + data.me.identity_number.slice(-2)}
            </dd>
          </div>
        </dl>
        <button className="text-action" onClick={copy}>
          {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}{" "}
          {copied ? "已经复制" : "复制英文名与护照号"}
        </button>
      </div>
      <PersonalDocuments
        data={data}
        onRefresh={onRefresh}
        onDocument={onDocument}
        heading={false}
      />
      <div className="profile-account-actions">
        <button
          className="secondary-button w-full"
          onClick={() => setPasswordOpen(true)}
        >
          修改密码
        </button>
        <button
          className="secondary-button w-full"
          onClick={async () => {
            try {
              await onLogout();
            } catch (e) {
              setError(e instanceof Error ? e.message : "退出失败");
            }
          }}
        >
          <LogOut size={17} />
          退出当前身份
        </button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
