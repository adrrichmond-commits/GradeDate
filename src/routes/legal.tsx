import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal")({
  component: LegalPolicy,
});

/**
 * Law Enforcement Guidelines — owner-ratified 2026-08-17 (jurisdiction
 * Payson, Utah, USA; ≤2 business-day preservation ack; ≤10 business-day
 * standard response; emergency best-effort ≤24h; 90-day renewable holds).
 * Source of truth: /home/team/shared/law-enforcement-guidelines-draft.md
 * (sanitized final: law-enforcement-guidelines-stripe-copy.md PART 2).
 * Do not add commitments beyond the ratified draft.
 */
function LegalPolicy() {
  const mailto = (subject?: string) =>
    subject
      ? `mailto:legal@gradedate.app?subject=${encodeURIComponent(subject)}`
      : "mailto:legal@gradedate.app";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Law Enforcement & Legal Requests</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: August 17, 2026</p>

      <div className="space-y-10 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">1. About These Guidelines</h2>
          <p className="leading-relaxed">
            GradeDate is a dating application that helps users build and understand their dating
            profile and connect with geographically relevant matches. GradeDate is operated from
            Payson, Utah, United States.
          </p>
          <p className="mt-3 leading-relaxed">
            These Guidelines explain how law enforcement agencies may request user information from
            GradeDate, what data may be available, and how GradeDate responds to legal process,
            preservation requests, and emergency requests. These Guidelines are for law enforcement
            and government agencies; users should refer to our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/data" className="text-rose-400 underline hover:text-rose-300">
              Data Rights
            </Link>{" "}
            pages.
          </p>
          <p className="mt-3 leading-relaxed">
            GradeDate responds to valid legal process in accordance with applicable U.S. federal and
            state law. Nothing in these Guidelines obligates GradeDate to disclose information in
            response to requests that are not supported by valid legal process, and GradeDate may
            seek to narrow, object to, or move to quash overly broad or legally deficient requests.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">2. Types of Data GradeDate May Have</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-white">
            2.1 Information that may be available
          </h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/5 bg-gray-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 font-semibold text-white">Category</th>
                  <th className="px-4 py-3 font-semibold text-white">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Account and profile information</td>
                  <td className="px-4 py-3">
                    Email address used to register, display name, age, gender, preferences, bio,
                    profile photos (up to 5), expanded profile fields (lifestyle, communication
                    style, dating goals, occupation, hobbies, height, pronouns, etc.), registration
                    timestamp.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Location information</td>
                  <td className="px-4 py-3">
                    City-level location and coordinates used for distance-based matching (currently
                    Austin, TX metro area).
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Usage information</td>
                  <td className="px-4 py-3">
                    Likes, passes, matches, connections, messages exchanged (while the account is
                    active), login/session activity, IP addresses and device/session metadata where
                    logged.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Verification status</td>
                  <td className="px-4 py-3">
                    Age-verification status and timestamp (verified / pending / unverified).
                    Government-issued ID images and selfies are processed and stored by our
                    third-party identity verification provider (Stripe Identity) — GradeDate does
                    not store the ID images themselves.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Safety records</td>
                  <td className="px-4 py-3">
                    Reports made against or by the account, moderation flags, photo/message review
                    cases, suspension and appeal history, and privileged audit records of
                    administrative actions.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Subscription/billing status</td>
                  <td className="px-4 py-3">
                    Subscription, trial, and purchase status and timestamps. Payment card numbers
                    and full payment details are processed and stored by our payment provider
                    (Stripe) — GradeDate does not store card data.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Technical data</td>
                  <td className="px-4 py-3">
                    Session and authentication records, rate-limit counters, push-notification
                    subscription endpoints, server/request logs where retained, retention metadata.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 mt-6 text-lg font-semibold text-white">
            2.2 Information GradeDate does NOT have
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-6 leading-relaxed">
            <li>
              <strong className="text-gray-200">Payment card numbers or full payment details</strong>{" "}
              — held by Stripe.
            </li>
            <li>
              <strong className="text-gray-200">
                Government ID images or selfies submitted for age verification
              </strong>{" "}
              — held by Stripe Identity.
            </li>
            <li>
              <strong className="text-gray-200">Plaintext passwords</strong> — passwords are stored
              only as salted hashes and are not disclosed.
            </li>
            <li>
              <strong className="text-gray-200">Message content after account deletion</strong> —
              messages are hard-deleted immediately upon account deletion.
            </li>
            <li>
              <strong className="text-gray-200">Data beyond applicable retention windows</strong>{" "}
              (see section 7).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">3. How to Submit a Request</h2>
          <p className="leading-relaxed">
            Law enforcement agencies should submit all legal requests (subpoenas, court orders,
            search warrants, preservation requests, and emergency requests) to:
          </p>
          <p className="mt-2">
            <a href={mailto()} className="text-rose-400 underline hover:text-rose-300">
              legal@gradedate.app
            </a>
          </p>
          <p className="mt-3 leading-relaxed">Please include:</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-6 leading-relaxed">
            <li>
              <strong className="text-gray-200">Agency and requester identification</strong> —
              agency name, requester name, badge/ID number, and a work email address and phone
              number for follow-up.
            </li>
            <li>
              <strong className="text-gray-200">Case reference</strong> — case number and a brief
              description of the investigation.
            </li>
            <li>
              <strong className="text-gray-200">User identifiers</strong> — the specific GradeDate
              user identifier(s): registered email address and/or numeric user ID. (Note: GradeDate
              cannot search by name alone; a name is not a unique identifier.)
            </li>
            <li>
              <strong className="text-gray-200">Specific data requested</strong> — the precise
              records or categories of records sought and the relevant time period.
            </li>
            <li>
              <strong className="text-gray-200">Legal process</strong> — a copy of the subpoena,
              court order, search warrant, or other legal process authorizing the request, or a
              statement of the statutory basis for the request.
            </li>
          </ol>
          <p className="mt-3 leading-relaxed">
            Requests that do not include valid legal process or sufficient identifiers may be
            returned or held pending clarification.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">4. Preservation Requests</h2>
          <p className="leading-relaxed">
            GradeDate will honor reasonable requests to preserve user data pending legal process.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-6 leading-relaxed">
            <li>
              <strong className="text-gray-200">How to submit:</strong> Email{" "}
              <a
                href={mailto("PRESERVATION REQUEST")}
                className="text-rose-400 underline hover:text-rose-300"
              >
                legal@gradedate.app
              </a>{" "}
              with the subject &ldquo;PRESERVATION REQUEST&rdquo;, the agency and requester
              identification, the user identifier(s), and the scope of data to be preserved.
            </li>
            <li>
              <strong className="text-gray-200">What happens:</strong> GradeDate will place a
              preservation hold on the identified account&rsquo;s available data as soon as
              practicable. Preservation holds are honored for{" "}
              <strong className="text-gray-200">90 days</strong> and are renewable upon a further
              preservation request. A preservation request does not, by itself, authorize
              disclosure of the preserved data; valid legal process is still required for
              disclosure.
            </li>
            <li>
              <strong className="text-gray-200">Acknowledgment:</strong> GradeDate will acknowledge
              receipt of a preservation request within{" "}
              <strong className="text-gray-200">2 business days</strong>.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">5. Emergency Disclosure Requests</h2>
          <p className="leading-relaxed">
            GradeDate may disclose information to law enforcement{" "}
            <strong className="text-gray-200">without prior notice to the user</strong> when there
            is an{" "}
            <strong className="text-gray-200">
              emergency involving imminent danger of death or serious bodily injury
            </strong>{" "}
            to any person, or in circumstances involving the safety of a child.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-6 leading-relaxed">
            <li>
              <strong className="text-gray-200">How to submit:</strong> Email{" "}
              <a
                href={mailto("EMERGENCY — ")}
                className="text-rose-400 underline hover:text-rose-300"
              >
                legal@gradedate.app
              </a>{" "}
              with the subject line beginning &ldquo;EMERGENCY — &rdquo;, and include: the nature
              of the emergency, the specific user identifier(s), the specific data needed, and the
              name and contact details of the requesting officer and their supervisor.
            </li>
            <li>
              <strong className="text-gray-200">Response:</strong> Emergency requests are
              prioritized for immediate review and are evaluated as promptly as possible —
              typically within hours, and in any event we use reasonable best efforts to respond
              within <strong className="text-gray-200">24 hours</strong>. If the request appears
              deficient, we will request the missing information.
            </li>
            <li>
              <strong className="text-gray-200">Child safety:</strong> If the emergency involves
              suspected child sexual abuse material (CSAM), a solicitation of a minor, or similar
              child-safety concerns, GradeDate will, consistent with our{" "}
              <Link to="/acceptable-use" className="text-rose-400 underline hover:text-rose-300">
                Acceptable Use Policy
              </Link>
              , immediately hide the affected content, lock the account pending review, preserve
              evidence, and report the matter to the{" "}
              <strong className="text-gray-200">
                National Center for Missing &amp; Exploited Children (NCMEC)
              </strong>{" "}
              as required by <strong className="text-gray-200">18 U.S.C. § 2258A</strong>, and may
              refer the matter to law enforcement.
            </li>
            <li>
              <strong className="text-gray-200">Human trafficking:</strong> For suspected human
              trafficking or exploitation, GradeDate will preserve evidence and refer users and law
              enforcement to the{" "}
              <strong className="text-gray-200">
                National Human Trafficking Hotline at 1-888-373-7888
              </strong>{" "}
              and may report to law enforcement.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">
            6. Standard Disclosure Process and Response Timelines
          </h2>
          <ol className="list-decimal space-y-1.5 pl-6 leading-relaxed">
            <li>
              <strong className="text-gray-200">Receipt and review.</strong> GradeDate reviews each
              request to confirm it is supported by valid legal process and is sufficiently
              specific.
            </li>
            <li>
              <strong className="text-gray-200">Acknowledgment.</strong> GradeDate acknowledges
              receipt of a valid request within <strong className="text-gray-200">2 business days</strong>.
            </li>
            <li>
              <strong className="text-gray-200">Response.</strong> GradeDate uses reasonable best
              efforts to produce responsive, non-privileged data within{" "}
              <strong className="text-gray-200">10 business days</strong> of receiving valid legal
              process. If the request is deficient or needs clarification, GradeDate will notify
              the requesting agency within that window.
            </li>
            <li>
              <strong className="text-gray-200">Narrowing.</strong> GradeDate will not provide
              access to more data than is reasonably necessary to satisfy the request and may seek
              to narrow overbroad requests.
            </li>
          </ol>
          <p className="mt-4 leading-relaxed">
            <strong className="text-gray-200">User notice:</strong> Unless prohibited by law or by
            a valid court order, GradeDate will make reasonable efforts to notify affected users
            before disclosing their data. Gag orders and delayed-notice provisions will be honored
            where legally required.
          </p>
          <p className="mt-3 leading-relaxed">
            <strong className="text-gray-200">Non-U.S. requests:</strong> Requests from law
            enforcement outside the United States should be made through applicable international
            legal channels (such as a mutual legal assistance treaty or other lawful mechanism) and
            directed to{" "}
            <a href={mailto()} className="text-rose-400 underline hover:text-rose-300">
              legal@gradedate.app
            </a>{" "}
            for coordination.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">7. Data Retention and Legal Holds</h2>
          <p className="leading-relaxed">
            GradeDate&rsquo;s retention practices are described in our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">
              Privacy Policy
            </Link>
            . Key points relevant to law enforcement:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-6 leading-relaxed">
            <li>
              Account data is retained while the account is active and is deleted when the account
              is deleted (messages are hard-deleted immediately upon account deletion).
            </li>
            <li>
              Safety reports are retained for 12 months after resolution; privileged administrative
              audit records are retained for a minimum of 24 months; quarantined photo review cases
              are retained per our moderation retention schedule (default 30 days).
            </li>
            <li>
              If an account is subject to a pending legal request, GradeDate may retain data beyond
              normal retention windows until the request is resolved, as permitted by applicable
              law. Legal-hold evidence is never purged early.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold text-white">8. Contact Summary</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/5 bg-gray-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 font-semibold text-white">Purpose</th>
                  <th className="px-4 py-3 font-semibold text-white">Contact</th>
                  <th className="px-4 py-3 font-semibold text-white">Requirements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Standard legal requests</td>
                  <td className="px-4 py-3">
                    <a href={mailto()} className="text-rose-400 underline hover:text-rose-300">
                      legal@gradedate.app
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    Valid subpoena, court order, or warrant; agency + requester identification; user
                    identifier(s); specific data sought
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Preservation requests</td>
                  <td className="px-4 py-3">
                    <a
                      href={mailto("PRESERVATION REQUEST")}
                      className="text-rose-400 underline hover:text-rose-300"
                    >
                      legal@gradedate.app
                    </a>{" "}
                    (subject: PRESERVATION REQUEST)
                  </td>
                  <td className="px-4 py-3">
                    Agency identification; user identifier(s); scope; renewable 90-day holds
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Emergency requests</td>
                  <td className="px-4 py-3">
                    <a
                      href={mailto("EMERGENCY — ")}
                      className="text-rose-400 underline hover:text-rose-300"
                    >
                      legal@gradedate.app
                    </a>{" "}
                    (subject: EMERGENCY — ...)
                  </td>
                  <td className="px-4 py-3">
                    Description of imminent danger or child-safety concern; user identifier(s); data
                    needed
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
