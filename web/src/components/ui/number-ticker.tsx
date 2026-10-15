import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Counts from the previous value (0 on first render) up to `value` with an ease-out curve.
// Inspired by 21st.dev "Number Ticker"; dependency-free (requestAnimationFrame).
export interface NumberTickerProps {
  value: number;
  /** How to print the number, e.g. money() — defaults to grouped digits. */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function NumberTicker({ value, format = (n) => Math.round(n).toLocaleString("ru-RU"), duration = 1400, className }: NumberTickerProps) {
  const from = useRef(0);
  const cur = useRef(0); // last painted value, so an interrupted run continues from where it was
  const [shown, setShown] = useState(reduced() ? value : 0);

  useEffect(() => {
    if (reduced()) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      cur.current = a + (value - a) * easeOutExpo(t);
      setShown(cur.current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = cur.current; };
  }, [value, duration]);

  return <span className={cn("num", className)}>{format(Math.round(shown))}</span>;
}

export default NumberTicker;
