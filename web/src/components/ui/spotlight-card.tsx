import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Spotlight that follows the pointer across every card at once (inspired by 21st.dev "Spotlight Card").
// One window listener writes the pointer position to CSS variables; each `.spot` element paints
// a radial glow on its border at that fixed position, so neighbouring cards light up too.
let listeners = 0;
const onMove = (e: PointerEvent) => {
  const s = document.documentElement.style;
  s.setProperty("--spot-x", `${e.clientX}px`);
  s.setProperty("--spot-y", `${e.clientY}px`);
};

/** Mount once (e.g. in App) to drive every `.spot` / `.card` spotlight. */
export function useSpotlight() {
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (listeners++ === 0) window.addEventListener("pointermove", onMove, { passive: true });
    return () => { if (--listeners === 0) window.removeEventListener("pointermove", onMove); };
  }, []);
}

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function SpotlightCard({ children, className, ...rest }: SpotlightCardProps) {
  useSpotlight();
  return <div className={cn("card spot", className)} {...rest}>{children}</div>;
}

export default SpotlightCard;
