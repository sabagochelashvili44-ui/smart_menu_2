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
  title: "სმარტ მენიუ · Smart AI Menu",
  description:
    "QR მენიუ ქართული, ინგლისური და რუსული ენების მხარდაჭერით · Georgian House",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ka" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
