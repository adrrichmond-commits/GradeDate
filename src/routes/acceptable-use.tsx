import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/acceptable-use")({
  component: AcceptableUsePolicy,
});

function AcceptableUsePolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Acceptable Use Policy</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: August 9, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Introduction and Scope</h2>
          <p>
            This Acceptable Use Policy applies to everyone who uses GradeDate, including account
            holders, visitors, and anyone who accesses our Service. It forms part of our{" "}
            <Link to="/terms" className="text-rose-400 underline hover:text-rose-300">Terms of Service</Link>.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Identity and Eligibility</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>You must be 18 or older to use GradeDate.</li>
            <li>Your account must genuinely represent you. Fake accounts, impersonation, catfishing, and accounts created for someone else are not allowed.</li>
            <li>Photos must be of you. See our <Link to="/rules" className="text-rose-400 underline hover:text-rose-300">Photo &amp; Content Rules</Link> for details.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Photos and Content</h2>
          <p>Do not upload, post, or share content that includes:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Nudity, sexually explicit imagery, gore, or graphic violence.</li>
            <li>Hate symbols, slurs, discriminatory material, or content promoting violence.</li>
            <li>Stolen, deceptive, or misleading photos, including images of someone other than you.</li>
            <li>Anything that violates applicable law or another person’s rights.</li>
          </ul>
          <p className="mt-2">Our <Link to="/rules" className="text-rose-400 underline hover:text-rose-300">Photo &amp; Content Rules</Link> provide the full photo standards.</p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Conduct and Messaging</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>No harassment, bullying, stalking, threats, intimidation, or targeted abuse.</li>
            <li>No hate speech or discrimination based on protected or personal characteristics.</li>
            <li>Do not send unsolicited sexual or explicit messages, solicit minors, or promote violence.</li>
            <li>Do not doxx or share another person’s private information without their consent.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Spam, Scams, and Fraud</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>No spam, phishing, scams, financial fraud, romance-scam behavior, or fake incentives.</li>
            <li>Do not attempt to extract money from another user or buy and sell accounts or likes.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Platform and System Abuse</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>No scraping, crawling, unauthorized data extraction, reverse-engineering, or tampering with the grading algorithm.</li>
            <li>Do not create multiple accounts to evade a suspension or ban, abuse referrals or the free tier, or circumvent safety and moderation controls.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Minors and Underage Content</h2>
          <p>
            GradeDate is strictly for adults 18 and older. Minors and underage content are strictly prohibited. Reports involving an underage user or underage content receive the highest priority: affected content is immediately hidden and the account is locked pending review.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Reporting</h2>
          <p>
            Use the <strong className="text-white">Report</strong> button on profiles, match cards, or chat screens. You can also contact{" "}
            <a href="mailto:support@gradedate.app" className="text-rose-400 underline hover:text-rose-300">support@gradedate.app</a>. Include enough detail for us to review the concern, but do not share unnecessary sensitive information.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Enforcement</h2>
          <p>
            We may remove content, place flagged photos in private, short-lived quarantine storage for review, temporarily suspend an account, or permanently ban it. Confirmed violations result in content removal. We review reports carefully and take action at our discretion based on the circumstances; we do not promise real-time review. Repeat abuse may lead to harsher action.
          </p>
          <p className="mt-2">
            You may submit one appeal within 14 days of a suspension. Premium remains active during a suspension unless we make an explicit refund or cancellation decision.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Changes</h2>
          <p>
            We may update this Policy from time to time. Continued use of GradeDate after changes take effect means you accept the updated Policy. For information about personal data, see our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">Privacy Policy</Link>.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-white/5 pt-6">
        <Link to="/" className="text-sm text-rose-400 transition hover:text-rose-300">← Back to GradeDate</Link>
      </div>
    </div>
  );
}
