import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "رسترو اسیست | سامانه مدیریت شیفت و سفارش رستوران",
  description: "سامانه ابری مدیریت همزمان سالن، آشپزخانه (KDS)، هوش مصنوعی و صندوق رستوران‌ها و کافه‌ها",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 font-vazir antialiased selection:bg-brand-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
