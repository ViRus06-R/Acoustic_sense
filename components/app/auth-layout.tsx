import type { ReactNode } from "react";
import { Logo } from "@/components/ui/icons";

/** Split screen used by every account page: dark brand panel left, white form right. */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy px-14 py-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 22px)" }}
          aria-hidden="true"
        />
        <div className="relative">
          <Logo size="lg" />
        </div>
        <div className="relative max-w-[480px]">
          <h1 className="text-[44px] leading-[1.1] font-bold tracking-tight">
            Hear machine faults
            <br />
            <span className="text-teal">before they happen.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-6 text-white/70">Edge-AI acoustic monitoring for motors, pumps, fans and gearboxes. Raw audio never leaves the node.</p>
          <dl className="mt-10 grid grid-cols-3 gap-6">
            {[
              ["< 1 s", "on-device detection"],
              ["0 KB", "raw audio uploaded"],
              ["24/7", "offline-safe logging"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="text-2xl font-bold text-white tabular">{v}</dd>
                <dd className="mt-1 text-[13px] text-white/60">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <footer className="relative text-[12.5px] text-white/45">COMSATS University Islamabad, Wah Campus . FYP 2026</footer>
      </aside>
      <main className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <span className="inline-flex rounded-lg bg-navy px-3 py-2">
              <Logo />
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
