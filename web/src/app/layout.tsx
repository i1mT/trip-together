import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "旅行计划",
  description: "旅行计划、旅行资料和支出记录",
  robots: { index: false, follow: false },
  applicationName: "旅行计划",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "旅行计划",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon-32.png", type: "image/png", sizes: "32x32" }],
    apple: "/apple-touch-icon.png",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5f3",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
