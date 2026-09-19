"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Tone = "success" | "error";
type Item = { id: number; message: string; tone: Tone };
type Push = (message: string, tone?: Tone) => void;
const ToastContext = createContext<Push>(() => {});
export function useToast() {
  return useContext(ToastContext);
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(0);
  const push = useCallback<Push>((message, tone = "success") => {
    const text = message.trim();
    if (!text) return;
    const id = ++next.current;
    setItems((current) => [...current, { id, message: text, tone }]);
    setTimeout(
      () => setItems((current) => current.filter((item) => item.id !== id)),
      2800,
    );
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <p key={item.id} className={`toast toast-${item.tone}`}>
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
