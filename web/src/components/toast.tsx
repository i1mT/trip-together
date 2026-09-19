"use client";
import { App } from "antd";
/**
 * Thin wrapper over antd's App message API so call sites stay one-liners.
 * Requires an <App> provider, mounted once in AppShell.
 */
export function useToast() {
  const { message } = App.useApp();
  return (content: string, tone: "success" | "error" = "success") => {
    const text = content.trim();
    if (!text) return;
    void (tone === "error"
      ? message.error(text, 2.8)
      : message.success(text, 2.8));
  };
}
