import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/safety")({
  component: SafetyTips,
});

function SafetyTips() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Safety Tips</h1>
      <p className="mb-10 text-sm text-gray-400">
        Your safety is important. Follow these guidelines when meeting people from GradeDate.
      </p>

      <div className="space-y-8 text-gray-300">
        <section className="rounded-lg border border-white/5 bg-gray-900/50 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-rose-400">📍</span> Meet in Public
          </h2>
          <p>
            Always meet for the first time in a populated, public place — a coffee shop,
            restaurant, or park with people around. Never agree to be picked up at your
            home or invited to a private residence on a first date.
          </p>
        </section>

        <section className="rounded-lg border border-white/5 bg-gray-900/50 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-rose-400">📱</span> Tell Someone
          </h2>
          <p>
            Let a friend or family member know where you're going, who you're meeting
            (share their name and photo from GradeDate), and when you expect to be back.
            Check in with them when the date is over.
          </p>
        </section>

        <section className="rounded-lg border border-white/5 bg-gray-900/50 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-rose-400">💰</span> Don't Send Money
          </h2>
          <p>
            Never send money, gift cards, or financial information to anyone you meet on
            GradeDate, regardless of how compelling their story is. Report any user who
            asks for financial assistance.
          </p>
        </section>

        <section className="rounded-lg border border-white/5 bg-gray-900/50 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-rose-400">🛡️</span> Use Block & Report
          </h2>
          <p>
            If someone makes you uncomfortable, use the{" "}
            <span className="font-semibold text-rose-400">Block</span> button to
            immediately remove them from your matches and prevent any further contact.
            Use <span className="font-semibold text-rose-400">Report</span> if they've
            violated our content rules or made you feel unsafe.
          </p>
        </section>

        <section className="rounded-lg border border-white/5 bg-gray-900/50 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-rose-400">💬</span> Stay on GradeDate
          </h2>
          <p>
            Keep conversations on GradeDate until you feel comfortable. Be wary of anyone
            who immediately pushes to move the conversation to another platform, text, or
            email — especially before you've met in person.
          </p>
        </section>

        <section className="rounded-lg border border-white/5 bg-gray-900/50 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-rose-400">🧭</span> Trust Your Instincts
          </h2>
          <p>
            If something feels off, leave. You are never obligated to stay in a situation
            that makes you uncomfortable. Your instincts are your best safety tool.
          </p>
        </section>

        <section className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-red-400">
            <span>🚨</span> Emergency
          </h2>
          <p className="text-gray-300">
            If you are in immediate danger or feel threatened, call your local emergency
            services immediately (911 in the United States). Your physical safety is
            always the top priority.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-white/5 pt-6">
        <Link to="/" className="text-sm text-rose-400 transition hover:text-rose-300">
          ← Back to GradeDate
        </Link>
      </div>
    </div>
  );
}
