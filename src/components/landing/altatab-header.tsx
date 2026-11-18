"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AltatabLogo } from "@/components/landing/altatab-logo";
import { RequestAccessModal } from "@/components/landing/request-access-modal";
import { cn } from "@/lib/utils";

export const ALTATAB_NAV_LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#security", label: "Security & Access" },
  { href: "#pricing", label: "Pricing / Membership" },
  { href: "#contact", label: "Contact / Enterprise" },
] as const;

type AltatabHeaderProps = {
  signInHref?: string;
  className?: string;
};

function NavAnchor({
  href,
  children,
  onNavigate,
  className,
}: {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className={cn(
        "group relative text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-1 h-px origin-left scale-x-0 bg-gradient-to-r from-cyan-300/0 via-cyan-300 to-cyan-300/0 transition-transform duration-300 group-hover:scale-x-100"
      />
    </a>
  );
}

export function AltatabHeader({
  signInHref = "/login",
  className,
}: AltatabHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 w-full border-b border-white/10 bg-[#0a0a0b]/72 text-white backdrop-blur-[12px] supports-backdrop-filter:bg-[#0a0a0b]/55",
          scrolled && "bg-[#0a0a0b]/88 shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
          className,
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:h-[4.25rem] sm:px-6 lg:px-8">
          <Link
            href="/"
            className="relative z-10 shrink-0 text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]"
            aria-label="Altatab home"
          >
            <AltatabLogo markClassName="text-cyan-300" />
          </Link>

          <nav
            aria-label="Primary"
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 lg:flex"
          >
            {ALTATAB_NAV_LINKS.map((item) => (
              <NavAnchor key={item.href} href={item.href}>
                {item.label}
              </NavAnchor>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              href={signInHref}
              className="hidden h-9 items-center justify-center rounded-lg border border-white/15 bg-transparent px-3.5 text-sm font-medium text-white/90 transition hover:border-white/30 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 sm:inline-flex"
            >
              Sign In
            </Link>
            <button
              type="button"
              onClick={() => setAccessOpen(true)}
              className="hidden h-9 items-center justify-center rounded-lg bg-cyan-400 px-3.5 text-sm font-semibold text-[#041016] shadow-[0_0_24px_rgba(34,211,238,0.35)] transition hover:bg-cyan-300 hover:shadow-[0_0_28px_rgba(34,211,238,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:inline-flex"
            >
              Request Access
            </button>

            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 lg:hidden"
              aria-expanded={mobileOpen}
              aria-controls={menuId}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        <div
          id={menuId}
          className={cn(
            "border-t border-white/10 bg-[#0a0a0b]/95 backdrop-blur-[12px] lg:hidden",
            mobileOpen ? "block" : "hidden",
          )}
        >
          <nav
            aria-label="Mobile"
            className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6"
          >
            {ALTATAB_NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className="rounded-lg px-3 py-3 text-base font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-4">
              <Link
                href={signInHref}
                onClick={closeMobile}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 text-sm font-medium text-white transition hover:bg-white/5"
              >
                Sign In
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  setAccessOpen(true);
                }}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-cyan-400 text-sm font-semibold text-[#041016] shadow-[0_0_24px_rgba(34,211,238,0.35)] transition hover:bg-cyan-300"
              >
                Request Access
              </button>
            </div>
          </nav>
        </div>
      </header>

      <RequestAccessModal open={accessOpen} onOpenChange={setAccessOpen} />
    </>
  );
}
