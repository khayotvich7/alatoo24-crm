import { useEffect, useRef } from "react";

// Page background of slowly drifting contour lines, like a mountain map (Ala-Too is a mountain range).
// Inspired by 21st.dev "Luminous Topography". Draws on one fixed canvas behind the panel; it stops
// while the tab is hidden and stands still for people who prefer reduced motion. Styles: .topo-bg.
export default function TopoBg({ dark }: { dark: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext("2d");
    if (!c || !x) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const color = dark ? "rgba(143,211,174,.10)" : "rgba(31,77,58,.11)";
    let t = 0, raf = 0;
    const size = () => {
      const r = devicePixelRatio || 1;
      c.width = innerWidth * r; c.height = innerHeight * r;
      x.setTransform(r, 0, 0, r, 0, 0);
    };
    const draw = () => {
      const w = innerWidth, h = innerHeight;
      x.clearRect(0, 0, w, h);
      x.strokeStyle = color; x.lineWidth = 1.2;
      for (let i = 0; i < 34; i++) {
        const base = (i / 33) * h * 1.15 - h * 0.05;
        x.beginPath();
        for (let px = 0; px <= w; px += 10) {
          const y = base + Math.sin((px / w) * 3.2 + i * 0.32 + t) * 22 + Math.sin((px / w) * 8 - t * 0.6 + i) * 7;
          if (px) x.lineTo(px, y); else x.moveTo(px, y);
        }
        x.stroke();
      }
      t += 0.004;
      if (!still && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const wake = () => { cancelAnimationFrame(raf); if (!document.hidden) draw(); };
    const resize = () => { size(); wake(); };
    size(); draw();
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", wake);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); document.removeEventListener("visibilitychange", wake); };
  }, [dark]);
  return <canvas ref={ref} className="topo-bg" aria-hidden />;
}
