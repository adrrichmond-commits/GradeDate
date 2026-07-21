import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/accessibility")({
  component: Accessibility,
});

function Accessibility() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Accessibility</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 20, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Our Commitment</h2>
          <p>
            GradeDate is committed to making our dating platform accessible to all users,
            including those with disabilities. We strive to follow the Web Content
            Accessibility Guidelines (WCAG) 2.1 Level AA standards.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Current Features</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Semantic HTML structure for screen reader compatibility</li>
            <li>Keyboard-navigable interface — all actions accessible without a mouse</li>
            <li>Sufficient color contrast ratios across the interface</li>
            <li>Text alternatives for images and icons where applicable</li>
            <li>Responsive design that adapts to screen magnification</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Known Limitations</h2>
          <p>
            We are actively working to improve. If you encounter accessibility barriers,
            please let us know:
          </p>
          <p className="mt-2">
            <a href="mailto:support@gradedate.app" className="text-rose-400 underline hover:text-rose-300">
              support@gradedate.app
            </a>
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
