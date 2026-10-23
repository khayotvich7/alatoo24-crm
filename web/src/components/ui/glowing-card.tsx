import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Glassy stat card with a beam of light falling from its top-left corner, faint guide lines
// and a slow-moving spark (inspired by 21st.dev "Glowing Card"). Styles: .gcard in styles.css.
export interface GlowingCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function GlowingCard({ children, className, ...rest }: GlowingCardProps) {
  return (
    <div className={cn("gcard", className)} {...rest}>
      <span className="gcard-beam" aria-hidden />
      <span className="gcard-lines" aria-hidden />
      <span className="gcard-spark" aria-hidden />
      <span className="gcard-shine" aria-hidden />
      <div className="gcard-body">{children}</div>
    </div>
  );
}

export default GlowingCard;
