/**
 * Homepage anchor links for the fixed top nav (owner ask, D2.4).
 *
 * Anonymous visitors on "/" get four labeled anchors — How It Works, Pricing,
 * Try the Demo, Join Waitlist. How It Works, Try the Demo, and Join Waitlist
 * are plain hash anchors (`/#section`): native fragment navigation works
 * without a full reload when the visitor is already on "/", and it is the
 * most reliable mechanism here. Pricing has an optional `href` override that
 * points at the real /pricing route instead (audit A1).
 *
 * The sections themselves carry `scroll-mt-24` (96px) so the fixed 64px nav
 * never covers the section heading when the browser (or scrollIntoView)
 * positions the scroll target.
 */
import type { ReactNode } from "react";

export interface HomeAnchor {
  /** Visible link label. */
  label: string;
  /** Target section id on the homepage (e.g. "pricing"). */
  sectionId: string;
  /**
   * Optional absolute-from-"/" href override. When set, the link navigates to
   * a real route (e.g. "/pricing") instead of scrolling to the homepage
   * section — used for entries whose target now has its own page.
   */
  href?: string;
}

export const HOME_ANCHORS: readonly HomeAnchor[] = [
  { label: "How It Works", sectionId: "how-it-works" },
  { label: "Pricing", sectionId: "pricing", href: "/pricing" },
  { label: "Try the Demo", sectionId: "demo" },
  { label: "Join Waitlist", sectionId: "waitlist" },
];

/**
 * Absolute-from-"/" href for an anchor: the route override when present,
 * otherwise a hash anchor like "/#pricing".
 */
export function homeAnchorHref(anchor: HomeAnchor): string {
  return anchor.href ?? `/#${anchor.sectionId}`;
}

/** Desktop row of homepage anchor links, styled like NavLink. */
export function HomeAnchorLinks({ className = "" }: { className?: string }): ReactNode {
  return (
    <div className={className}>
      {HOME_ANCHORS.map((a) => (
        <a
          key={a.sectionId}
          href={homeAnchorHref(a)}
          className="rounded text-sm text-gray-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-rose-500 focus-visible:outline-offset-3"
        >
          {a.label}
        </a>
      ))}
    </div>
  );
}
