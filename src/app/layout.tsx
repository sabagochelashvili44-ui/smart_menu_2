import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/noto-sans/wght.css";
import "@fontsource-variable/noto-sans-georgian/wght.css";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: {
    default: "AltaTab · Digital QR Menu & AI Waiter",
    template: "%s · AltaTab",
  },
  description:
    "QR digital menus with an AI chef assistant for restaurants — multilingual guests, smart upselling, and real-time waiter alerts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ka" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
