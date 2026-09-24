import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-display text-xl tracking-wide">CULT STUDIO</div>
          <p className="text-xs text-cream-dim mt-1 max-w-sm">
            An AI direction desk for images and clips that look like they were
            pulled from a 2am cable rerun. Every render is generated in your
            browser for this demo — no footage leaves the projector booth.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-wider text-cream-dim">
          <Link href="/generate" className="hover:text-cream">Studio</Link>
          <Link href="/now-showing" className="hover:text-cream">Now Showing</Link>
          <Link href="/pricing" className="hover:text-cream">Pricing</Link>
          <Link href="/my-reel" className="hover:text-cream">My Reel</Link>
        </nav>
      </div>
      <div className="border-t border-line py-4 text-center text-[11px] text-cream-dim">
        © {new Date().getFullYear()} Cult Studio. A design concept — not affiliated with any streaming or production studio.
      </div>
    </footer>
  );
}
