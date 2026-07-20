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
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:0ms]" />
          <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:150ms]" />
          <div className="h-3 w-3 animate-bounce rounded-full bg-rose-500 [animation-delay:300ms]" />
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
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/5 bg-gray-900/60 p-12 text-center backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
            <svg
              className="h-8 w-8 text-gray-500"
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
          <Link
            to="/matches"
            className="mt-2 rounded-full border border-gray-600 px-6 py-2 text-sm text-gray-300 transition hover:border-gray-400 hover:text-white"
          >
            Keep swiping
          </Link>
        </div>
      )}

      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <Link
              key={conn.match_id}
              to="/chat/$matchId"
              params={{ matchId: String(conn.match_id) }}
              className="flex items-center gap-4 rounded-xl border border-white/5 bg-gray-900/60 p-4 transition hover:border-rose-500/30 hover:bg-gray-900/80 backdrop-blur-sm"
            >
              {/* Avatar */}
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-gray-800">
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
          ))}
        </div>
      )}
    </div>
  );
}
