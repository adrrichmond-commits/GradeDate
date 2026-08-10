import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/takedown")({
  component: TakedownProcess,
});

function TakedownProcess() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Takedown Process</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: August 10, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Intake</h2>
          <p>
            GradeDate is a dating app with user-generated profiles. We take prompt action to remove
            content or accounts that violate our{" "}
            <Link to="/acceptable-use" className="text-rose-400 underline hover:text-rose-300">
              Acceptable Use Policy
            </Link>
            ,{" "}
            <Link to="/terms" className="text-rose-400 underline hover:text-rose-300">
              Terms of Service
            </Link>
            , or{" "}
            <Link to="/rules" className="text-rose-400 underline hover:text-rose-300">
              Community Rules
            </Link>
            . This page documents our takedown process. Violations reach us through three channels:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              In-app structured reports from any user covering profiles, photos, or messages, with
              specific reason categories and optional detail.
            </li>
            <li>
              Automated flags from our photo and message moderation systems. Every uploaded photo is
              scanned; flagged photos are automatically quarantined in a private, access-controlled
              store and never published. Messages are scanned with heuristics and a moderation
              provider; content matching high-risk patterns is hidden or triggers an account lock.
              Moderation is fail-closed: if scanning is unavailable, content is not approved.
            </li>
            <li>
              Law enforcement requests submitted through our{" "}
              <Link to="/legal" className="text-rose-400 underline hover:text-rose-300">
                Law Enforcement &amp; Legal Requests
              </Link>{" "}
              process.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Automated protective action</h2>
          <p>
            Reports or flags involving suspected minors, CSAM, solicitation, trafficking, or
            exploitation trigger immediate protective action before human review: the affected
            content is hidden or quarantined and the account is locked pending review. Evidence is
            preserved, and for CSAM or trafficking we report to NCMEC and/or law enforcement as
            required by 18 U.S.C. § 2258A and permanently remove the account. Our{" "}
            <Link to="/acceptable-use" className="text-rose-400 underline hover:text-rose-300">
              Acceptable Use Policy
            </Link>{" "}
            states zero tolerance for these violations.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Review queue</h2>
          <p>
            All reports and automated flags enter a prioritized, fully audited review queue. Access
            is role-limited (moderator/admin/owner), protected with multi-factor authentication, and
            least-privilege. Flagged photos are held in a private quarantine store, viewable only
            through short-lived, case-bound signed links, with a default 30-day retention.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Determination</h2>
          <p>
            A reviewer either clears the report or takes action scaled to severity: hide or remove
            the content, suspend the account for a defined duration, or permanently remove the
            account for zero-tolerance violations. Every action and decision is recorded in an
            immutable audit log.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">User notification and appeal</h2>
          <p>
            The affected user is notified of the action and may submit one appeal within 14 days.
            The appeal is reviewed by an authorized team member and may result in reinstatement or
            confirmation of the original action.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Retention</h2>
          <p>
            Safety reports are retained for 12 months after resolution, privileged audit records for
            24 months, and quarantined content per the 30-day default retention schedule — all
            subject to our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">
              Privacy Policy
            </Link>{" "}
            and legal obligations.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Copyright and law enforcement takedowns</h2>
          <p>
            Copyright removals follow our{" "}
            <Link to="/dmca" className="text-rose-400 underline hover:text-rose-300">
              DMCA process
            </Link>
            ; law enforcement requests follow our{" "}
            <Link to="/legal" className="text-rose-400 underline hover:text-rose-300">
              Law Enforcement &amp; Legal Requests
            </Link>{" "}
            process. Both are linked from this page.
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
