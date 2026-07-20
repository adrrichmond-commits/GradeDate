import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Terms of Service
        </h1>
        <p className="text-gray-400">
          Last updated: July 20, 2026
        </p>
      </div>

      {/* Content */}
      <div className="space-y-10 text-gray-300">
        {/* Introduction */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">1. Acceptance of Terms</h2>
          <p className="leading-relaxed">
            By accessing or using GradeDate (&ldquo;the Service&rdquo;), you agree to be bound by
            these Terms of Service. If you do not agree, do not use the Service. These Terms
            constitute a legally binding agreement between you and GradeDate.
          </p>
        </section>

        {/* Eligibility */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">2. Eligibility</h2>
          <p className="leading-relaxed">
            You must be at least <strong className="text-white">18 years of age</strong> to use
            GradeDate. By creating an account, you represent and warrant that you are 18 or older.
            GradeDate reserves the right to request proof of age and to suspend or terminate
            accounts that violate this requirement.
          </p>
        </section>

        {/* Account & Photos */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">3. Account and Photos</h2>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              All photos you upload must be <strong className="text-white">of you
              yourself</strong>. You may not upload photos of other people, celebrities, AI-generated
              images, or any image that does not depict your actual face.
            </li>
            <li>
              Impersonation, fake identities, and catfishing are strictly prohibited. Accounts
              found to be impersonating others will be immediately suspended.
            </li>
            <li>
              You are responsible for maintaining the confidentiality of your account credentials.
            </li>
          </ul>
        </section>

        {/* Photo Analysis License */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">4. Photo Analysis License</h2>
          <p className="leading-relaxed">
            By uploading a photo to GradeDate, you grant GradeDate a limited, non-exclusive,
            worldwide, royalty-free license to process and analyze that photo for the purpose of
            generating your facial appearance grade. This license is strictly limited to the
            grading functionality and is revoked when your account is deleted.
          </p>
          <p className="mt-3 leading-relaxed">
            GradeDate uses third-party AI services (including OpenAI GPT-4 Vision) to perform
            facial analysis. By uploading a photo, you consent to your photo being transmitted
            to these third-party processors solely for grading purposes. See our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </section>

        {/* User Conduct */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">5. User Conduct</h2>
          <p className="leading-relaxed">You agree not to:</p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>Harass, abuse, stalk, threaten, or intimidate other users.</li>
            <li>Post or share hate speech, discriminatory content, or any illegal material.</li>
            <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
            <li>
              Attempt to reverse-engineer, decompile, or tamper with the grading algorithm.
            </li>
            <li>
              Scrape, crawl, or otherwise extract data from the Service without permission.
            </li>
            <li>
              Create multiple accounts or attempt to circumvent any suspension or ban.
            </li>
          </ul>
        </section>

        {/* Account Suspension */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">6. Account Suspension and Termination</h2>
          <p className="leading-relaxed">
            GradeDate reserves the right to suspend or terminate your account at any time, with
            or without notice, for any violation of these Terms. Grounds for suspension include
            but are not limited to: uploading fake or inappropriate photos, harassing other users,
            hate speech, illegal activity, or attempting to manipulate the grading system.
          </p>
          <p className="mt-3 leading-relaxed">
            If your account is suspended for a Terms violation, you are not entitled to a refund
            for any remaining subscription period. If your account is terminated for reasons other
            than a Terms violation, you may be entitled to a pro-rata refund for unused subscription
            time at GradeDate&rsquo;s discretion.
          </p>
        </section>

        {/* Subscription & Payment */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">7. Subscription and Payment</h2>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              GradeDate costs{" "}
              <strong className="text-white">$5.99 per month</strong>. A paid subscription is
              required to access the Service.
            </li>
            <li>
              Payments are processed securely through{" "}
              <strong className="text-white">Stripe</strong>. GradeDate does not store your
              payment card details.
            </li>
            <li>
              Your subscription renews automatically each month until cancelled. You may{" "}
              <strong className="text-white">cancel anytime</strong> via your account settings or
              by managing your subscription through Stripe&rsquo;s customer portal. Cancellation
              takes effect at the end of the current billing period.
            </li>
            <li>
              All fees are in USD and are non-refundable except as required by applicable law
              or as expressly stated in these Terms.
            </li>
          </ul>
        </section>

        {/* No Guarantees */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">8. No Guarantees</h2>
          <p className="leading-relaxed">
            GradeDate does <strong className="text-white">not guarantee</strong> match quality,
            dating outcomes, compatibility, relationship success, or any specific result from
            using the Service. The grading system is an AI-assisted estimate of facial appearance
            and is subjective by nature. Grades may vary and should not be interpreted as an
            objective or definitive assessment of attractiveness.
          </p>
        </section>

        {/* Disclaimer */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">9. Disclaimer of Warranties</h2>
          <p className="leading-relaxed">
            The Service is provided on an{" "}
            <strong className="text-white">&ldquo;as is&rdquo;</strong> and{" "}
            <strong className="text-white">&ldquo;as available&rdquo;</strong> basis, without
            warranties of any kind, either express or implied. GradeDate disclaims all warranties,
            including but not limited to implied warranties of merchantability, fitness for a
            particular purpose, and non-infringement.
          </p>
          <p className="mt-3 leading-relaxed">
            GradeDate does not warrant that the Service will be uninterrupted, error-free, secure,
            or free from viruses or other harmful components. You use the Service at your own risk.
          </p>
        </section>

        {/* Limitation of Liability */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">10. Limitation of Liability</h2>
          <p className="leading-relaxed">
            To the fullest extent permitted by law, GradeDate and its affiliates shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages,
            including loss of profits, data, or goodwill, arising from your use of the Service,
            even if GradeDate has been advised of the possibility of such damages.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">11. Changes to Terms</h2>
          <p className="leading-relaxed">
            GradeDate reserves the right to modify these Terms at any time. We will notify users
            of material changes via email or through the Service. Continued use of the Service
            after changes take effect constitutes acceptance of the revised Terms.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">12. Contact</h2>
          <p className="leading-relaxed">
            For questions about these Terms, contact us at{" "}
            <a
              href="mailto:support@gradedate.app"
              className="text-rose-400 underline hover:text-rose-300"
            >
              support@gradedate.app
            </a>
            .
          </p>
        </section>
      </div>

      {/* Back link */}
      <div className="mt-16 border-t border-white/5 pt-8 text-center">
        <Link
          to="/"
          className="text-sm text-gray-400 underline transition hover:text-gray-300"
        >
          ← Back to GradeDate
        </Link>
      </div>
    </div>
  );
}
