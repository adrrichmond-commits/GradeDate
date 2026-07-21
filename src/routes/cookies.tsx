import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/cookies")({
  component: CookiePolicy,
});

function CookiePolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Cookie Policy
        </h1>
        <p className="text-gray-400">
          Last updated: July 20, 2026
        </p>
      </div>

      {/* Content */}
      <div className="space-y-10 text-gray-300">
        {/* Introduction */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">1. What Are Cookies?</h2>
          <p className="leading-relaxed">
            Cookies are small text files that websites store on your device when you visit
            them. They are widely used to make websites work efficiently and to provide
            information to the site owners. Cookies may be &ldquo;session&rdquo; cookies
            (deleted when you close your browser) or &ldquo;persistent&rdquo; cookies (remain
            until they expire or you delete them).
          </p>
        </section>

        {/* Our Cookie Usage */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">2. How GradeDate Uses Cookies</h2>
          <p className="leading-relaxed">
            GradeDate uses <strong className="text-white">only essential session cookies</strong>{" "}
            for authentication purposes. When you log in, we set a single session cookie that
            keeps you logged in as you navigate the Service. This cookie is:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              <strong className="text-white">Essential:</strong> Required for the Service to
              function properly. Without it, you would be logged out after every page change.
            </li>
            <li>
              <strong className="text-white">HttpOnly:</strong> Not accessible to JavaScript,
              which helps protect against cross-site scripting attacks.
            </li>
            <li>
              <strong className="text-white">Session-based:</strong> Set to expire after 7 days
              of inactivity, or when you log out.
            </li>
          </ul>
        </section>

        {/* What We Don't Use */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">3. What We Do NOT Use</h2>
          <p className="leading-relaxed">
            GradeDate does <strong className="text-white">not</strong> use:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              <strong className="text-white">Tracking cookies:</strong> We do not track your
              browsing activity across sites or sessions.
            </li>
            <li>
              <strong className="text-white">Advertising cookies:</strong> We do not serve ads
              or use cookies for ad targeting.
            </li>
            <li>
              <strong className="text-white">Third-party cookies:</strong> All cookies set by
              GradeDate are first-party. No third-party services set cookies through our site.
            </li>
            <li>
              <strong className="text-white">Analytics cookies:</strong> We do not use Google
              Analytics, Facebook Pixel, or similar tracking services.
            </li>
          </ul>
        </section>

        {/* Cookie Consent Banner */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">4. Cookie Consent Banner</h2>
          <p className="leading-relaxed">
            On your first visit to GradeDate, you will see a cookie consent banner at the
            bottom of the page. This banner informs you that GradeDate uses session cookies
            for authentication and links to this Cookie Policy and our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">
              Privacy Policy
            </Link>
            . By clicking &ldquo;Got it&rdquo; or continuing to use the Service, you consent
            to our use of essential session cookies.
          </p>
          <p className="mt-3 leading-relaxed">
            Because our cookies are strictly necessary for the Service to function, they fall
            under the &ldquo;strictly necessary&rdquo; exemption in most privacy regulations
            (including GDPR and ePrivacy Directive). This means consent is not legally required
            for these cookies, but we provide the banner for transparency.
          </p>
        </section>

        {/* Disabling Cookies */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">5. How to Disable Cookies</h2>
          <p className="leading-relaxed">
            Most web browsers allow you to manage or disable cookies through their settings.
            Here are links to instructions for common browsers:
          </p>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>
              <strong className="text-white">Chrome:</strong> Settings → Privacy and security →
              Cookies and other site data
            </li>
            <li>
              <strong className="text-white">Firefox:</strong> Preferences → Privacy &amp;
              Security → Cookies and Site Data
            </li>
            <li>
              <strong className="text-white">Safari:</strong> Preferences → Privacy → Cookies
              and website data
            </li>
            <li>
              <strong className="text-white">Edge:</strong> Settings → Cookies and site
              permissions → Manage and delete cookies and site data
            </li>
          </ul>
          <p className="mt-3 leading-relaxed">
            Please note that disabling cookies will prevent you from staying logged in to
            GradeDate, as our session cookie is essential for authentication. The Service
            will not function properly without cookies enabled.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">6. Changes to This Cookie Policy</h2>
          <p className="leading-relaxed">
            We may update this Cookie Policy from time to time to reflect changes in our
            practices or for operational, legal, or regulatory reasons. The &ldquo;Last
            updated&rdquo; date at the top of this page reflects the most recent revision.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-white">7. Contact</h2>
          <p className="leading-relaxed">
            If you have questions about this Cookie Policy, please contact us at{" "}
            <a
              href="mailto:support@gradedate.app"
              className="text-rose-400 underline hover:text-rose-300"
            >
              support@gradedate.app
            </a>
            . You can also review our{" "}
            <Link to="/privacy" className="text-rose-400 underline hover:text-rose-300">
              Privacy Policy
            </Link>{" "}
            for more information about how we handle your data.
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
