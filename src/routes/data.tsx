import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data")({
  component: DataExport,
});

function DataExport() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Data Export & Your Rights</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 20, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Your Data Rights</h2>
          <p>
            Depending on your jurisdiction, you may have the following rights regarding
            your personal data:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong className="text-white">Access:</strong> Request a copy of all personal data we hold about you.</li>
            <li><strong className="text-white">Rectification:</strong> Correct inaccurate or incomplete data (you can do this yourself on your Profile page).</li>
            <li><strong className="text-white">Erasure:</strong> Delete your account and all associated data via the Delete Account option on your Profile page.</li>
            <li><strong className="text-white">Portability:</strong> Receive your data in a structured, machine-readable format.</li>
            <li><strong className="text-white">Objection:</strong> Object to certain processing of your data where applicable.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">How to Request Your Data</h2>
          <p>
            To request a copy of your personal data, email us at{" "}
            <a href="mailto:support@gradedate.app" className="text-rose-400 underline hover:text-rose-300">
              support@gradedate.app
            </a>{" "}
            with the subject "Data Export Request." We will verify your identity and
            provide your data within 30 days in JSON format. Your data export will include:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Account details (email, display name, age, gender, looking_for preference)</li>
            <li>Your facial grade</li>
            <li>Your profile photo path</li>
            <li>Your message history</li>
            <li>Subscription status</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">GDPR (EU/EEA Users)</h2>
          <p>
            If you are located in the European Union or European Economic Area, you have
            additional rights under the General Data Protection Regulation (GDPR). These
            include the right to lodge a complaint with your local data protection authority.
            GradeDate processes personal data on the legal basis of contractual necessity
            (to provide the Service you requested) and legitimate interest (to improve and
            secure the Service).
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">CCPA (California Users)</h2>
          <p>
            If you are a California resident, you have rights under the California Consumer
            Privacy Act, including the right to know what personal information is collected,
            the right to delete personal information, and the right to opt out of the sale
            of personal information. GradeDate does not sell personal information.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Contact</h2>
          <p>
            For any privacy or data rights questions, contact{" "}
            <a href="mailto:support@gradedate.app" className="text-rose-400 underline hover:text-rose-300">
              support@gradedate.app
            </a>.
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
