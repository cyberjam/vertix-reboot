import type { ReactNode } from "react";

export const metadata = {
  title: "Vertix Reboot",
  description: "Vertix.io reboot — web top-down arena shooter",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" style={{ height: "100%" }}>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          background: "#0b0e14",
          color: "#e6e6e6",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
