import { createFileRoute } from "@tanstack/react-router";
import { PricingSection, FoundersClubSection } from "~/pricing-sections";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "GradeDate — Pricing" },
      {
        name: "description",
        content:
          "See GradeDate's plans: a free tier to start, Premium at $5.99/month, and the Founders Club with a lifetime price lock. Austin, TX goes first.",
      },
      { property: "og:title", content: "GradeDate — Pricing" },
      {
        property: "og:description",
        content:
          "See GradeDate's plans: a free tier to start, Premium at $5.99/month, and the Founders Club with a lifetime price lock. Austin, TX goes first.",
      },
      { name: "twitter:title", content: "GradeDate — Pricing" },
      {
        name: "twitter:description",
        content:
          "See GradeDate's plans: a free tier to start, Premium at $5.99/month, and the Founders Club with a lifetime price lock. Austin, TX goes first.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background accents consistent with the landing page */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.10),transparent_50%)]" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-8 pt-16 sm:pt-24">
        <header className="mb-12 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-rose-300">
              Pricing
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            One plan.{" "}
            <span className="bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">
              Full access.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
            Start free. Upgrade to Premium when you&apos;re ready — or join the
            Founders Club and lock in $5.99/month forever.
          </p>
        </header>

        <section id="pricing" className="scroll-mt-24">
          <PricingSection />
        </section>

        <FoundersClubSection />
      </div>
    </div>
  );
}
