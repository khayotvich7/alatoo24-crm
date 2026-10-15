import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Gold light sweeping across text (inspired by 21st.dev "Text Shimmer" by ibelick). Styles: .tshimmer in styles.css.
export interface TextShimmerProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** seconds per sweep */
  duration?: number;
}

export function TextShimmer({ children, as: Tag = "span", className, duration = 3.2 }: TextShimmerProps) {
  return (
    <Tag className={cn("tshimmer", className)} style={{ animationDuration: `${duration}s` }}>
      {children}
    </Tag>
  );
}

export default TextShimmer;
