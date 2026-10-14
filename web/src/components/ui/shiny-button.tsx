import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Pill button with a comet of light orbiting its 1px border.
// Styles (incl. the @property --shiny-angle animation) live in styles.css under ".shiny-btn".
export interface ShinyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** "amber" = orange comet (default), "gold" = Alatoo champagne gold. */
  tone?: "amber" | "gold";
}

export function ShinyButton({ children, className, tone = "amber", type = "button", ...rest }: ShinyButtonProps) {
  return (
    <button type={type} className={cn("shiny-btn", tone === "gold" && "shiny-gold", className)} {...rest}>
      <span className="shiny-glow" aria-hidden />
      <span className="shiny-inner">
        <span className="shiny-dots" aria-hidden />
        <span className="shiny-label">{children}</span>
      </span>
    </button>
  );
}

export default ShinyButton;
