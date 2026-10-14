// Liquid-metal button used across the CRM. Same look as liquid-metal-button.tsx, but it sizes to its
// content, takes any children, and supports tones and form submit.
//
// Each shader needs its own WebGL context and browsers keep only ~16 alive per page, so at most
// MAX_SHADERS buttons run the real shader at once; the rest draw the same chrome ring with CSS.
import { liquidMetalFragmentShader, ShaderMount } from '@paper-design/shaders';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const MAX_SHADERS = 10;
let liveShaders = 0;

const canWebGL = (() => {
  let ok: boolean | null = null;
  return () => {
    if (ok !== null) return ok;
    try {
      const c = document.createElement('canvas');
      ok = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { ok = false; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ok = false;
    return ok;
  };
})();

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'onyx' | 'emerald' | 'ruby' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** Skip the WebGL shader even if a slot is free (lists with many buttons). */
  lite?: boolean;
};

export function MetalButton({ children, icon, tone = 'onyx', size = 'md', block, lite, className, onClick, disabled, ...rest }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const mount = useRef<ShaderMount | null>(null);
  const [shader, setShader] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const rid = useRef(0);

  useEffect(() => {
    if (lite || !host.current || liveShaders >= MAX_SHADERS || !canWebGL()) return;
    liveShaders++;
    try {
      mount.current = new ShaderMount(
        host.current,
        liquidMetalFragmentShader,
        {
          u_repetition: 4, u_softness: 0.5, u_shiftRed: 0.3, u_shiftBlue: 0.3, u_distortion: 0, u_contour: 0,
          u_angle: 45, u_scale: 1, u_shape: 0, u_offsetX: 0, u_offsetY: 0,
        },
        undefined,
        0.6,
        0,
        1.5,
      );
      setShader(true);
    } catch {
      liveShaders--;
    }
    return () => {
      if (mount.current) { mount.current.dispose(); mount.current = null; liveShaders--; }
    };
  }, [lite]);

  const speed = (s: number) => mount.current?.setSpeed(s);

  return (
    <button
      {...rest}
      disabled={disabled}
      className={cn('mb', `mb-${size}`, `mb-${tone}`, block && 'mb-block', shader ? 'mb-shader' : 'mb-css', className)}
      onMouseEnter={() => speed(1)}
      onMouseLeave={() => speed(0.6)}
      onClick={e => {
        speed(2.4);
        setTimeout(() => speed(0.6), 300);
        const r = e.currentTarget.getBoundingClientRect();
        const rp = { x: e.clientX - r.left, y: e.clientY - r.top, id: rid.current++ };
        setRipples(p => [...p, rp]);
        setTimeout(() => setRipples(p => p.filter(x => x.id !== rp.id)), 600);
        onClick?.(e);
      }}
    >
      <span className="mb-ring" ref={host} aria-hidden />
      <span className="mb-core" aria-hidden />
      <span className="mb-label">{icon}{children}</span>
      {ripples.map(r => <span key={r.id} className="mb-ripple" style={{ left: r.x, top: r.y }} aria-hidden />)}
    </button>
  );
}
