"use client";

import * as React from "react";
import { Lock, ShieldCheck, User } from "lucide-react";
import { ShinyButton } from "@/components/ui/shiny-button";

// Glass sign-in card (based on HextaUI "Modern Stunning Sign In").
// Adapted for the CRM: login + password instead of email, real submit handler,
// no Google / sign-up / avatars (the panel is admin-only).
export interface SignIn1Props {
  logoSrc?: string;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  /** Resolve to sign in; throw an Error to show its message under the inputs. */
  onSubmit?: (login: string, password: string) => Promise<void> | void;
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-11 pr-4 text-sm text-white placeholder-gray-300 outline-none transition focus:border-[#e3c98f]/60 focus:ring-2 focus:ring-[#e3c98f]/25";

const SignIn1 = ({
  logoSrc = "/favicon.png",
  title = "Alatoo24",
  subtitle = "CRM",
  submitLabel = "Panelga kirish",
  onSubmit,
}: SignIn1Props) => {
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !password) {
      setError("Login va parolni kiriting.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit?.(login.trim(), password);
    } catch (x) {
      setError((x as Error).message || "Kirib bo'lmadi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Centered glass card */}
      <form
        onSubmit={handleSignIn}
        className="relative z-10 flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-gradient-to-br from-[#ffffff14] to-[#04100a]/70 p-8 shadow-2xl backdrop-blur-md"
      >
        <span className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-[#e3c98f] to-transparent" />
        {/* Logo */}
        <div className="mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/20 shadow-lg ring-1 ring-[#e3c98f]/60">
          <img src={logoSrc} alt={title} className="block h-full w-full object-cover" />
        </div>
        {/* Title */}
        <h2 className="m-0 text-center text-2xl font-semibold text-white">{title}</h2>
        <div className="mb-6 mt-1 text-center text-[11px] font-bold uppercase tracking-[0.45em] text-[#e3c98f]">{subtitle}</div>
        {/* Form */}
        <div className="flex w-full flex-col gap-4">
          <div className="flex w-full flex-col gap-3">
            <label className="relative block">
              <User size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                placeholder="Login"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={login}
                className={inputCls}
                onChange={(e) => setLogin(e.target.value)}
              />
            </label>
            <label className="relative block">
              <Lock size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                placeholder="Parol"
                type="password"
                autoComplete="current-password"
                value={password}
                className={inputCls}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <div className="text-left text-sm text-red-400">{error}</div>}
          </div>
          <hr className="m-0 h-px border-0 bg-white/10" />
          <ShinyButton type="submit" tone="gold" disabled={busy} className="w-full">
            {busy ? "Tekshirilmoqda…" : submitLabel}
          </ShinyButton>
        </div>
      </form>
      {/* Footer instead of user avatars */}
      <div className="relative z-10 mt-10 flex flex-col items-center gap-2 text-center">
        <p className="m-0 flex flex-wrap items-center justify-center gap-1.5 text-sm text-gray-400">
          <ShieldCheck size={15} /> Himoyalangan ulanish · faqat administratorlar uchun
        </p>
        <span className="text-[11px] uppercase tracking-[0.25em] text-white/30">© {new Date().getFullYear()} Alatoo24</span>
      </div>
    </div>
  );
};

export { SignIn1 };

export default SignIn1;
