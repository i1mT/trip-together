"use client";
import type { ReactNode } from "react";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
export function ProviderShell({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#9685b0",
          motion: false,
          borderRadius: 12,
          controlHeight: 44,
          fontSize: 15,
          fontFamily: "inherit",
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
