import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  BellRing,
  ChefHat,
  Globe2,
  ScanLine,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { AltatabHeader } from "@/components/landing/altatab-header";

export const metadata: Metadata = {
  title: "AltaTab · Digital QR Menu & AI Waiter",
  description:
    "QR digital menus with an AI chef assistant for restaurants — multilingual guests, smart upselling, and real-time waiter alerts.",
};

const DEMO_MENU_HREF = "/menu/demo/table-1";
const ADMIN_LOGIN_HREF = "/login";

const features = [
  {
    title: "Personal AI Chef Assistant",
    body: "Guests chat in their own words — dish picks, wine pairings, and allergy-safe suggestions without waiting for a server.",
    icon: ChefHat,
  },
  {
    title: "Smart Upselling",
    body: "Surface drinks, sauces, and desserts at the right moment so average check size climbs without pushy scripts.",
    icon: Sparkles,
  },
  {
    title: "Multilingual Support",
    body: "Tourists order confidently in Georgian, English, Russian, and more — one menu, every language at the table.",
    icon: Globe2,
  },
  {
    title: "Waiter Paging & Analytics",
    body: "Instant staff alerts from the table, plus an admin dashboard for menu, tables, and service performance.",
    icon: BarChart3,
  },
] as const;

const steps = [
  {
    n: "01",
    title: "Scan the QR at the table",
    body: "Guests open your branded digital menu on their phone — no app install.",
    icon: ScanLine,
  },
  {
    n: "02",
    title: "Order & chat with the AI chef",
    body: "Browse, ask questions, and get pairing help in any language.",
    icon: UtensilsCrossed,
  },
  {
    n: "03",
    title: "Kitchen & waiter stay in sync",
    body: "Requests reach staff instantly so service stays fast and personal.",
    icon: BellRing,
  },
] as const;

export default function Home() {
  return (
    <div className="landing-root flex min-h-full flex-col bg-[#140806] text-[#2d0000]">
      <style>{`
        @keyframes landing-rise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-glow {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.75; }
        }
        @keyframes landing-sheen {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
        .landing-rise {
          animation: landing-rise 0.9s ease-out both;
        }
        .landing-rise-delay-1 { animation-delay: 0.12s; }
        .landing-rise-delay-2 { animation-delay: 0.24s; }
        .landing-rise-delay-3 { animation-delay: 0.36s; }
        .landing-ambient {
          animation: landing-glow 7s ease-in-out infinite;
        }
        .landing-brand-mark {
          background-size: 200% 200%;
          animation: landing-sheen 10s ease-in-out infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-rise,
          .landing-ambient,
          .landing-brand-mark { animation: none; }
        }
        html { scroll-behavior: smooth; }
      `}</style>

      <AltatabHeader signInHref={ADMIN_LOGIN_HREF} />

      {/* Hero — one composition, brand first, full-bleed visual plane */}
      <section className="relative isolate flex min-h-[calc(100svh-4.25rem)] flex-col justify-end overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pb-20 lg:justify-center lg:pb-24 lg:pt-20">
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[radial-gradient(120%_90%_at_70%_10%,#8b1a1a_0%,#4a0c0c_38%,#140806_78%)]"
        />
        <div
          aria-hidden
          className="landing-ambient absolute -top-24 right-[-10%] -z-10 h-[70vmin] w-[70vmin] rounded-full bg-[radial-gradient(circle,rgba(196,165,116,0.28),transparent_68%)] blur-2xl"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.14]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
          }}
        />
        {/* Product visual: dining + phone menu as edge-to-edge plane */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[58%] lg:block"
        >
          <svg
            viewBox="0 0 640 900"
            className="landing-rise landing-rise-delay-2 h-full w-full object-cover opacity-90"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f6e7c1" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#c4a574" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="phone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a1210" />
                <stop offset="100%" stopColor="#120807" />
              </linearGradient>
            </defs>
            <ellipse cx="340" cy="720" rx="260" ry="48" fill="#000" opacity="0.28" />
            <ellipse cx="340" cy="610" rx="220" ry="150" fill="url(#plate)" opacity="0.2" />
            <ellipse
              cx="340"
              cy="600"
              rx="168"
              ry="108"
              fill="none"
              stroke="#f6e7c1"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
            <rect
              x="390"
              y="160"
              width="210"
              height="430"
              rx="36"
              fill="url(#phone)"
              stroke="#f6e7c1"
              strokeOpacity="0.4"
              strokeWidth="2"
            />
            <rect x="410" y="198" width="170" height="340" rx="12" fill="#1c0c0a" />
            <text
              x="495"
              y="236"
              textAnchor="middle"
              fill="#f6e7c1"
              fontSize="18"
              fontFamily="Georgia, serif"
            >
              AltaTab
            </text>
            <rect x="428" y="258" width="134" height="10" rx="5" fill="#f6e7c1" opacity="0.35" />
            <rect x="428" y="286" width="134" height="54" rx="10" fill="#6d0808" opacity="0.85" />
            <rect x="428" y="352" width="134" height="54" rx="10" fill="#f6e7c1" opacity="0.12" />
            <rect x="428" y="418" width="134" height="54" rx="10" fill="#f6e7c1" opacity="0.12" />
            <rect x="428" y="484" width="90" height="28" rx="8" fill="#f6e7c1" opacity="0.55" />
            <g transform="translate(210 430)">
              <rect
                width="88"
                height="88"
                rx="10"
                fill="#f6e7c1"
                fillOpacity="0.92"
              />
              <rect x="10" y="10" width="22" height="22" fill="#2d0000" />
              <rect x="56" y="10" width="22" height="22" fill="#2d0000" />
              <rect x="10" y="56" width="22" height="22" fill="#2d0000" />
              <rect x="38" y="38" width="12" height="12" fill="#2d0000" />
              <rect x="56" y="56" width="10" height="10" fill="#2d0000" />
              <rect x="70" y="56" width="10" height="10" fill="#2d0000" />
              <rect x="56" y="70" width="10" height="10" fill="#2d0000" />
              <rect x="70" y="70" width="10" height="10" fill="#2d0000" />
            </g>
          </svg>
        </div>

        <div className="relative mx-auto w-full max-w-6xl">
          <p className="landing-rise landing-brand-mark mb-4 max-w-xl bg-[linear-gradient(110deg,#f6e7c1_20%,#fff8ea_45%,#c4a574_70%,#f6e7c1_95%)] bg-clip-text text-5xl font-semibold tracking-[-0.04em] text-transparent sm:text-6xl md:text-7xl lg:text-8xl">
            AltaTab
          </p>
          <h1 className="landing-rise landing-rise-delay-1 max-w-2xl text-balance text-2xl font-semibold leading-tight tracking-[-0.02em] text-[#f3ebe0] sm:text-3xl md:text-4xl">
            Digital QR Menu &amp; AI Waiter for Modern Restaurants
          </h1>
          <p className="landing-rise landing-rise-delay-2 mt-5 max-w-xl text-pretty text-base leading-relaxed text-[#f3ebe0]/78 sm:text-lg">
            Raise average check size, welcome foreign guests in any language, and
            keep the floor moving — one scan at the table.
          </p>
          <div
            id="demo"
            className="landing-rise landing-rise-delay-3 mt-9 flex flex-wrap gap-3"
          >
            <Link
              href={DEMO_MENU_HREF}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#f3ebe0] px-6 text-base font-semibold text-[#3a0a0a] shadow-[0_14px_40px_rgba(0,0,0,0.35)] transition hover:bg-white"
            >
              Explore Sample Menu
            </Link>
            <Link
              href={ADMIN_LOGIN_HREF}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#f3ebe0]/35 bg-white/5 px-6 text-base font-semibold text-[#f3ebe0] backdrop-blur-sm transition hover:border-[#f3ebe0]/6 hover:bg-white/10"
            >
              Restaurant Admin Panel
            </Link>
          </div>
        </div>
      </section>

      {/* Platform */}
      <section
        id="platform"
        className="relative border-t border-[#2d0000]/10 bg-[#f3ebe0] px-5 py-20 sm:px-8 sm:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold tracking-[0.14em] text-[#6d0808] uppercase">
            Platform
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[#2d0000] sm:text-4xl">
            Built for the dining room — and the bottom line
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5c4038] sm:text-lg">
            Everything guests need at the table, with tools owners need behind the
            scenes.
          </p>

          <ul className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
            {features.map(({ title, body, icon: Icon }) => (
              <li key={title} className="flex gap-4 border-t border-[#2d0000]/12 pt-8">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#6d0808] text-[#f3ebe0]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#2d0000]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5c4038] sm:text-base">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="relative bg-[#ebe3d4] px-5 py-20 sm:px-8 sm:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold tracking-[0.14em] text-[#6d0808] uppercase">
            How it works
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-[#2d0000] sm:text-4xl">
            From QR scan to fulfilled request
          </h2>

          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map(({ n, title, body, icon: Icon }) => (
              <li key={n} className="relative">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm font-medium tracking-wider text-[#6d0808]">
                    {n}
                  </span>
                  <Icon className="size-5 text-[#6d0808]" aria-hidden />
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-[#2d0000]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5c4038] sm:text-base">
                  {body}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-14 flex flex-wrap gap-3">
            <Link
              href={DEMO_MENU_HREF}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#6d0808] px-5 text-sm font-semibold text-[#f3ebe0] transition hover:bg-[#5a0606]"
            >
              Try the live demo
            </Link>
            <Link
              href={ADMIN_LOGIN_HREF}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#2d0000]/20 bg-transparent px-5 text-sm font-semibold text-[#2d0000] transition hover:bg-[#2d0000]/6"
            >
              Open admin login
            </Link>
          </div>
        </div>
      </section>

      <section
        id="security"
        className="relative border-t border-[#2d0000]/8 bg-[#f3ebe0] px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold tracking-[0.14em] text-[#6d0808] uppercase">
            Security &amp; Access
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[#2d0000] sm:text-4xl">
            Membership-gated by design
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5c4038] sm:text-lg">
            There is no public signup. Restaurant staff sign in with invited
            accounts; owners manage roles, and guest menus stay separate from
            admin access.
          </p>
        </div>
      </section>

      <section
        id="pricing"
        className="relative bg-[#ebe3d4] px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold tracking-[0.14em] text-[#6d0808] uppercase">
            Pricing / Membership
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[#2d0000] sm:text-4xl">
            Exclusive plans for serious operators
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5c4038] sm:text-lg">
            Altatab is sold as a paid membership. Request access and we&apos;ll
            tailor onboarding, AI usage, and multi-location options to your
            group.
          </p>
        </div>
      </section>

      <section
        id="contact"
        className="relative border-t border-[#2d0000]/8 bg-[#f3ebe0] px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold tracking-[0.14em] text-[#6d0808] uppercase">
            Contact / Enterprise
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[#2d0000] sm:text-4xl">
            Talk to us about your venues
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#5c4038] sm:text-lg">
            Multi-location groups and enterprise rollouts start with a short
            access request. Existing members sign in to the admin panel.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={ADMIN_LOGIN_HREF}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#2d0000]/20 bg-transparent px-5 text-sm font-semibold text-[#2d0000] transition hover:bg-[#2d0000]/6"
            >
              Sign In
            </Link>
            <Link
              href={DEMO_MENU_HREF}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#6d0808] px-5 text-sm font-semibold text-[#f3ebe0] transition hover:bg-[#5a0606]"
            >
              Explore sample menu
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#f3ebe0]/15 bg-[#140806] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[#f6e7c1]">
              Altatab
            </p>
            <p className="mt-1 text-sm text-[#f3ebe0]/55">
              Smart digital menus with an AI chef for restaurants.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#f3ebe0]/7">
            <a href="#platform" className="hover:text-[#f3ebe0]">
              Platform
            </a>
            <a href="#security" className="hover:text-[#f3ebe0]">
              Security
            </a>
            <a href="#pricing" className="hover:text-[#f3ebe0]">
              Pricing
            </a>
            <a href="#contact" className="hover:text-[#f3ebe0]">
              Contact
            </a>
            <Link href={ADMIN_LOGIN_HREF} className="hover:text-[#f3ebe0]">
              Sign In
            </Link>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-xs text-[#f3ebe0]/40">
          © {new Date().getFullYear()} Altatab. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
