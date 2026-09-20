"use client";
import { useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Sheet, SheetFooter } from "../ui";
import { EmptyState } from "../empty-state";
import { useToast } from "../toast";
type Token = {
  id: string;
  label: string;
  created_at: number;
  last_used_at: number;
  expires_at: number;
};
function moment(value: number) {
  const date = new Date(value),
    sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString("zh-CN", {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function ApiTokens({ onClose }: { onClose: () => void }) {
  const [tokens, setTokens] = useState<Token[] | null>(null),
    [confirming, setConfirming] = useState(""),
    [error, setError] = useState("");
  const toast = useToast();
  useEffect(() => {
    api<{ tokens: Token[] }>("/api-tokens")
      .then((r) => setTokens(r.tokens))
      .catch((e) => setError(e instanceof Error ? e.message : "读取失败"));
  }, []);
  async function revoke(id: string) {
    try {
      await api(`/api-tokens/${id}`, { method: "DELETE" });
      setTokens((list) => (list ?? []).filter((token) => token.id !== id));
      setConfirming("");
      toast("已经撤销该设备的访问权限");
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤销失败，请重试");
    }
  }
  return (
    <Sheet open title="已授权的设备" onClose={onClose}>
      <div className="editor-form">
        <p className="muted">
          旅行助手在获得你的允许后会出现在这里，可以随时撤销。
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {tokens?.length === 0 && (
          <EmptyState
            kind="luggage"
            title="没有已授权的设备"
            text="在助手或脚本中登录后，会在这里显示。"
          />
        )}
        {tokens && tokens.length > 0 && (
          <ul className="token-list">
            {tokens.map((token) => (
              <li key={token.id} className="token-row">
                <KeyRound size={18} />
                <div>
                  <strong>{token.label || "未命名设备"}</strong>
                  <small>
                    授权于 {moment(token.created_at)} · 最近使用{" "}
                    {moment(token.last_used_at)}
                  </small>
                </div>
                {confirming === token.id ? (
                  <span className="token-confirm">
                    <button
                      className="danger-button"
                      onClick={() => void revoke(token.id)}
                    >
                      确认撤销
                    </button>
                    <button
                      className="text-action"
                      onClick={() => setConfirming("")}
                    >
                      取消
                    </button>
                  </span>
                ) : (
                  <button
                    className="icon-button"
                    aria-label={`撤销 ${token.label || "未命名设备"}`}
                    onClick={() => setConfirming(token.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <SheetFooter>
          <button className="secondary-button" onClick={onClose}>
            关闭
          </button>
        </SheetFooter>
      </div>
    </Sheet>
  );
}
