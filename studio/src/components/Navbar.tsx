"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/generate", label: "Studio" },
  { href: "/now-showing", label: "Now Showing" },
  { href: "/pricing", label: "Pricing" },
  { href: "/my-reel", label: "My Reel" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-marquee/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 group" onClick={() => setOpen(false)}>
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-sm bg-red text-cream font-display text-lg group-hover:bg-red-hot transition-colors"
          >
            C
          </span>
          <span className="font-display text-2xl tracking-wide">CULT STUDIO</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm uppercase tracking-wider transition-colors ${
                  active
                    ? "text-gold"
                    : "text-cream-dim hover:text-cream"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/generate"
            className="ml-2 rounded-sm bg-red px-4 py-2 text-sm font-bold uppercase tracking-wider text-cream hover:bg-red-hot transition-colors"
          >
            Roll Camera
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden text-cream text-sm uppercase tracking-wider border border-line px-3 py-2 rounded-sm"
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-line px-5 py-3 flex flex-col gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`py-2 text-sm uppercase tracking-wider ${
                pathname === link.href ? "text-gold" : "text-cream-dim"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
