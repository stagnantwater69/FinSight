import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../components/Button";
import { RecoveryMeter } from "../components/RecoveryMeter";

import type { RecoveryTargets } from "../lib/types";

/**
 * The public landing page.
 *
 * The hero visual is a genuinely working Recovery Meter — the real component,
 * fed sample data — not a screenshot. It is the product's signature idea, so
 * showing the actual thing is more honest and more persuasive than a picture
 * of it, and it can never drift out of date with the real component.
 */

// A plausible sari-sari store mid-month: behind pace, which is the state the
// meter is actually useful in. Showing a comfortable "on track" example would
// demonstrate nothing.
const DEMO_BASE = {
  expectedMonthlyExpenses: 125000,
  operatingDays: 25,
  dailyNeededTarget: 5000,
  daysInMonth: 31,
  calendarDaysLeftInMonth: 9,
  remainingOperatingDays: 7,
  remainingOperatingDaysIsApproximated: true,
  todaysTarget: 5000,
  todaysSales: 4500,
  todaysGap: -500,
  todaysStatus: "below" as const,
};

function demoAt(salesThisMonth: number): RecoveryTargets {
  const remainingTarget = Math.max(0, DEMO_BASE.expectedMonthlyExpenses - salesThisMonth);
  const adjustedDailyTarget = remainingTarget / DEMO_BASE.remainingOperatingDays;
  return {
    ...DEMO_BASE,
    salesThisMonth,
    remainingTarget,
    adjustedDailyTarget,
    monthCoveragePercent: (salesThisMonth / DEMO_BASE.expectedMonthlyExpenses) * 100,
    onTrack: adjustedDailyTarget <= DEMO_BASE.dailyNeededTarget + 0.005,
  };
}

/**
 * Steps the demo through a few days of recorded sales, so a visitor sees the
 * adjusted target *react* rather than sitting still. Respects reduced-motion by
 * holding on the final frame instead of animating.
 */
const DEMO_FRAMES = [45000, 58000, 71000, 84000];

function useDemoFrame() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setI(DEMO_FRAMES.length - 1);
      return;
    }
    const t = setInterval(() => setI((v) => (v + 1) % DEMO_FRAMES.length), 2600);
    return () => clearInterval(t);
  }, []);

  return DEMO_FRAMES[i]!;
}

const STEPS = [
  {
    n: 1,
    title: "Record what you spend and sell",
    body: "Type it in, snap a photo of the receipt, or bring in a spreadsheet you already keep. A day's entries take a couple of minutes.",
  },
  {
    n: 2,
    title: "See where the money actually went",
    body: "FinSight groups your spending, points out anything unusually large, and shows how much you need in sales to cover the month.",
  },
  {
    n: 3,
    title: "Ask FinSight anything",
    body: 'Ask in your own words — "why were my expenses higher this month?" — and get an answer built from your own records, in plain language.',
  },
];

/**
 * What FinSight does to keep a business's records to itself.
 *
 * Every line here is a property the code actually has, not an aspiration —
 * the isolation is enforced server-side on every request, the receipts bucket
 * really is private, and the link TTL really is ten minutes. A security claim
 * on a landing page is the easiest thing in the world to overstate and the
 * worst thing to be caught overstating, so nothing goes in this list that
 * cannot be pointed at in the source.
 */
const SAFEGUARDS = [
  {
    icon: "▦",
    title: "Your records stay yours",
    body: "Every request is checked against the business profile it belongs to, on the server. One owner's records are never reachable from another's account.",
  },
  {
    icon: "◈",
    title: "Receipt photos are kept private",
    body: "Images are stored in private storage, never on a public address. Opening one creates a link that stops working after ten minutes.",
  },
  {
    icon: "✦",
    title: "The assistant only sees your figures",
    body: "Answers are built from your own records and nothing else. It is never given another business's data, and it says so plainly when your records don't contain the answer.",
  },
  {
    icon: "◍",
    title: "Nothing is saved until you say so",
    body: "Anything read from a receipt photo is shown to you first. FinSight marks the figures it is unsure about instead of quietly filing them.",
  },
];

/**
 * Questions a visitor actually has before signing up.
 *
 * Answered honestly, including where the answer is "no" — the offline one
 * especially. A landing page that pretends there are no limits is one the
 * owner stops believing the first time they hit one.
 */
const FAQS = [
  {
    q: "Do I need to know accounting to use this?",
    a: "No. FinSight is built around how small shops already keep records — what you spent, what you sold. There is no chart of accounts to set up and no bookkeeping terms to learn.",
  },
  {
    q: "What if it reads my receipt wrong?",
    a: "You see everything before it is saved, and you can change any of it. FinSight also checks whether the items add up to the printed total, and points at the line it is least sure of when they don't.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. There is an Android app with the core features — recording expenses and sales, scanning receipts, and the dashboard — so a phone alone is enough to run it. The web version works in any browser.",
  },
  {
    q: "Does it work without internet?",
    a: "Not yet. Records and receipt scanning both need a connection, because the reading and the analysis happen on the server. Offline recording is something we want to add, not something that works today.",
  },
  {
    q: "Can it replace my accountant?",
    a: "No, and it isn't meant to. FinSight is a monitoring tool — it shows you what your own numbers say, while there is still time to act on them. It does not produce official financial statements or file anything for you.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. FinSight is free to use while it is in active development, and no card is asked for at sign-up.",
  },
];

/** Header anchors. Each `href` must match a section `id` below. */
const SECTION_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const FEATURES = [
  {
    icon: "▣",
    title: "Snap a photo of a receipt",
    body: "Point your phone at a receipt and FinSight fills in the date, store and amount for you. You check it before anything is saved — you're always the one who confirms.",
  },
  {
    icon: "◧",
    title: "One screen for the whole picture",
    body: "Money on hand, what you've spent, what you've sold, and which records still need a look — without adding anything up yourself.",
  },
  {
    icon: "◔",
    title: "Spot the unusual ones",
    body: "When a purchase is much bigger than what that category normally costs you, FinSight says so — instead of you finding out at the end of the month.",
  },
  {
    icon: "✦",
    title: "A straight answer, not a spreadsheet",
    body: "Every answer is built only from figures in your own records. If FinSight doesn't have the data, it tells you that rather than guessing.",
  },
];

/**
 * Where the product walkthrough will go.
 *
 * A deliberate placeholder rather than an embed pointed at nothing: it holds
 * the exact 16:9 box the real video will occupy, so dropping the video in
 * later cannot reflow the page around it, and it says plainly that the video
 * is coming rather than looking like a player that failed to load. A visitor
 * who clicks a broken play button learns something worse about the product
 * than one who reads "coming soon".
 *
 * TO SWAP IN THE REAL VIDEO: replace the inner div with the player and keep
 * the aspect-video wrapper. A self-hosted <video> with `controls` and a
 * `poster` is preferable to a YouTube iframe — no third-party cookies, no
 * consent banner, and nothing loads from another origin.
 *
 *   <video className="h-full w-full rounded-2xl" controls poster="/demo-poster.jpg">
 *     <source src="/finsight-walkthrough.mp4" type="video/mp4" />
 *     <track kind="captions" src="/finsight-walkthrough.vtt" srcLang="en" label="English" default />
 *   </video>
 *
 * Captions are not optional. The audience is small business owners who watch
 * with the sound off in a noisy shop, and a walkthrough nobody can follow
 * silently is a walkthrough most of them will not follow at all.
 */
function VideoPlaceholder() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-paper-200 bg-gradient-to-br from-tint-brand via-tint-accent to-paper-100 shadow-sm">
      {/* aspect-video reserves the 16:9 box now, so the real player drops in
          without the surrounding page shifting. */}
      <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-paper/80 shadow-sm backdrop-blur-sm"
        >
          {/* A triangle, not an emoji — this is a control shape, and it should
              render identically on every platform rather than as whatever play
              glyph the OS font happens to supply. */}
          <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-brand-700" role="presentation">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <p className="font-display text-base font-semibold text-ink-900">Product walkthrough</p>
        <p className="max-w-sm text-sm text-ink-600">
          A guided tour of the main features is being recorded. In the meantime you can create an
          account and try them directly.
        </p>
        <span className="mt-1 rounded-full bg-paper/80 px-3 py-1 text-xs font-medium text-ink-500">
          Video coming soon
        </span>
      </div>
    </div>
  );
}

export function Landing() {
  const salesThisMonth = useDemoFrame();
  const demo = demoAt(salesThisMonth);

  return (
    /*
      THE PUBLIC PAGE DOES NOT FOLLOW THE APP THEME.
      ------------------------------------------------------------------
      `data-theme` is written on <html> and remembered in localStorage, so
      before this it survived logging out: an owner who used the dashboard in
      Dark was thrown back to a dark marketing page, which is not a preference
      they ever expressed about this page — it leaked out of the product.

      Pinning it here rather than clearing the stored choice is what makes
      that safe. The theme variables are plain attribute selectors, so
      declaring one on this wrapper re-declares them for this subtree only:
      the page paints Classic, <html> keeps the owner's real preference
      untouched, and their next visit to the dashboard is still Dark. Clearing
      it globally would have "fixed" this by silently discarding a setting
      they chose.

      Scoped rather than global also means no flash and nothing to undo on
      unmount — the override disappears with the element.
    */
    <div data-theme="classic" className="min-h-screen bg-paper-50">
      <header className="border-b border-edge-brand bg-paper">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-6">
          {/* MASCOT SEAM — owl badge mark goes here. */}
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 font-display text-base font-bold text-white"
            >
              F
            </span>
            <span className="font-display text-lg font-semibold text-ink-900">FinSight</span>
          </span>
          {/*
            In-page anchors, hidden on small screens.

            Every comparable product carries these, and their absence is one
            of the things that made this page read as a single long scroll
            rather than a site. They are plain hash links to the section
            headings — no scroll-spy, no JS — so they work before hydration
            and honour the browser's own smooth-scroll setting.

            Dropped below `md` rather than folded into a burger menu: there
            are three of them on a page whose whole content is reachable by
            scrolling, so a menu would be a control that exists to hide three
            words.
          */}
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {SECTION_LINKS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="tap rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <nav className="ml-auto flex items-center gap-1.5 md:ml-4">
            <Link
              to="/login"
              className="tap rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-paper-100"
            >
              Log in
            </Link>
            <ButtonLink to="/register" variant="primary" size="sm">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 lg:px-6 lg:pb-20 lg:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight text-ink-900 sm:text-4xl lg:text-5xl">
                Know where your money actually goes
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                Most small shops track sales and expenses in a notebook — and only find out at the end of the
                month that something didn't add up. FinSight keeps the same records you already keep, and
                tells you what they mean while there's still time to do something about it.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink to="/register" variant="primary" size="lg">
                  Start tracking free
                </ButtonLink>
                <ButtonLink to="/login" variant="secondary" size="lg">
                  I already have an account
                </ButtonLink>
              </div>

              <p className="mt-4 text-sm text-ink-500">
                Built for sari-sari stores, food stalls, and small shops. No accounting background needed.
              </p>
            </div>

            {/* The live meter. Real component, sample numbers. */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-tint-brand via-tint-accent to-paper-100"
              />
              {/*
                The mascot, peering over the meter from behind it.

                aria-hidden and empty alt: it carries no information a screen
                reader needs, and announcing "owl illustration" before the
                actual product evidence would be noise. Hidden below `sm` —
                on a phone the meter needs the full width more than the page
                needs decoration.

                It sits BEHIND the card (-z-10) and is deliberately clipped by
                it, which is what makes the two read as one composition rather
                than a picture placed next to a widget.
              */}
              <img
                src="/finsight-owl.png"
                alt=""
                aria-hidden
                width={512}
                height={609}
                className="pointer-events-none absolute -top-16 right-2 -z-10 hidden h-32 w-auto drop-shadow-sm sm:block lg:-top-20 lg:h-40"
              />
              <div className="relative rounded-2xl bg-paper p-5 shadow-lg border border-paper-200 sm:p-6">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                      Recovery target
                    </p>
                    <h2 className="font-display text-base font-semibold text-ink-900">Aling Nena's Store</h2>
                  </div>
                  <span className="rounded-full bg-tint-brand px-2 py-0.5 text-xs font-medium text-tone-brand">
                    Live example
                  </span>
                </div>

                <RecoveryMeter recoveryStatus={demo} />

                <p className="mt-4 border-t border-paper-200 pt-3 text-xs text-ink-400">
                  Sample figures. Watch the adjusted daily target move as sales come in — that's the number
                  that tells you what today needs to look like.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- What it is ---------------- */}
        {/*
          A plain answer to "what IS this", before the mechanics.

          The hero sells an outcome and "How it works" explains a process;
          between them there was no sentence a visitor could repeat to someone
          else. Every comparable product puts one here, and it is the line
          that decides whether the rest of the page is worth reading.
        */}
        <section className="border-t border-edge-brand bg-paper">
          <div className="mx-auto max-w-3xl px-4 py-12 text-center lg:px-6 lg:py-16">
            <p className="text-xs font-semibold uppercase tracking-wide text-tone-brand">
              What is FinSight?
            </p>
            <h2 className="mt-3 font-display text-2xl font-bold leading-snug text-ink-900 sm:text-3xl">
              A simple way to see whether your shop is actually making money
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-600">
              You record what you spend and what you sell — by typing it, photographing a receipt, or
              importing a spreadsheet. FinSight does the adding up, groups the spending, flags what looks
              unusual, and tells you how much you still need to sell this month to cover it. On a phone or
              in a browser, with the same records on both.
            </p>
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section className="border-y border-edge-brand bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
            <h2 className="font-display text-2xl font-bold text-ink-900">How it works</h2>
            <p className="mt-2 max-w-2xl text-ink-600">
              Three steps, in order. The third only works because of the first two.
            </p>

            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="relative rounded-2xl bg-paper-50 p-5 border border-paper-200">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 font-display text-base font-bold text-white"
                  >
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-display text-base font-semibold text-ink-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- Demo video ---------------- */}
        {/*
          PLACEHOLDER — no video exists yet. See VideoPlaceholder below for how
          to swap the real one in.

          Placed after "How it works" and before the feature grid on purpose.
          By this point a visitor knows what the product claims to do and is
          deciding whether to believe it; a walkthrough is the cheapest way to
          settle that, and it stops the feature list from being the first place
          they have to take anything on trust.
        */}
        <section className="mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-2xl font-bold text-ink-900">See it in action</h2>
            <p className="mx-auto mt-2 max-w-xl text-ink-600">
              A short walkthrough: recording a day's sales, scanning a receipt, and reading what the
              dashboard tells you at the end of the week.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-3xl">
            <VideoPlaceholder />
          </div>
        </section>

        {/* ---------------- Features ---------------- */}
        <section id="features" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
          <h2 className="font-display text-2xl font-bold text-ink-900">What you can do with it</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-paper p-5 border border-paper-200 shadow-sm">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-tint-brand text-lg text-tone-brand"
                >
                  {f.icon}
                </span>
                <h3 className="mt-3 font-display text-base font-semibold text-ink-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Safeguards ---------------- */}
        {/*
          Placed straight after the features, because the feature list is what
          raises the question. "It reads my receipts and answers questions
          about my money" is exactly the point at which an owner wonders who
          else can see any of it.
        */}
        <section className="border-y border-edge-brand bg-tint-brand/40">
          <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
            <h2 className="font-display text-2xl font-bold text-ink-900">Your money, kept to yourself</h2>
            <p className="mt-2 max-w-2xl text-ink-600">
              A record of what a business buys and earns is sensitive. These are the specific things
              FinSight does about that.
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {SAFEGUARDS.map((s) => (
                <div key={s.title} className="flex gap-4 rounded-2xl bg-paper p-5 border border-paper-200">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint-brand text-lg text-tone-brand"
                  >
                    {s.icon}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink-900">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Pricing ---------------- */}
        {/*
          One card, not a three-tier table. There is one plan, and inventing
          "Pro" and "Enterprise" columns to look like a bigger product would
          be advertising things that cannot be bought.
        */}
        <section id="pricing" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-ink-900">What it costs</h2>
            <p className="mt-2 text-ink-600">
              One plan, and it is free. FinSight is in active development, and the shops using it now are
              helping shape it.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-md">
            <div className="rounded-2xl border border-edge-brand bg-paper p-7 text-center shadow-sm">
              <span className="inline-flex rounded-full bg-tint-accent px-3 py-1 text-xs font-semibold text-tone-accent">
                Free while in development
              </span>
              <p className="mt-4 font-display text-4xl font-bold text-ink-900">
                ₱0
                <span className="ml-1 align-middle text-base font-medium text-ink-500">/ month</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-left text-sm text-ink-600">
                {[
                  "Every feature — nothing held back for a paid tier",
                  "Web and Android, with the same records on both",
                  "Unlimited records, receipts and business profiles",
                  "No card required to sign up",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span aria-hidden className="mt-0.5 font-semibold text-tone-brand">
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <ButtonLink to="/register" variant="primary" size="lg" fullWidth>
                  Create your free account
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        {/*
          Native <details>/<summary> rather than a JavaScript accordion: it is
          keyboard-operable and screen-reader-correct for free, it survives
          with JS disabled, and the browser's own find-in-page can reach the
          answers. A hand-rolled version of this is a lot of ARIA to get wrong
          for no gain.
        */}
        <section id="faq" className="scroll-mt-16 border-t border-edge-brand bg-paper">
          <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6 lg:py-16">
            <h2 className="font-display text-2xl font-bold text-ink-900">Questions people ask</h2>
            <div className="mt-8 divide-y divide-paper-200 border-y border-paper-200">
              {FAQS.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="tap flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-900 marker:content-none">
                    <span>{f.q}</span>
                    <span
                      aria-hidden
                      className="shrink-0 text-lg leading-none text-tone-brand transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-2.5 pr-8 text-sm leading-relaxed text-ink-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Context ---------------- */}
        <section className="border-t border-edge-brand bg-paper">
          <div className="mx-auto max-w-3xl px-4 py-12 lg:px-6 lg:py-16">
            <h2 className="font-display text-xl font-bold text-ink-900">Why it works this way</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-600">
              <p>
                FinSight was designed around how small business owners already handle their records — surveys
                and interviews with owners who keep notebooks, hold on to receipts, and check their cash by
                counting it. The aim was to fit that, not to replace it with bookkeeping software.
              </p>
              <p>
                That's why a few things are deliberate. Sales are recorded as a simple reference figure rather
                than a full point-of-sale transaction. Anything read from a receipt photo is shown to you for
                checking before it's saved. And the assistant only answers from figures in your own records —
                if the data isn't there, it says so instead of estimating.
              </p>
              <p className="text-ink-500">
                FinSight is a monitoring tool. It doesn't produce official financial statements, and it won't
                tell you whether to make a purchase — it shows you what the numbers say and leaves the
                decision with you.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- Closing CTA ---------------- */}
        <section className="mx-auto max-w-6xl px-4 py-12 lg:px-6 lg:py-16">
          <div className="rounded-2xl bg-gradient-to-br from-brand-800 to-brand-900 p-8 text-center sm:p-12">
            <h2 className="font-display text-2xl font-bold text-white">Start with one week of records</h2>
            <p className="mx-auto mt-3 max-w-lg text-brand-100">
              That's usually enough for the dashboard to start telling you something you didn't already know.
            </p>
            <div className="mt-6 flex justify-center">
              <ButtonLink to="/register" variant="primary" size="lg">
                Create your free account
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      {/*
        A real footer, in columns.

        Deliberately built only from destinations that EXIST. The obvious move
        when copying a commercial footer is to reproduce its shape — Privacy
        Policy, Terms, Blog, Careers, social icons — but every one of those
        would be a link to nothing, and a footer full of dead links reads as
        less finished than a short honest one. Rows get added here when the
        pages behind them get written.
      */}
      <footer className="border-t border-edge-brand bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-10 lg:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 font-display text-xs font-bold text-white"
                >
                  F
                </span>
                <span className="font-display text-base font-semibold text-ink-900">FinSight</span>
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
                Financial monitoring for small businesses. Keeps the records you already keep, and tells
                you what they mean while there is still time to act on them.
              </p>
            </div>

            <div>
              <h3 className="font-display text-sm font-semibold text-ink-900">Product</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {SECTION_LINKS.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} className="text-ink-500 hover:text-tone-brand">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-display text-sm font-semibold text-ink-900">Get started</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/register" className="text-ink-500 hover:text-tone-brand">
                    Create an account
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="text-ink-500 hover:text-tone-brand">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link to="/recover-password" className="text-ink-500 hover:text-tone-brand">
                    Forgot your password
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-paper-200 pt-6">
            <p className="text-xs text-ink-400">
              © {new Date().getFullYear()} FinSight. Free while in active development.
            </p>
            <p className="text-xs text-ink-400">
              A monitoring tool — not a substitute for professional accounting advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
