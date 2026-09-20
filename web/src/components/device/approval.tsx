"use client";
import { useEffect, useState } from "react";
import { Login } from "../login";
import { TravelSticker } from "../travel-sticker";
import { api, ApiError } from "@/lib/api";
type Phase =
  "checking" | "invalid" | "login" | "confirm" | "approved" | "denied";
const format = /^[A-Z2-9]{8}$/;
function Code({ code }: { code: string }) {
  return (
    <p className="device-code">
      授权码 <b>{code}</b>
    </p>
  );
}
export function DeviceApproval() {
  const [code, setCode] = useState(""),
    [phase, setPhase] = useState<Phase>("checking"),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = (
      new URLSearchParams(window.location.search).get("code") ?? ""
    ).toUpperCase();
    setCode(value);
    void (async () => {
      if (!format.test(value)) return setPhase("invalid");
      try {
        const result = await api<{ valid: boolean; label: string }>(
          `/device?code=${value}`,
        );
        if (!result.valid) return setPhase("invalid");
        setLabel(result.label);
        setPhase((await signedIn()) ? "confirm" : "login");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setPhase("login");
        else {
          setError(e instanceof Error ? e.message : "无法检查授权码");
          setPhase("invalid");
        }
      }
    })();
  }, []);
  async function decide(action: "approve" | "deny") {
    setBusy(true);
    setError("");
    try {
      await api(`/device/${action}`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setPhase(action === "approve" ? "approved" : "denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  if (phase === "checking")
    return <div className="loading-screen">正在检查授权码…</div>;
  if (phase === "login")
    return (
      <Login
        onLogin={async () => setPhase("confirm")}
        intro={
          <>
            <p className="device-pending">
              旅行助手正在等待授权，登录后确认即可。
            </p>
            <Code code={code} />
          </>
        }
      />
    );
  if (phase === "approved" || phase === "denied")
    return (
      <main className="login-screen">
        <section className="login-form">
          <TravelSticker kind="luggage" className="login-sticker" />
          <h1>{phase === "approved" ? "已允许助手访问" : "已拒绝助手访问"}</h1>
          <p className="muted">
            {phase === "approved"
              ? "可以关闭这个页面，回到助手继续。"
              : "助手没有获得访问权限，无需其他操作。"}
          </p>
        </section>
      </main>
    );
  return (
    <main className="login-screen">
      <section className="login-form">
        <TravelSticker kind="luggage" className="login-sticker" />
        <h1>{phase === "confirm" ? "授权旅行助手" : "授权码不可用"}</h1>
        {code && <Code code={code} />}
        {phase === "confirm" ? (
          <>
            <p className="muted">
              {label ? `「${label}」` : "旅行助手"}
              请求访问你的账号，允许后可以像你一样创建行程、添加安排和录入支出。
            </p>
            <div className="login-submit-group">
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void decide("approve")}
              >
                {busy ? "正在处理…" : "允许访问"}
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void decide("deny")}
              >
                拒绝
              </button>
            </div>
            <p className="device-note">
              请确认授权码与助手中显示的授权码一致。如果不是你发起的操作，请选择拒绝。
            </p>
          </>
        ) : (
          <p className="muted">
            {error || "这个授权码无效或已经过期，请在助手中重新发起登录。"}
          </p>
        )}
      </section>
    </main>
  );
}
async function signedIn() {
  try {
    await api("/bootstrap");
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return false;
    throw e;
  }
}
