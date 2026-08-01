/**
 * Copy shared by the public pages.
 *
 * The FAQ list lives here rather than in Landing because two pages render it:
 * the landing page shows the first `LANDING_FAQ_COUNT`, and /faqs shows all of
 * them grouped. One source means the landing page can never quietly disagree
 * with the full page it links to.
 */

export interface Faq {
  q: string;
  a: string;
  /** Grouping on the dedicated FAQ page. Ignored on the landing page. */
  topic: FaqTopic;
}

export const FAQ_TOPICS = ["Getting started", "Using FinSight", "Your data", "Cost and limits"] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];

/**
 * Answered honestly, including where the answer is "no".
 *
 * The offline one especially: a landing page that pretends there are no limits
 * is one the owner stops believing the first time they hit one.
 */
export const FAQS: Faq[] = [
  {
    topic: "Getting started",
    q: "What is FinSight and who is it for?",
    a: "FinSight is a financial monitoring tool for small businesses — sari-sari stores, food stalls, small shops. It keeps the records you already keep, does the adding up, and tells you what the numbers mean while there is still time to act on them.",
  },
  {
    topic: "Getting started",
    q: "Do I need to know accounting to use it?",
    a: "No. There is no chart of accounts to set up and no bookkeeping terms to learn. You record what you spent and what you sold, in your own words, and FinSight organises it.",
  },
  {
    topic: "Getting started",
    q: "How do I start?",
    a: "Create a free account, add your business, and record about a week of expenses and sales. That is usually enough for the dashboard to start telling you something you did not already know.",
  },
  {
    topic: "Getting started",
    q: "Is it suitable for a business that is just starting?",
    a: "Yes. FinSight needs your own records and nothing else — no history to import and no minimum size. The insights get sharper as more weeks build up, but it is useful from the first month.",
  },
  {
    topic: "Using FinSight",
    q: "How does scanning a receipt work?",
    a: "You photograph the receipt and FinSight reads the date, store, total and item lines from it. Everything is shown to you to check, and nothing is saved until you confirm it.",
  },
  {
    topic: "Using FinSight",
    q: "What if it reads my receipt wrong?",
    a: "You can change any of it before saving. FinSight also checks whether the item prices add up to the printed total, and when they do not, it points at the line it was least sure of instead of leaving you to find it.",
  },
  {
    topic: "Using FinSight",
    q: "Can I bring in records I already keep in a spreadsheet?",
    a: "Yes. You can import a CSV, match up your columns, and preview every row before anything is added. Nothing is written until you confirm the preview.",
  },
  {
    topic: "Using FinSight",
    q: "Is FinSight available on mobile and desktop?",
    a: "Both. There is an Android app with the core features — expenses, sales, receipt scanning and the dashboard — so a phone alone is enough to run it. The web version works in any browser, on the same records.",
  },
  {
    topic: "Using FinSight",
    q: "Can it replace my accountant?",
    a: "No, and it is not meant to. FinSight is a monitoring tool: it shows you what your own numbers say. It does not produce official financial statements and it does not file anything for you.",
  },
  {
    topic: "Your data",
    q: "Is my data safe?",
    a: "Your records are tied to your business profile and every request is checked against it on the server, so one owner's records are never reachable from another's account. Receipt photos are kept in private storage — opening one creates a link that stops working after ten minutes.",
  },
  {
    topic: "Your data",
    q: "Does the AI assistant see my records?",
    a: "It answers using figures from your own records and nothing else. It is never given another business's data, and when your records do not contain the answer it says so rather than estimating.",
  },
  {
    topic: "Cost and limits",
    q: "Is FinSight free to use?",
    a: "Yes. It is free while in active development, and no card is asked for at sign-up.",
  },
  {
    topic: "Cost and limits",
    q: "Can I use the app offline?",
    a: "Not yet. Recording and receipt scanning both need a connection, because the reading and the analysis happen on the server. Offline recording is something we want to add, not something that works today.",
  },
];

/** How many appear on the landing page before "See all FAQs". */
export const LANDING_FAQ_COUNT = 8;
