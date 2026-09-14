import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "issue-pilot",
  description: "Agent app skeleton: issue -> PR -> CI -> staging -> smoke -> production",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", margin: 40 }}>
        {children}
      </body>
    </html>
  );
}
