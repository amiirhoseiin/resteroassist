// حساب‌های نمایشی محیط دمو — برای ورود تک‌کلیکی ارزیاب بدون نیاز به رمز
// توجه: این داده‌ها فقط برای محیط دمو/توسعه محلی هستند.

export interface DemoAccount {
  key: "waiter" | "kitchen" | "cashier" | "manager" | "hizom_manager";
  role: string;
  name: string;
  email: string;
  password: string;
  roleLabel: string;
  restaurant: string;
  branch: string;
  route: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: "waiter",
    role: "waiter",
    name: "امیرحسین رضایی",
    email: "amir@roohi.ir",
    password: "Password123!",
    roleLabel: "سالن‌دار (گارسون)",
    restaurant: "کافه رستوران روحی",
    branch: "شعبه باغ فردوس",
    route: "/pos",
  },
  {
    key: "kitchen",
    role: "kitchen",
    name: "استاد حسن",
    email: "hassan@roohi.ir",
    password: "Password123!",
    roleLabel: "آشپزخانه (KDS)",
    restaurant: "کافه رستوران روحی",
    branch: "شعبه باغ فردوس",
    route: "/kds",
  },
  {
    key: "cashier",
    role: "cashier",
    name: "سارا کاظمی",
    email: "sara@roohi.ir",
    password: "Password123!",
    roleLabel: "صندوقدار",
    restaurant: "کافه رستوران روحی",
    branch: "شعبه باغ فردوس",
    route: "/cashier",
  },
  {
    key: "manager",
    role: "manager",
    name: "رضا محمدی",
    email: "reza@roohi.ir",
    password: "Password123!",
    roleLabel: "مدیر شعبه",
    restaurant: "کافه رستوران روحی",
    branch: "شعبه باغ فردوس",
    route: "/pos",
  },
  {
    key: "hizom_manager",
    role: "manager",
    name: "فرهاد رحیمی",
    email: "farhad@hizom.ir",
    password: "Password123!",
    roleLabel: "مدیر شعبه",
    restaurant: "برگر زغالی هیزم",
    branch: "شعبه ونک",
    route: "/pos",
  },
];

// نقش‌های قابل جابجایی سریع در نوار بالای سامانه (دمو)
export const QUICK_SWITCH_KEYS: DemoAccount["key"][] = [
  "waiter",
  "kitchen",
  "cashier",
  "hizom_manager",
];
