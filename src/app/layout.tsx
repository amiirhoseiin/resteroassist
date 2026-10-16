import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "سیستم یکپارچه مدیریت شیفت رستوران",
  description:
    "سامانه مدیریت زنده سالن، آشپزخانه (KDS)، دستیار هوشمند و صندوق رستوران‌ها و کافه‌ها",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body
        className={`${vazirmatn.className} font-vazir min-h-screen bg-slate-100 text-slate-900 antialiased`}
        style={{ fontFeatureSettings: '"ss01"' }}
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
