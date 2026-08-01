import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../components/Button";
import { RecoveryMeter } from "../components/RecoveryMeter";
import { PublicLayout } from "../components/PublicLayout";
import { FeatureTiles } from "../components/FeatureTiles";
import { FAQS, LANDING_FAQ_COUNT } from "../lib/marketingContent";

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


export function Landing() {
  const salesThisMonth = useDemoFrame();
  const demo = demoAt(salesThisMonth);

  return (
    // Header, footer and the Classic theme pin all live in PublicLayout, which
    // every signed-out page shares.
    <PublicLayout>
      <>
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

        {/* ---------------- Features ---------------- */}
        <section id="features" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-14 lg:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-tone-brand">Key Features</p>
            <h2 className="mt-3 font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Everything the money side needs
            </h2>
            <p className="mt-3 text-ink-600">
              Record it, read it off a receipt, or import it — then see what it all adds up to, on your
              phone or in a browser.
            </p>
          </div>
          <div className="mt-12">
            <FeatureTiles />
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

        {/* ---------------- FAQ ---------------- */}
        {/*
          Native <details>/<summary> rather than a JavaScript accordion: it is
          keyboard-operable and screen-reader-correct for free, it survives
          with JS disabled, and the browser's own find-in-page can reach the
          answers. A hand-rolled version of this is a lot of ARIA to get wrong
          for no gain.
        */}
        <section id="faq" className="scroll-mt-20 border-t border-edge-brand bg-paper">
          <div className="mx-auto max-w-5xl px-4 py-14 lg:px-6 lg:py-20">
            <h2 className="text-center font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Frequently Asked Questions
            </h2>

            {/*
              Two columns, filled COLUMN-WISE by CSS `columns` rather than by
              splitting the array in half.

              That distinction is what keeps it correct when an answer is open:
              a grid of two equal halves would leave one column short and jump
              the other's rows around as items expand. `break-inside-avoid`
              keeps a question and its answer together, and at one column on
              small screens the reading order is still the source order.
            */}
            <div className="mt-10 gap-4 sm:columns-2">
              {FAQS.slice(0, LANDING_FAQ_COUNT).map((f) => (
                <details
                  key={f.q}
                  className="group mb-4 break-inside-avoid rounded-xl border border-paper-200 bg-paper px-5 py-4 open:border-edge-brand"
                >
                  <summary className="tap flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink-900 marker:content-none">
                    <span>{f.q}</span>
                    <span
                      aria-hidden
                      className="shrink-0 text-lg leading-none text-tone-brand transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-600">{f.a}</p>
                </details>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <Link
                to="/faqs"
                className="tap inline-flex items-center gap-2 rounded-lg border border-paper-200 bg-paper px-5 text-sm font-semibold text-ink-900 shadow-sm hover:bg-paper-100"
              >
                See All FAQs <span aria-hidden>→</span>
              </Link>
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
      </>
    </PublicLayout>
  );
}
