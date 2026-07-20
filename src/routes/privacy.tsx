import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="text-gray-400">
          Last updated: July 20, 2026
        </p>
      </div>

      {/* Content */}
      <div className="space-y-10 text-gray-300">
        {/* Introduction */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">1. Introduction</h2>
          <p className="leading-relaxed">
            GradeDate (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to
            protecting your privacy. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your personal data when you use the GradeDate service (&ldquo;the
            Service&rdquo;). By using the Service, you consent to the practices described in
            this policy.
          </p>
        </section>

        {/* Data We Collect */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">2. Data We Collect</h2>
          <p className="leading-relaxed">
            We collect the following categories of personal data:
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/5 bg-gray-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 font-semibold text-white">Category</th>
                  <th className="px-4 py-3 font-semibold text-white">Examples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Account Data</td>
                  <td className="px-4 py-3">Email address, hashed password</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Profile Data</td>
                  <td className="px-4 py-3">
                    Display name, age, gender, looking-for preference, bio
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Photo Data</td>
                  <td className="px-4 py-3">Profile photos (selfies uploaded by you)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Grading Data</td>
                  <td className="px-4 py-3">
                    Facial appearance grade (1&ndash;10), AI analysis results
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Messaging Data</td>
                  <td className="px-4 py-3">
                    Messages sent between matched users, match records
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Payment Data</td>
                  <td className="px-4 py-3">
                    Subscription status (active/cancelled). Full payment card details are
                    processed by Stripe and{" "}
                    <strong className="text-white">never stored</strong> on our servers.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-gray-200">Technical Data</td>
                  <td className="px-4 py-3">
                    Session cookies for authentication, IP address (server logs)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* How We Use Data */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">3. How We Use Your Data</h2>
          <p className="leading-relaxed">
            We use your personal data exclusively for the following purposes:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              <strong className="text-white">Matching:</strong> Your grade, gender, age, and
              looking-for preferences are used to connect you with compatible users at your
              grade level.
            </li>
            <li>
              <strong className="text-white">Grading:</strong> Your profile photo is analyzed
              by AI to generate your facial appearance grade.
            </li>
            <li>
              <strong className="text-white">Service delivery:</strong> Your email is used for
              account-related communications (password resets, subscription updates). Your
              display name, age, and bio are shown on your profile to other users.
            </li>
            <li>
              <strong className="text-white">Authentication:</strong> Session cookies maintain
              your login state as you navigate the Service.
            </li>
          </ul>
        </section>

        {/* Third-Party Processing */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">4. Third-Party Data Processing</h2>
          <p className="leading-relaxed">
            We use the following third-party services to operate GradeDate:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              <strong className="text-white">OpenAI (GPT-4 Vision):</strong> When you upload a
              selfie, your photo is transmitted to OpenAI&rsquo;s API for facial analysis and
              grading. OpenAI processes the image solely to return a grade to us and does not
              use your photo to train their models. See{" "}
              <a
                href="https://openai.com/policies/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-400 underline hover:text-rose-300"
              >
                OpenAI&rsquo;s Privacy Policy
              </a>{" "}
              for more information.
            </li>
            <li>
              <strong className="text-white">Neon (Postgres Database):</strong> Your account
              data, profile data, grades, messages, and subscription status are stored in a
              Neon-managed Postgres database. Data is encrypted in transit and at rest.
            </li>
            <li>
              <strong className="text-white">Vercel:</strong> The GradeDate application is
              hosted on Vercel. Vercel may process server logs and technical data for
              operational purposes.
            </li>
            <li>
              <strong className="text-white">Stripe:</strong> Payment processing is handled by
              Stripe. Stripe collects and processes your payment card information directly;
              GradeDate never receives or stores your full card details. See{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-400 underline hover:text-rose-300"
              >
                Stripe&rsquo;s Privacy Policy
              </a>
              .
            </li>
          </ul>
        </section>

        {/* Data Retention & Deletion */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">5. Data Retention and Account Deletion</h2>
          <p className="leading-relaxed">
            We retain your personal data for as long as your account is active. You may request
            account deletion at any time by contacting us at{" "}
            <a
              href="mailto:support@gradedate.app"
              className="text-rose-400 underline hover:text-rose-300"
            >
              support@gradedate.app
            </a>
            . Upon account deletion:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>All personal data (email, display name, age, gender, bio, photos, grade, messages, and match records) is permanently deleted from our database.</li>
            <li>Your photos are deleted from our storage.</li>
            <li>Deletion is completed within 30 days of your request.</li>
          </ul>
        </section>

        {/* Data Selling */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">6. Data Sharing and Selling</h2>
          <p className="leading-relaxed">
            <strong className="text-white">We do not sell your personal data</strong> to third
            parties. We do not share your data with advertisers, data brokers, or any other
            commercial entities. The only third parties that process your data are the service
            providers listed in Section 4, and they process data solely on our behalf to deliver
            the Service.
          </p>
        </section>

        {/* Cookies */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">7. Cookies</h2>
          <p className="leading-relaxed">
            GradeDate uses <strong className="text-white">session cookies only</strong> for
            authentication purposes. These cookies are essential to keep you logged in as you
            navigate the Service and are set when you log in. They are not used for tracking,
            advertising, or analytics. No third-party cookies are set by GradeDate. You can
            configure your browser to reject cookies, but this will prevent you from staying
            logged in.
          </p>
        </section>

        {/* Security */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">8. Data Security</h2>
          <p className="leading-relaxed">
            We implement reasonable technical and organizational measures to protect your
            personal data, including encryption in transit (HTTPS/TLS), hashed password storage
            (bcrypt), and database encryption at rest. However, no method of electronic storage
            or transmission is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        {/* Children */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">9. Children&rsquo;s Privacy</h2>
          <p className="leading-relaxed">
            GradeDate is not intended for anyone under the age of 18. We do not knowingly
            collect personal data from minors. If we learn that we have collected data from
            someone under 18, we will delete it promptly.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">10. Changes to This Policy</h2>
          <p className="leading-relaxed">
            We may update this Privacy Policy from time to time. Material changes will be
            communicated via email or through a notice on the Service. The &ldquo;Last
            updated&rdquo; date at the top of this page reflects the most recent revision.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">11. Contact</h2>
          <p className="leading-relaxed">
            If you have questions about this Privacy Policy or wish to exercise your data
            rights, contact us at{" "}
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
