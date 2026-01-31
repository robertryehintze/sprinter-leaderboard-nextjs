import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprinter Leaderboard",
  description: "Sales leaderboard and input system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
