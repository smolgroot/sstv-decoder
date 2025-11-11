import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSTV Decoder",
  description: "Real-time SSTV signal decoder from microphone input",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
