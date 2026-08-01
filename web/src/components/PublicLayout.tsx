import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ButtonLink } from "./Button";
import { Menu, X, ChevronDown, Activity } from "lucide-react";

const RESOURCES = [
  { to: "/blogs", label: "Blogs & Articles" },
  { to: "/tutorials", label: "Video Tutorials" },
  { to: "/faqs", label: "FAQ Center" },
];

function Brand({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-base";
  const text = size === "sm" ? "text-base" : "text-lg";
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 font-display font-extrabold text-white shadow-md shadow-brand-700/20 ${box}`}
      >
        F
      </span>
      <span className={`font-display font-bold text-ink-900 tracking-tight ${text}`}>FinSight</span>
    </span>
  );
}

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
    /*
      Opens on hover AND on click, deliberately both.

      Hover is what a pointer user expects here. Click has to keep working
      anyway, because a touch screen has no hover: a tap fires a synthetic
      mouseenter and then a click, so a hover-only menu opens and instantly
      closes under a finger. Keeping both means one implementation serves
      pointer, touch and keyboard rather than stranding phone users — which
      matters more than usual for this product.

      onFocus/onBlur via focus-within is not used because the panel needs to
      survive the pointer travelling from the button down into it; the handlers
      sit on the WRAPPER, which encloses both, so that gap is inside the
      element being tracked.
    */
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900 transition-colors"
      >
        <span>Resources</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-paper-200 bg-paper py-1.5 shadow-xl ring-1 ring-black/5"
        >
          {RESOURCES.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-paper-100 hover:text-ink-900 transition-colors"
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div data-theme="classic" className="flex min-h-screen flex-col bg-paper-50 font-sans antialiased text-ink-900">
      {/*
        Sticky header. The frosted-glass effect is DESKTOP ONLY, deliberately.

        `backdrop-blur` forces the browser to re-sample and re-blur everything
        behind the header, and on a sticky element that happens on every frame
        of every scroll. It is the single most reliable way to make a page
        stutter on a budget Android phone — precisely the device most of these
        shop owners are using.

        Below `md` the bar is near-opaque instead, which costs nothing to
        composite and looks almost identical at 95% (the blur was only ever
        showing through 15% of a solid colour). Above `md`, where there is a
        real GPU, the glass comes back.
      */}
      <header className="sticky top-0 z-50 border-b border-paper-200/80 bg-paper/95 transition md:bg-paper/85 md:backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 lg:px-6">
          <Link to="/" className="tap rounded-xl">
            <Brand />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              to="/"
              className="tap rounded-lg px-3.5 py-2 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900 transition-colors"
            >
              Home
            </Link>
            <a
              href="/#features"
              className="tap rounded-lg px-3.5 py-2 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900 transition-colors"
            >
              Features
            </a>
            <ResourcesMenu />
            <Link
              to="/contact"
              className="tap rounded-lg px-3.5 py-2 text-sm font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900 transition-colors"
            >
              Contact
            </Link>
          </nav>

          {/* Desktop Right Action Buttons */}
          <div className="hidden items-center gap-2 md:flex">
            <Link
              to="/login"
              className="tap rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-paper-100 hover:text-ink-900 transition-colors"
            >
              Log in
            </Link>
            <ButtonLink
              to="/register"
              variant="primary"
              size="sm"
              className="bg-accent-400 text-ink-950 hover:bg-accent-300 font-bold shadow-xs px-4 py-2 rounded-xl transition"
            >
              Get started free
            </ButtonLink>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-paper-200 bg-paper text-ink-700 hover:bg-paper-100 md:hidden"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="border-b border-paper-200 bg-paper p-4 md:hidden space-y-2 shadow-lg">
            <Link
              to="/"
              className="block rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-paper-100"
            >
              Home
            </Link>
            <a
              href="/#features"
              className="block rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-paper-100"
            >
              Features
            </a>
            <Link
              to="/blogs"
              className="block rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-paper-100"
            >
              Blogs
            </Link>
            <Link
              to="/tutorials"
              className="block rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-paper-100"
            >
              Tutorials
            </Link>
            <Link
              to="/contact"
              className="block rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-paper-100"
            >
              Contact
            </Link>
            <div className="pt-2 flex flex-col gap-2 border-t border-paper-200">
              <Link
                to="/login"
                className="w-full text-center rounded-xl py-2.5 text-sm font-semibold text-ink-800 bg-paper-100"
              >
                Log in
              </Link>
              <ButtonLink
                to="/register"
                variant="primary"
                size="md"
                className="w-full text-center bg-accent-400 text-ink-950 font-bold py-2.5 rounded-xl"
              >
                Get started free
              </ButtonLink>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Body */}
      <main className="flex-1">{children}</main>

      {/* Modern Multi-Column Footer */}
      <footer className="border-t border-paper-200/80 bg-paper py-12 lg:py-16">
        <div className="mx-auto max-w-6xl px-4 lg:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Brand size="md" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500">
                FinSight is a financial monitoring and decision-support application built for small businesses in the Philippines. Turn daily sales and supplier receipts into actionable profit clarity.
              </p>
              
              <div className="mt-6 flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3.5 py-1 text-xs font-semibold text-emerald-800 w-fit">
                <Activity className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                <span>All Systems Operational</span>
              </div>
            </div>

            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-900">
                Product & Help
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>
                  <a href="/#features" className="text-ink-600 hover:text-brand-700 transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <Link to="/blogs" className="text-ink-600 hover:text-brand-700 transition-colors">
                    Blogs & Articles
                  </Link>
                </li>
                <li>
                  <Link to="/tutorials" className="text-ink-600 hover:text-brand-700 transition-colors">
                    Video Tutorials
                  </Link>
                </li>
                <li>
                  <Link to="/faqs" className="text-ink-600 hover:text-brand-700 transition-colors">
                    FAQ Center
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-900">
                Company & Legal
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>
                  <Link to="/contact" className="text-ink-600 hover:text-brand-700 transition-colors">
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-ink-600 hover:text-brand-700 transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-ink-600 hover:text-brand-700 transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-paper-200 pt-6 text-center sm:flex sm:items-center sm:justify-between">
            <p className="text-xs text-ink-400">
              © {new Date().getFullYear()} FinSight Inc. A decision support tool — not a substitute for certified accounting advice.
            </p>
            <div className="mt-4 sm:mt-0 text-xs text-ink-400">
              Crafted for Philippine Small Merchants 🇵🇭
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PublicPageHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <section className="border-b border-paper-200 bg-paper py-12 text-center lg:py-16">
      <div className="mx-auto max-w-4xl px-4 lg:px-6">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-700">{eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900 sm:text-4xl">{title}</h1>
        {lede ? <p className="mx-auto mt-4 max-w-2xl text-base text-ink-600">{lede}</p> : null}
      </div>
    </section>
  );
}
