import type { ReactNode } from "react";

/**
 * The split auth screen from the approved mockup (`pokpokpok.html`).
 *
 * Left: a dark brand panel carrying the product's one-line pitch and what it
 * does. Right: the form. Below 1024px the brand panel is dropped entirely
 * rather than stacked above the form — the mockup's own rule, and the right
 * one: on a phone the person is here to log in, and a decorative panel above
 * the fold just pushes the fields down.
 *
 * `heroTitle` / `heroBody` / `points` differ per screen so the panel says
 * something relevant rather than repeating the same marketing copy three
 * times.
 */

export function AuthLayout({
  title,
  subtitle,
  heroTitle = "From scattered records to clearer decisions.",
  heroBody,
  points,
  footnote = "FinSight supports decision awareness. It is not an accounting, tax, payroll, POS, or banking system.",
  children,
}: {
  title: string;
  subtitle?: string;
  heroTitle?: string;
  heroBody?: ReactNode;
  points?: string[];
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* ---------------------------- brand panel ---------------------------- */}
      <aside className="surface-ai relative hidden flex-col justify-between overflow-hidden p-14 lg:flex">
        {/* Decorative blooms, matching the mockup's two orbs. */}
        <span
          aria-hidden
          className="surface-ai-glow pointer-events-none absolute -right-16 -top-10 h-60 w-60 rounded-full"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 right-16 h-44 w-44 rounded-full opacity-30"
          style={{ backgroundImage: "radial-gradient(circle, #f5a524, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-2.5">
          {/* MASCOT SEAM — the owl badge mark replaces this monogram. */}
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 font-display text-base font-extrabold text-white"
          >
            F
          </span>
          <span className="font-display text-xl font-extrabold tracking-[-0.02em] text-white">
            Fin<span className="text-brand-300">Sight</span>
          </span>
        </div>

        <div className="relative">
          <h2 className="max-w-[15ch] font-display text-[38px] font-bold leading-[1.12] text-white">
            {heroTitle}
          </h2>
          {heroBody ? <p className="mt-4 max-w-[42ch] leading-relaxed text-brand-100">{heroBody}</p> : null}

          {points?.length ? (
            <ul className="mt-6 flex flex-col gap-3.5">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[14.5px] text-brand-50">
                  <span
                    aria-hidden
                    className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs text-brand-200"
                  >
                    ✓
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="relative text-[12.5px] leading-relaxed text-brand-200">{footnote}</p>
      </aside>

      {/* ------------------------------- form ------------------------------- */}
      <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10 lg:min-h-0">
        <div className="w-full max-w-[26rem]">
          {/* Wordmark — the brand panel carries it from lg up. */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 font-display text-base font-extrabold text-white"
            >
              F
            </span>
            <span className="font-display text-xl font-extrabold tracking-[-0.02em] text-ink-900">
              Fin<span className="text-brand-700">Sight</span>
            </span>
          </div>

          <div className="mb-6">
            <h1 className="font-display text-[26px] font-bold text-ink-900">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-[14.5px] text-ink-500">{subtitle}</p> : null}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
