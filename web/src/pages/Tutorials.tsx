import { Link } from "react-router-dom";
import { PublicLayout, PublicPageHead } from "../components/PublicLayout";

/**
 * Tutorials — one card per walkthrough that is planned.
 *
 * The written steps ARE real: they describe what the product actually does
 * today, so this page is useful before a single video exists. Each card
 * carries a "video coming soon" marker rather than a play button that does
 * nothing — a control that looks live and isn't teaches a visitor something
 * worse about the product than an honest label.
 */

const TUTORIALS = [
  {
    n: 1,
    title: "Setting up your business",
    body: "Create your account, add a business profile, and set the monthly expenses you expect. That figure is what the recovery target is measured against, so it is worth a moment's thought.",
  },
  {
    n: 2,
    title: "Recording expenses and sales",
    body: "Add a purchase with its category, and record the day's sales as a single figure. This is the couple of minutes a day everything else is built on.",
  },
  {
    n: 3,
    title: "Scanning a receipt",
    body: "Photograph a receipt and let FinSight read the date, store, total and item lines. Check what it read, fix anything wrong, then confirm — nothing is saved until you do.",
  },
  {
    n: 4,
    title: "Importing a spreadsheet",
    body: "Bring in records you already keep as a CSV. Match your columns to FinSight's, preview every row, and confirm the ones you want.",
  },
  {
    n: 5,
    title: "Reading your dashboard",
    body: "What the recovery target means, how to read the category breakdown, and what a flagged expense is telling you.",
  },
  {
    n: 6,
    title: "Asking FinSight a question",
    body: "Ask about your own figures in plain language, and understand why it sometimes answers that your records don't cover the question.",
  },
];

export function Tutorials() {
  return (
    <PublicLayout>
      <PublicPageHead
        eyebrow="Help Center"
        title="Tutorials"
        lede="Step by step, from setting up your business to reading what the dashboard is telling you."
      />

      <div className="mx-auto max-w-4xl px-4 py-12 lg:px-6 lg:py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {TUTORIALS.map((t) => (
            <article key={t.n} className="rounded-2xl border border-paper-200 bg-paper p-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 font-display text-sm font-bold text-white"
                >
                  {t.n}
                </span>
                <h2 className="font-display text-base font-semibold text-ink-900">{t.title}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{t.body}</p>
              <p className="mt-4 text-xs font-medium text-ink-400">Video walkthrough coming soon</p>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-edge-brand bg-tint-brand/40 p-6 text-center">
          <p className="text-sm text-ink-700">
            The quickest way to learn it is to record one week of your own figures.
          </p>
          <div className="mt-4">
            <Link
              to="/register"
              className="tap inline-flex rounded-lg bg-accent-400 px-5 text-sm font-semibold text-ink-900 hover:bg-accent-500"
            >
              Create a free account
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
