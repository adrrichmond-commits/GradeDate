import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/rules")({
  component: ContentRules,
});

function ContentRules() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Photo & Content Rules</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 20, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Photos Must Be of You</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>All profile photos must be genuine photos of <strong className="text-white">you</strong>.</li>
            <li>No photos of celebrities, anime characters, pets, landscapes, or stock imagery.</li>
            <li>No group shots as your primary photo — your face must be clearly identifiable.</li>
            <li>No photos stolen from other people's profiles or social media accounts.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">No Explicit or Inappropriate Content</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>No nudity, sexually explicit content, or suggestive imagery.</li>
            <li>No gore, violence, or graphic content of any kind.</li>
            <li>No illegal imagery or content that violates any applicable law.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Your Face Must Be Visible</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Your face must be clearly visible in at least one photo.</li>
            <li>No sunglasses that fully obscure your eyes.</li>
            <li>No extreme filters, masks, or distortions that hide your appearance.</li>
            <li>The grading system requires a clear, unobstructed view of your face.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">No Hate or Harassment</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>No hate symbols, slurs, or discriminatory content in photos or bios.</li>
            <li>No harassment, bullying, or targeted abuse toward other users.</li>
            <li>No content that promotes violence against any individual or group.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Enforcement</h2>
          <p>
            Violating these rules may result in content removal, temporary account suspension,
            or permanent account ban at our sole discretion. We review reported content
            promptly and take action as appropriate.
          </p>
          <p className="mt-2">
            If you encounter content that violates these rules, use the{" "}
            <span className="font-semibold text-rose-400">Report</span> button on the
            user's profile or match card.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Reporting a Violation</h2>
          <p>
            You can report any user or photo by clicking the Report button available on
            match cards, connection profiles, and chat screens. Select the reason that
            best describes the violation and we'll review it.
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
