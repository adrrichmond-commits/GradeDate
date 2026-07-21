import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  component: RefundPolicy,
});

function RefundPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Refund Policy
        </h1>
        <p className="text-gray-400">
          Last updated: July 20, 2026
        </p>
      </div>

      {/* Content */}
      <div className="space-y-10 text-gray-300">
        {/* Eligibility */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">1. Refund Eligibility</h2>
          <p className="leading-relaxed">
            We want you to be satisfied with GradeDate. If you are unhappy with the Service,
            you may request a refund within{" "}
            <strong className="text-white">48 hours of your payment</strong>. Refund requests
            submitted after 48 hours will not be honored.
          </p>
        </section>

        {/* Grading Restriction */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">2. Grading Restriction</h2>
          <p className="leading-relaxed">
            <strong className="text-white">No refunds will be issued if you have already
            received your facial appearance grade.</strong> Once your selfie has been analyzed
            and a grade has been returned, the core service has been delivered and refund
            eligibility ends, even if the request falls within the 48-hour window.
          </p>
        </section>

        {/* Cancellation */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">3. Cancellation</h2>
          <p className="leading-relaxed">
            You may <strong className="text-white">cancel your subscription at any time</strong>{" "}
            through your account settings or via Stripe&rsquo;s customer portal. Cancellation
            takes effect at the end of your current billing period — you will retain access to
            the Service until the period you have paid for expires. Cancellation does not
            trigger a refund for the current billing period.
          </p>
        </section>

        {/* How to Request */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">4. How to Request a Refund</h2>
          <p className="leading-relaxed">
            To request a refund, email us at{" "}
            <a
              href="mailto:support@gradedate.app"
              className="text-rose-400 underline hover:text-rose-300"
            >
              support@gradedate.app
            </a>{" "}
            with the subject line &ldquo;Refund Request&rdquo; and include the email address
            associated with your account. We will review your request and respond within 5
            business days.
          </p>
        </section>

        {/* Abuse */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">5. Abuse and Fraud</h2>
          <p className="leading-relaxed">
            GradeDate reserves the right to deny refund requests that appear abusive,
            fraudulent, or otherwise in bad faith. This includes, but is not limited to,
            repeated refund requests across multiple accounts, chargeback abuse, or attempts
            to obtain refunds after receiving a grade and using the Service extensively.
          </p>
        </section>

        {/* Chargebacks */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">6. Chargebacks</h2>
          <p className="leading-relaxed">
            If you initiate a chargeback with your bank or card issuer rather than requesting a
            refund through GradeDate, we reserve the right to suspend your account pending
            resolution. Fraudulent chargebacks may result in a permanent ban from the Service.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">7. Questions</h2>
          <p className="leading-relaxed">
            If you have questions about this Refund Policy, contact us at{" "}
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
