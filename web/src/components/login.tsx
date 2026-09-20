"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { TravelSticker } from "./travel-sticker";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api";
type Mode = "login" | "register" | "recover" | "migrate";
const titles = {
  login: "旅行计划",
  register: "创建账号",
  recover: "重置密码",
  migrate: "旧账号绑定邮箱",
};
export function Login({
  onLogin,
  onBrowseMarket,
  intro,
}: {
  onLogin: () => Promise<void>;
  onBrowseMarket?: () => void;
  intro?: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("login");
  useEffect(() => {
    track("page_viewed", mode);
  }, [mode]);
  const [email, setEmail] = useState(""),
    [legacyUsername, setLegacy] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [visible, setVisible] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [required, setRequired] = useState(true),
    [loaded, setLoaded] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    api<{ emailVerificationRequired: boolean }>("/auth-config")
      .then((r) => {
        setRequired(r.emailVerificationRequired);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  function switchMode(next: Mode) {
    setMode(next);
    setCode("");
    setError("");
    setNotice("");
    setPassword("");
  }
  async function send() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/email-code", {
        method: "POST",
        body: JSON.stringify({ email, purpose: mode }),
      });
      setNow(Date.now());
      setRetryAt(Date.now() + 60000);
      setNotice("验证码已经发送，请查看邮箱。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/${mode === "migrate" ? "migrate-account" : mode}`, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          ...(mode !== "login" ? { code } : {}),
          legacyUsername,
        }),
      });
      if (mode === "recover") {
        switchMode("login");
        setNotice("密码已经更新，请重新登录。");
      } else await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section className="login-form">
        <TravelSticker kind="luggage" className="login-sticker" />
        <h1>{titles[mode]}</h1>
        <p className="muted">
          {mode === "migrate"
            ? "使用原账号和密码绑定邮箱，保留已有行程与资料。"
            : "创建自己的行程，与同行成员共享安排和账本。"}
        </p>
        {intro}
        <form className="editor-form" onSubmit={submit}>
          {mode === "migrate" && (
            <label>
              旧账号
              <input
                required
                aria-label="旧账号"
                autoComplete="off"
                value={legacyUsername}
                onChange={(e) => setLegacy(e.target.value)}
              />
            </label>
          )}
          <label>
            邮箱
            <div className="password-field">
              <Mail size={18} />
              <input
                required
                type="email"
                aria-label="邮箱"
                autoCapitalize="none"
                autoComplete="username"
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCode("");
                  setNotice("");
                  setError("");
                }}
              />
            </div>
          </label>
          <label>
            {mode === "recover" ? "新密码" : "密码"}
            <div className="password-field">
              <LockKeyhole size={18} />
              <input
                required
                minLength={mode === "login" ? 1 : 10}
                maxLength={128}
                type={visible ? "text" : "password"}
                aria-label={mode === "recover" ? "新密码" : "密码"}
                autoComplete={
                  mode === "login" || mode === "migrate"
                    ? "current-password"
                    : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? "隐藏密码" : "显示密码"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {(mode === "register" || mode === "recover") && (
              <small>至少 10 个字符，区分大小写</small>
            )}
          </label>
          {required && mode !== "login" && (
            <label>
              邮箱验证码
              <div className="email-code-field">
                <input
                  aria-label="邮箱验证码"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !loaded || remaining > 0 || !email}
                  onClick={() => void send()}
                >
                  {remaining ? `${remaining} 秒后重发` : "发送验证码"}
                </button>
              </div>
              <small>验证码在 10 分钟内有效，仅可使用一次。</small>
            </label>
          )}
          <div className="login-submit-group">
            {notice && (
              <p role="status" className="muted">
                {notice}
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy || !loaded}>
              {busy
                ? "正在处理…"
                : mode === "login"
                  ? "登录"
                  : mode === "register"
                    ? "注册"
                    : mode === "recover"
                      ? "重置密码"
                      : "绑定邮箱并登录"}
            </button>
            <div className="login-secondary-row">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  switchMode(mode === "login" ? "register" : "login")
                }
              >
                {mode === "login" ? "注册新账号" : "返回登录"}
              </button>
              {mode === "login" && onBrowseMarket && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={onBrowseMarket}
                >
                  先看看旅行攻略市场
                </button>
              )}
            </div>
          </div>
        </form>
        <div className="form-actions">
          {mode !== "recover" && (
            <button
              className="text-action"
              disabled={busy}
              onClick={() => switchMode("recover")}
            >
              忘记密码
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
