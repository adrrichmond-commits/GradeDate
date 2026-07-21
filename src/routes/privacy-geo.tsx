import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy-geo")({
  component: GeoPrivacy,
});

function GeoPrivacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Geolocation Privacy</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: July 20, 2026</p>

      <div className="space-y-8 text-gray-300">
        <section>
          <p>
            GradeDate does <strong className="text-white">not</strong> collect, store, or
            track your precise geolocation. We do not use GPS, IP-based geolocation, or any
            other location services. GradeDate is a looks-compatibility matching platform and
            does not filter or sort matches by geographic proximity.
          </p>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">What We Don't Do</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>We do not ask for location permissions in your browser</li>
            <li>We do not store your IP address for location purposes</li>
            <li>We do not display your city, state, or country on your profile</li>
            <li>We do not filter matches by distance</li>
          </ul>
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
