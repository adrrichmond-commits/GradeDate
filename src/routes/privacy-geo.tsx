import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy-geo")({
  component: GeoPrivacy,
});

function GeoPrivacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Geolocation Privacy</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 22, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">What Location Data We Collect</h2>
          <p>
            GradeDate collects your <strong className="text-white">approximate location</strong> based on
            the ZIP code you provide during profile setup. From your ZIP code, we derive your
            city, state, and approximate geographic coordinates (latitude and longitude).
            This data is stored on your profile to enable location-based matching.
          </p>
          <p className="mt-3">
            We may determine your approximate city from your IP address when you visit our
            landing page. This helps us show you relevant options (e.g., whether our service
            is available in your area). This data is processed by ip-api.com and is not stored.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">How We Use Location Data</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong className="text-white">Match filtering:</strong> We use your approximate
              coordinates to filter potential matches by geographic distance, within the
              radius you choose (1–250 miles). This helps connect you with people nearby.
            </li>
            <li>
              <strong className="text-white">Distance display:</strong> We calculate the approximate
              distance between you and potential matches and display it in kilometers.
            </li>
            <li>
              <strong className="text-white">City/state display:</strong> Your city and state
              (derived from your ZIP code) may be shown on your profile to help matches
              understand your general location.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">What We Don't Do</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>We do <strong className="text-white">not</strong> use GPS or real-time location tracking</li>
            <li>We do <strong className="text-white">not</strong> ask for browser location permissions</li>
            <li>We do <strong className="text-white">not</strong> display your precise coordinates or street address</li>
            <li>We do <strong className="text-white">not</strong> share your location data with third parties</li>
            <li>You can update or clear your location at any time from your profile settings</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Your Control</h2>
          <p>
            Location data is entirely optional. You can choose not to provide a ZIP code —
            in that case, your matches will not be filtered by distance. You can also change
            your maximum distance preference at any time to widen or narrow your match pool.
            Your privacy is important to us, and we only collect the minimum location data
            needed to power location-aware matching.
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
