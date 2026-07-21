import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal")({
  component: LegalPolicy,
});

function LegalPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Law Enforcement & Legal Requests</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 20, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Law Enforcement Requests</h2>
          <p>
            GradeDate will respond to valid legal process from law enforcement agencies.
            We require a valid subpoena, court order, or search warrant before disclosing
            any user data. Emergency disclosure requests (involving imminent risk of death
            or serious bodily harm) will be evaluated on a case-by-case basis.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">How to Submit a Request</h2>
          <p>
            Law enforcement agencies should submit legal requests to:
          </p>
          <p className="mt-2">
            <a href="mailto:legal@gradedate.app" className="text-rose-400 underline hover:text-rose-300">
              legal@gradedate.app
            </a>
          </p>
          <p className="mt-2">Requests must include:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Agency name, badge/ID number, and contact information</li>
            <li>The specific user identifier (email address or user ID)</li>
            <li>The specific data requested</li>
            <li>A copy of the subpoena, court order, or warrant</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">User Notification</h2>
          <p>
            Unless prohibited by law or court order, GradeDate will make reasonable efforts
            to notify affected users before disclosing their data in response to a legal
            request. Gag orders or delayed-notice provisions will be honored where legally
            required.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Data Retention for Legal Purposes</h2>
          <p>
            If your account is subject to a pending legal request, GradeDate may retain
            your data beyond the normal 30-day deletion window until the request is
            resolved, as permitted by applicable law.
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
