"use client";
import { useState } from "react";
import { Check, Copy, HelpCircle } from "lucide-react";
import { Sheet, SheetFooter } from "./sheets/sheet";
const skillPath = "/skill/trip-together-skill.zip";
export function promptText(origin: string) {
  return `下载并安装 trip-together 这个 skill（压缩包：${origin}${skillPath}），然后帮我录入行程。`;
}
/** 入口按钮 + 说明弹窗；文案与 skill 地址集中在这里维护。 */
export function AiGuideEntry({
  label = "如何接入 AI",
  className = "text-action",
  icon = false,
}: {
  label?: string;
  className?: string;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
        {icon && <HelpCircle size={16} aria-hidden />}
      </button>
      {open && <AiGuideSheet onClose={() => setOpen(false)} />}
    </>
  );
}
function AiGuideSheet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(""),
    [prompt] = useState(() =>
      promptText(typeof window === "undefined" ? "" : window.location.origin),
    );
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("无法复制，请手动选择上面的文字");
    }
  }
  return (
    <Sheet open title="接入 AI" onClose={onClose}>
      <div className="editor-form ai-guide">
        <p>
          旅行助手获得你的允许后，可以创建行程，并录入安排、消费记录和旅行资料。skill
          压缩包就在本站，把下面这句话发给支持 skill 的 AI 助手：
        </p>
        <div className="ai-guide-prompt">
          <p>{prompt}</p>
          <button
            type="button"
            className="icon-button"
            aria-label={copied ? "已经复制" : "复制这句话"}
            onClick={() => void copy()}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
        <p className="muted">
          首次接入时浏览器会打开授权页面，你确认后助手才能访问账号，随时可以在“我的
          → 已授权的设备”里撤销。接入之后，机票、订单这类文件可以直接交给 AI
          录入。
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <SheetFooter>
          <button className="primary-button" onClick={onClose}>
            我知道了
          </button>
        </SheetFooter>
      </div>
    </Sheet>
  );
}
