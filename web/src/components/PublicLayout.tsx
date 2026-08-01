import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ButtonLink } from "./Button";

/**
 * The chrome every signed-out page wears: header, nav, footer.
 *
 * Shared rather than repeated, because the landing page is no longer the only
 * public page — FAQs, Blogs, Tutorials and Contact all need the same header
 * and the same footer, and a second copy of either would start drifting the
 * first time one of them was edited.
 *
 * THE THEME PIN LIVES HERE. `data-theme` is written on <html> and remembered
 * in localStorage, so without this an owner who used the dashboard in Dark was
 * thrown back to a dark marketing site after logging out — a preference they
 * expressed about the product leaking onto the pages that sell it. Re-
 * declaring the theme on this wrapper rebinds the variables for this subtree
 * only: these pages paint Classic, <html> keeps the real preference, and the
 * dashboard is still Dark on the next visit. Clearing it globally would
 * "fix" this by discarding a setting the owner chose.
 */

const RESOURCES = [
  { to: "/blogs", label: "Blogs" },
  { to: "/tutorials", label: "Tutorials" },
  { to: "/faqs", label: "FAQs" },
];

function Brand({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-base";
  const text = size === "sm" ? "text-base" : "text-lg";
  return (
    <span className="flex items-center gap-2">
      {/* MASCOT SEAM — owl badge mark goes here. */}
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-xl bg-brand-700 font-display font-bold text-white ${box}`}
      >
        F
      </span>
      <span className={`font-display font-semibold text-ink-900 ${text}`}>FinSight</span>
    </span>
  );
}

/**
 * The Resources menu.
 *
 * Opens on click rather than hover: a hover menu is unusable on a touch screen,
 * and most of these owners are on a phone. Closes on Escape, on a click
 * outside, and whenever the route changes — that last one matters because
 * navigating to a menu item does not unmount this component, so without it the
 * menu would still be hanging open on the page you just landed on.
 */
function ResourcesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap flex items-center gap-1 rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900"
      >
        Resources
        <span aria-hidden className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-paper-200 bg-paper py-1 shadow-lg"
        >
          {RESOURCES.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-ink-600 hover:bg-paper-100 hover:text-ink-900"
            >
              {r.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="classic" className="flex min-h-screen flex-col bg-paper-50">
      <header className="sticky top-0 z-30 border-b border-edge-brand bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-6">
          <Link to="/" className="tap rounded-lg">
            <Brand />
          </Link>

          {/* Dropped below `md` rather than folded into a burger menu: the
              whole site is four destinations, and the footer carries every one
              of them a short scroll away. */}
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            <Link
              to="/"
              className="tap rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900"
            >
              Home
            </Link>
            <a
              href="/#features"
              className="tap rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900"
            >
              Features
            </a>
            <ResourcesMenu />
            <Link
              to="/contact"
              className="tap rounded-lg px-3 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900"
            >
              Contact
            </Link>
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

      <main className="flex-1">{children}</main>

      <footer className="border-t border-edge-brand bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
            <div>
              <Brand size="sm" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500">
                FinSight is a financial monitoring tool for Filipino small businesses. It keeps the
                records you already keep — sales, expenses and receipts — and tells you what they mean
                while there is still time to act on them.
              </p>
            </div>

            <div>
              <h3 className="font-display text-sm font-semibold text-ink-900">Help Center</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link to="/blogs" className="text-ink-500 hover:text-tone-brand">
                    Blogs
                  </Link>
                </li>
                <li>
                  <Link to="/faqs" className="text-ink-500 hover:text-tone-brand">
                    FAQs
                  </Link>
                </li>
                <li>
                  <Link to="/tutorials" className="text-ink-500 hover:text-tone-brand">
                    Tutorials
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-ink-500 hover:text-tone-brand">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-sm font-semibold text-ink-900">Others</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link to="/privacy" className="text-ink-500 hover:text-tone-brand">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-ink-500 hover:text-tone-brand">
                    Terms &amp; Conditions
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-paper-200 pt-6 text-center">
            <p className="text-xs text-ink-400">
              © {new Date().getFullYear()} FinSight. A monitoring tool — not a substitute for
              professional accounting advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Shared page header for the secondary public pages. */
export function PublicPageHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <section className="border-b border-edge-brand bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-12 text-center lg:px-6 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-tone-brand">{eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900 sm:text-4xl">{title}</h1>
        {lede ? <p className="mx-auto mt-4 max-w-2xl text-ink-600">{lede}</p> : null}
      </div>
    </section>
  );
}
