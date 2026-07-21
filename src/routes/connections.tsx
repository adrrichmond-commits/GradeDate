import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription, SubscriptionBanner } from "~/subscription-guard";

interface Connection {
  match_id: number;
  user_id: number;
  display_name: string | null;
  photo_path: string | null;
  last_message: string | null;
  last_message_at: string | null;
  match_created_at: string;
}

const REPORT_REASONS = [
  { value: "inappropriate_photo", label: "Inappropriate Photo" },
  { value: "harassment", label: "Harassment" },
  { value: "underage", label: "Underage User" },
  { value: "fake_profile", label: "Fake Profile" },
  { value: "other", label: "Other" },
];

export const Route = createFileRoute("/connections")({
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isSubscribed, checking } = useRequireSubscription();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  // Safety modals
  const [menuConn, setMenuConn] = useState<Connection | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user]);

  const fetchConnections = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const res = await fetch("/api/connections");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load connections");
        return;
      }
      setConnections(data.connections || []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user && isSubscribed) {
      fetchConnections();
    }
  }, [user, isSubscribed]);

  function formatTime(ts: string | null): string {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  }

  if (loading || checking || fetching) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Loading connections...</p>
        </div>
      </div>
    );
  }

  if (!user || !isSubscribed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <SubscriptionBanner />
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Connections</h1>
        <p className="mt-2 text-gray-400">
          Your mutual matches — start chatting!
        </p>
        {/* Upsell: See Who Liked You */}
        <Link
          to="/store"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          See Who Liked You — $0.99
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {error}
          <button
            onClick={fetchConnections}
            className="mt-2 block w-full text-center text-xs underline"
          >
            Try again
          </button>
        </div>
      )}

      {!error && connections.length === 0 && (
        <div className="flex flex-col items-center gap-4 card p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
            <svg
              className="h-8 w-8 text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">No mutual matches yet</h3>
          <p className="text-sm text-gray-500 max-w-xs">
            Keep swiping! When someone you like also likes you back, you'll appear here.
          </p>
          <Link to="/matches" className="btn-secondary">
            Keep swiping
          </Link>
        </div>
      )}

      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.match_id} className="card-hover relative flex items-center gap-4 p-4">
              {/* Avatar + Info (clickable link to chat) */}
              <Link
                to="/chat/$matchId"
                params={{ matchId: String(conn.match_id) }}
                className="flex flex-1 items-center gap-4 min-w-0"
              >
                {/* Avatar */}
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-gray-800 ring-2 ring-rose-500/10 ring-offset-2 ring-offset-gray-950">
                  {conn.photo_path ? (
                    <img
                      src={conn.photo_path}
                      alt={conn.display_name || "User"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-600">
                      <svg
                        className="h-7 w-7"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-semibold">
                      {conn.display_name || "Anonymous"}
                    </h3>
                    {conn.last_message_at && (
                      <span className="flex-shrink-0 text-xs text-gray-500">
                        {formatTime(conn.last_message_at)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-400">
                    {conn.last_message || "Say hello! 👋"}
                  </p>
                </div>

                {/* Arrow */}
                <svg
                  className="h-5 w-5 flex-shrink-0 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>

              {/* Menu Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setMenuConn(menuConn?.user_id === conn.user_id ? null : conn);
                }}
                className="flex-shrink-0 rounded-full p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {menuConn?.user_id === conn.user_id && (
                <div className="absolute right-4 top-14 z-20 w-44 rounded-xl border border-gray-700 bg-gray-900 py-1.5 shadow-2xl">
                  <button
                    onClick={async () => {
                      setBlocking(true);
                      try {
                        await fetch("/api/users/block", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ user_id: conn.user_id }),
                        });
                        setConnections((prev) => prev.filter((c) => c.user_id !== conn.user_id));
                      } catch { /* ignore */ }
                      setBlocking(false);
                      setMenuConn(null);
                    }}
                    disabled={blocking}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    {blocking ? "Blocking..." : "Block User"}
                  </button>
                  <button
                    onClick={() => {
                      setShowReportModal(true);
                      setReportReason("");
                      setReportDone(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-400 transition hover:bg-amber-500/10"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    Report User
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && menuConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Report {menuConn.display_name || "User"}</h3>
            <p className="mt-1 text-sm text-gray-400">
              {reportDone
                ? "Thank you. Your report has been submitted."
                : "Why are you reporting this user?"}
            </p>

            {!reportDone && (
              <>
                <div className="mt-4 space-y-2">
                  {REPORT_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                        reportReason === r.value
                          ? "border-rose-500/50 bg-rose-500/10 text-white"
                          : "border-gray-700 text-gray-300 hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={r.value}
                        checked={reportReason === r.value}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="accent-rose-500"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => {
                      setShowReportModal(false);
                      setMenuConn(null);
                    }}
                    className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!reportReason || !menuConn) return;
                      setReporting(true);
                      try {
                        await fetch("/api/users/report", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ user_id: menuConn.user_id, reason: reportReason }),
                        });
                        setReportDone(true);
                      } catch {
                        // ignore
                      } finally {
                        setReporting(false);
                      }
                    }}
                    disabled={!reportReason || reporting}
                    className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {reporting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </>
            )}

            {reportDone && (
              <div className="mt-5">
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setMenuConn(null);
                    setReportDone(false);
                  }}
                  className="w-full rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
