import type { FormEventHandler, ReactNode } from "react";

/**
 * The shared visual vocabulary, adopted from the approved mockup
 * (`pokpokpok.html`).
 *
 * The mockup expresses these as CSS classes (`.pill.ok`, `.kpi`, `.panel`,
 * `.ai-card`). They are React components here instead, for one reason that
 * matters: several of them have an accessibility obligation that a CSS class
 * cannot enforce. A status pill must never be colour-alone, a decorative glow
 * must be aria-hidden, a currency figure must carry the tabular face. Making
 * them components means a call site cannot forget.
 *
 * Colour note: the mockup's emerald/gold and this app's brand/accent scales
 * are within a hair of each other by design (mockup `--brand:#047857` vs
 * brand-600 `#0d7f72`; mockup `--gold-bright:#f59e0b` vs accent-400
 * `#f5a524`). The scales here are kept because their contrast ratios are
 * measured (see lib/chartPalette.ts) and because the mobile app mirrors them.
 */

// ============================================================
// Pill — a status, always with a written label
// ============================================================
// The dot is decorative; the word is the information. This is the mockup's
// `.pill` with its `::before` dot, made colour-independent.

// Themed triples rather than literal scales — see the tint/tone/edge note in
// tailwind.config.js. `bg-tint-brand text-tone-brand` is correct on a white card
// and unreadable on a dark one; `bg-tint-brand text-tone-brand` is correct on
// both, from the same class.
const PILL_TONES = {
  ok: "bg-tint-brand text-tone-brand ring-edge-brand",
  warn: "bg-tint-accent text-tone-accent ring-edge-accent",
  danger: "bg-tint-danger text-tone-danger ring-edge-danger",
  info: "bg-tint-info text-tone-info ring-edge-info",
  neutral: "bg-tint-neutral text-tone-neutral ring-edge-neutral",
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${PILL_TONES[tone]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-90" />
      {children}
    </span>
  );
}

// ============================================================
// Tag — a record's kind (expense vs sales reference)
// ============================================================

export function Tag({ kind }: { kind: "expense" | "sales" }) {
  return kind === "expense" ? (
    <span className="inline-flex shrink-0 rounded-lg bg-tint-accent px-2 py-0.5 text-[11.5px] font-semibold text-tone-accent ring-1 ring-edge-accent">
      Expense
    </span>
  ) : (
    <span className="inline-flex shrink-0 rounded-lg bg-tint-brand px-2 py-0.5 text-[11.5px] font-semibold text-tone-brand ring-1 ring-edge-brand">
      Sales ref.
    </span>
  );
}

// ============================================================
// Card / Panel — the base surface and its padded, titled form
// ============================================================

/**
 * `as` exists for the one shape a wrapper can't express: a panel that IS a
 * form. Nesting a <form> inside a Card div works, but it puts the padding on
 * the wrong element and leaves the card's own class string to be pasted by
 * hand at the call site — which is the thing this component exists to stop.
 * Deliberately narrow: div or form, nothing else.
 */
export function Card({
  as = "div",
  className = "",
  onSubmit,
  children,
}: {
  as?: "div" | "form";
  className?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  const classes = `rounded-2xl border border-paper-200 bg-paper shadow-sm ${className}`;
  if (as === "form") {
    return (
      <form className={classes} onSubmit={onSubmit}>
        {children}
      </form>
    );
  }
  return <div className={classes}>{children}</div>;
}

export function Panel({
  eyebrow,
  title,
  action,
  className = "",
  bodyClassName = "",
  children,
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {eyebrow ? <div className="eyebrow mb-0.5">{eyebrow}</div> : null}
            {title ? <h3 className="text-base font-semibold text-ink-900">{title}</h3> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={`px-5 pb-5 ${title || action ? "pt-4" : "pt-5"} ${bodyClassName}`}>{children}</div>
    </Card>
  );
}

// ============================================================
// KpiCard — label + icon chip, big figure, meta line
// ============================================================
// The mockup's `.kpi`. `tone` colours only the icon chip, never the figure,
// so a wall of KPIs stays readable rather than turning into a colour chart.

const KPI_TONES = {
  brand: "bg-tint-brand text-tone-brand",
  accent: "bg-tint-accent text-tone-accent",
  danger: "bg-tint-danger text-tone-danger",
  info: "bg-tint-info text-tone-info",
} as const;

export function KpiCard({
  label,
  value,
  meta,
  glyph,
  tone = "brand",
  valueClassName = "",
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  glyph: string;
  tone?: keyof typeof KPI_TONES;
  valueClassName?: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-ink-500">{label}</span>
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${KPI_TONES[tone]}`}
        >
          {glyph}
        </span>
      </div>
      <div className={`font-display text-2xl font-bold tracking-[-0.02em] text-ink-900 ${valueClassName}`}>
        {value}
      </div>
      {meta ? <div className="mt-1.5 text-xs text-ink-500">{meta}</div> : null}
    </Card>
  );
}

// ============================================================
// AiCard — "FinSight is speaking"
// ============================================================
// A distinct dark surface so an AI-written explanation is never mistaken for
// a computed figure. The footer line saying so is not optional decoration —
// it is the honesty requirement the brief puts on every AI surface.

export function AiCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="surface-ai relative overflow-hidden rounded-2xl p-5 text-brand-50 shadow-md">
      <span
        aria-hidden
        className="surface-ai-glow pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full"
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 text-sm"
          >
            ✦
          </span>
          <div className="min-w-0">
            <b className="block font-display text-[15px] font-bold text-white">{title}</b>
            {subtitle ? <small className="block text-[11px] text-brand-200">{subtitle}</small> : null}
          </div>
        </div>
        <div className="text-sm leading-relaxed text-brand-50">{children}</div>
        {footer ? <div className="mt-3.5 text-[11.5px] text-brand-200">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Highlights a figure inside AiCard prose. Warm, so it reads off the dark ground. */
export function Kw({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-accent-200">{children}</span>;
}

// ============================================================
// InfoNote / Callout — quiet explanation vs. coloured notice
// ============================================================

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-paper-200 bg-paper-100 px-3.5 py-2.5 text-xs leading-relaxed text-ink-500">
      <span aria-hidden className="mt-px shrink-0">
        ⓘ
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const CALLOUT_TONES = {
  info: { box: "bg-tint-info text-tone-info ring-edge-info", glyph: "ⓘ" },
  warn: { box: "bg-tint-accent text-tone-accent ring-edge-accent", glyph: "⚠" },
  brand: { box: "bg-tint-brand text-tone-brand ring-edge-brand", glyph: "✦" },
} as const;

export function Callout({
  tone = "info",
  children,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  children: ReactNode;
}) {
  const t = CALLOUT_TONES[tone];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed ring-1 ${t.box}`}
    >
      <span aria-hidden className="mt-px shrink-0">
        {t.glyph}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ============================================================
// PageHead — eyebrow / title / subtitle, plus actions
// ============================================================

export function PageHead({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ============================================================
// FormPage — the shell every create/edit screen renders into
// ============================================================
// These screens used to be a centred `mx-auto max-w-md` card with the title
// inside it. That made them the only pages in the app whose heading did not
// start at the same left edge as everything else: navigate from Records to
// Add expense and the title jumped to the middle of the screen.
//
// So the title now sits in the ordinary PageHead, on the shared left edge,
// and only the FORM is width-limited beneath it. A form still shouldn't run
// to 1700px — a text input that wide is genuinely harder to use, and the
// measure keeps label/field pairs scannable — but that is a constraint on the
// form, not a reason to move the page's heading.

export function FormPage({
  eyebrow,
  title,
  subtitle,
  actions,
  /** Wider than the default, for forms with side-by-side field pairs. */
  wide = false,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <PageHead eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />
      <Card className={`${wide ? "max-w-3xl" : "max-w-xl"} p-6 sm:p-7`}>{children}</Card>
    </div>
  );
}
