import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dmca")({
  component: DMCAPolicy,
});

function DMCAPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">DMCA / Copyright Policy</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 20, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Copyright Infringement</h2>
          <p>
            GradeDate respects the intellectual property rights of others. If you believe
            that any content on GradeDate infringes your copyright, you may submit a
            takedown notice under the Digital Millennium Copyright Act (DMCA).
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">How to File a DMCA Notice</h2>
          <p>Send a written notice to:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Email: <a href="mailto:support@gradedate.app" className="text-rose-400 underline hover:text-rose-300">support@gradedate.app</a></li>
            <li>Include "DMCA Takedown Notice" in the subject line</li>
          </ul>
          <p className="mt-3">Your notice must include:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>A physical or electronic signature of the copyright owner (or authorized agent)</li>
            <li>Identification of the copyrighted work claimed to be infringed</li>
            <li>Identification of the infringing material and its location on GradeDate (e.g., the user's profile URL or match ID)</li>
            <li>Your contact information: name, address, phone number, and email</li>
            <li>A statement that you have a good faith belief the use is not authorized</li>
            <li>A statement under penalty of perjury that the information in your notice is accurate</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Counter-Notice</h2>
          <p>
            If you believe your content was removed by mistake, you may file a counter-notice
            with the same contact information. Include identification of the removed material,
            a statement under penalty of perjury that you believe the removal was in error,
            and your consent to the jurisdiction of your local federal court.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Repeat Infringers</h2>
          <p>
            GradeDate will terminate the accounts of users who are determined to be repeat
            copyright infringers.
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
