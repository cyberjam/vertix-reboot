import type { ReactNode } from "react";

export const metadata = {
  title: "Vertix Reboot",
  description: "Vertix.io reboot — web top-down arena shooter",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
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
