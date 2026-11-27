import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CloudGuard IoT",
  description: "Cloud Security Platform — M2 Database & Backend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
