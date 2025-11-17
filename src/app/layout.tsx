import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSTV Decoder - Real-time Slow Scan Television Decoder",
  description: "Web-based SSTV (Slow Scan Television) decoder supporting Robot36 mode. Decode amateur radio SSTV signals in real-time from your microphone with professional DSP processing.",
  keywords: ["SSTV", "Slow Scan Television", "Robot36", "Amateur Radio", "Ham Radio", "ISS", "Signal Decoder", "Web Audio"],
  authors: [{ name: "smolgroot" }],
  creator: "smolgroot",
  publisher: "smolgroot",
  openGraph: {
    title: "SSTV Decoder - Real-time Slow Scan Television Decoder",
    description: "Decode amateur radio SSTV signals in real-time from your microphone. Supports Robot36 mode with professional DSP processing.",
    url: "https://sstv-decoder.vercel.app",
    siteName: "SSTV Decoder",
    images: [
      {
        url: "https://sstv-decoder.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "SSTV Decoder Screenshot",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SSTV Decoder - Real-time Slow Scan Television Decoder",
    description: "Decode amateur radio SSTV signals in real-time from your microphone. Supports Robot36 mode with professional DSP processing.",
    images: ["https://sstv-decoder.vercel.app/og-image.png"],
    creator: "@smolgroot",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
