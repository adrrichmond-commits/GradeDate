import { createFileRoute, Link } from "@tanstack/react-router";
import { staticPageHead } from "~/route-heads";

export const Route = createFileRoute("/acceptable-use")({
  component: AcceptableUsePolicy,
  head: () => staticPageHead("GradeDate — Acceptable Use Policy", "What's allowed on GradeDate: identity, photos, conduct, and the rules that keep the app safe."),
});

function AcceptableUsePolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Acceptable Use Policy</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: August 10, 2026</p>

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
          <h2 className="mb-3 text-xl font-semibold text-white">Minors and Child Safety</h2>
          <p>
            GradeDate is strictly for adults 18 and older. Anyone under 18 may not use the Service; underage access is prohibited.
          </p>
          <p className="mt-2">
            We have zero tolerance for child sexual abuse material (CSAM), the solicitation of minors, or any content depicting or involving minors in a sexualized or exploitative way.
          </p>
          <p className="mt-2">
            Where we become aware of apparent CSAM or the solicitation of a minor, we immediately hide the affected content, lock the account pending review, preserve the evidence, and report it to the National Center for Missing &amp; Exploited Children (NCMEC) and/or the appropriate law enforcement authorities, as required by applicable law (e.g., 18 U.S.C. § 2258A in the United States).
          </p>
          <p className="mt-2">
            Underage reports receive the highest priority: affected content is immediately hidden and the account is locked pending review.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Human Trafficking and Exploitation</h2>
          <p>
            We have zero tolerance for human trafficking, sex trafficking, forced labor, or any form of exploitation.
          </p>
          <p className="mt-2">
            Any user found to be using GradeDate to facilitate trafficking, exploitation, or modern slavery will have their account permanently removed and the matter reported to law enforcement.
          </p>
          <p className="mt-2">
            If you or someone you know may be a victim of human trafficking, contact the National Human Trafficking Hotline at 1-888-373-7888 (US), text &quot;HELP&quot; to 233733, or visit humantraffickinghotline.org; if you are outside the US, contact your local emergency services or national hotline.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Reporting</h2>
          <p>
            Use the <strong className="text-white">Report</strong> button on profiles, match cards, or chat screens. You can also contact{" "}
            <Link to="/contact" className="text-rose-400 underline hover:text-rose-300">contact us</Link>. Include enough detail for us to review the concern, but do not share unnecessary sensitive information.
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
