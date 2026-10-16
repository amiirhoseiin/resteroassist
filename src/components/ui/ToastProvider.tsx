"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast باید داخل ToastProvider استفاده شود.");
  }
  return context;
}

const TOAST_STYLES: Record<
  ToastType,
  { accent: string; icon: ReactNode }
> = {
  success: {
    accent: "border-s-emerald-500",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />,
  },
  error: {
    accent: "border-s-rose-500",
    icon: <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />,
  },
  warning: {
    accent: "border-s-amber-500",
    icon: <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />,
  },
  info: {
    accent: "border-s-sky-500",
    icon: <Info className="w-5 h-5 text-sky-600 flex-shrink-0" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      window.setTimeout(() => dismiss(id), 5500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 start-4 z-[100] flex w-[min(92vw,26rem)] flex-col gap-2"
      >
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              role="alert"
              className={`animate-toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 border-s-4 ${style.accent} bg-white p-3.5 shadow-lg`}
            >
              {style.icon}
              <p className="flex-1 text-xs font-medium leading-6 text-slate-700">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="بستن پیام"
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
