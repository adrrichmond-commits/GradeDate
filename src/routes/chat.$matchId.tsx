import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "~/auth-context";
import { useRequireSubscription } from "~/subscription-guard";

interface ChatMessage {
  id: number;
  match_id: number;
  sender_id: number;
  content: string;
  read: number;
  created_at: string;
  sender_name: string | null;
  sender_photo: string | null;
}

interface MatchInfo {
  id: number;
  user1_id: number;
  user2_id: number;
  created_at: string;
}

interface OtherUser {
  id: number;
  display_name: string | null;
  photo_path: string | null;
}

export const Route = createFileRoute("/chat/$matchId")({
  component: ChatPage,
});

function ChatPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isSubscribed, checking } = useRequireSubscription();
  const { matchId: matchIdStr } = Route.useParams();
  const matchId = Number(matchIdStr);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${matchId}`);
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 403 || res.status === 404) {
          setError(data.error || "Cannot access this chat");
          return;
        }
        return;
      }
      const data = await res.json();
      setMessages(data.messages || []);
      setError("");
    } catch {
      // Silently fail on poll errors
    }
  }, [matchId]);

  const fetchMatchInfo = useCallback(async () => {
    try {
      // Fetch connections to get the other user's info
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        const conns = data.connections || [];
        const current = conns.find(
          (c: { match_id: number }) => c.match_id === matchId,
        );
        if (current) {
          setOtherUser({
            id: current.user_id,
            display_name: current.display_name,
            photo_path: current.photo_path,
          });
        }
      }
    } catch {
      // Silently fail
    }
  }, [matchId]);

  // Initial load
  useEffect(() => {
    if (!user || isNaN(matchId)) return;

    setInitialLoading(true);
    Promise.all([fetchMessages(), fetchMatchInfo()]).finally(() => {
      setInitialLoading(false);
    });

    // Poll every 3 seconds
    pollRef.current = setInterval(fetchMessages, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [user, matchId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newMsg.trim();
    if (!content || sending) return;

    setSending(true);
    setNewMsg("");

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, content }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send message");
        setNewMsg(content); // Restore input on failure
        return;
      }

      const data = await res.json();
      // Optimistically add the message
      setMessages((prev) => [...prev, data.message]);
      setError("");

      // Focus input after sending
      inputRef.current?.focus();
    } catch {
      setError("Network error. Try again.");
      setNewMsg(content);
    } finally {
      setSending(false);
    }
  };

  function formatTime(ts: string): string {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (loading || initialLoading || checking) {
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

  if (error && messages.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-12 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Link
            to="/connections"
            className="rounded-full border border-gray-600 px-6 py-2 text-sm text-gray-300 transition hover:border-gray-400 hover:text-white"
          >
            Back to connections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b border-white/5 bg-gray-950/80 px-4 py-3 backdrop-blur-md">
        <Link
          to="/connections"
          className="flex-shrink-0 rounded-full p-1 text-gray-400 transition hover:text-white"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>

        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-800">
          {otherUser?.photo_path ? (
            <img
              src={otherUser.photo_path}
              alt={otherUser.display_name || "User"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-600">
              <svg
                className="h-5 w-5"
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

        <div className="min-w-0">
          <h2 className="truncate font-semibold">
            {otherUser?.display_name || "Unknown"}
          </h2>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500">
              No messages yet. Say hello! 👋
            </p>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    isMe
                      ? "bg-rose-600 text-white rounded-br-md"
                      : "bg-gray-800 text-gray-100 rounded-bl-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`mt-1 text-right text-xs ${
                      isMe ? "text-rose-200" : "text-gray-500"
                    }`}
                  >
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Message input */}
      <form
        onSubmit={handleSend}
        className="border-t border-white/5 bg-gray-950/80 p-4 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Type a message..."
            maxLength={2000}
            className="flex-1 rounded-full border border-white/10 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-rose-500/50"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!newMsg.trim() || sending}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500 disabled:opacity-40"
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
