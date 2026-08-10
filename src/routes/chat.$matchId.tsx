import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback, useReducer } from "react";
import { useModalAccessibility } from "~/modal-accessibility";
import {
  initialUnmatchState,
  unmatchReducer,
  unmatchFailureMessage,
} from "~/unmatch-flow";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";
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

interface OtherUser {
  id: number;
  display_name: string | null;
  photo_path: string | null;
}

const REPORT_REASONS = [
  { value: "inappropriate_photo", label: "Inappropriate Photo" },
  { value: "harassment", label: "Harassment" },
  { value: "underage", label: "Underage User" },
  { value: "fake_profile", label: "Fake Profile" },
  { value: "other", label: "Other" },
];

// Reasons a user can pick when reporting a specific message. Values are the
// shared REPORT_REASONS vocabulary (inappropriate_photo = "Inappropriate").
const MESSAGE_REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "underage", label: "Underage" },
  { value: "spam", label: "Spam" },
  { value: "fake_profile", label: "Fake Profile" },
  { value: "inappropriate_photo", label: "Inappropriate" },
  { value: "other", label: "Other" },
];

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

  // Safety modals
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const closeReport = useCallback(() => setShowReportModal(false), []);
  const reportCancelRef = useRef<HTMLButtonElement>(null);
  const reportA11y = useModalAccessibility<HTMLDivElement>(showReportModal, closeReport, reportCancelRef);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  // Per-message report flow — you can report another participant's messages.
  const [msgReportTarget, setMsgReportTarget] = useState<ChatMessage | null>(null);
  const closeMsgReport = useCallback(() => setMsgReportTarget(null), []);
  const msgReportCancelRef = useRef<HTMLButtonElement>(null);
  const msgReportA11y = useModalAccessibility<HTMLDivElement>(msgReportTarget !== null, closeMsgReport, msgReportCancelRef);
  const [msgReportReason, setMsgReportReason] = useState("");
  const [msgReporting, setMsgReporting] = useState(false);
  const [msgReportState, setMsgReportState] = useState<"pick" | "done" | "error">("pick");
  const [msgReportError, setMsgReportError] = useState("");
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<number>>(new Set());
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Unmatch confirmation flow — unmatch is permanent (match + chat history),
  // so it always goes through an explicit confirmation dialog first. The
  // dialog is the undo path: cancel before the request and nothing is deleted.
  const [unmatch, dispatchUnmatch] = useReducer(unmatchReducer, initialUnmatchState);
  const keepMatchRef = useRef<HTMLButtonElement>(null);
  const unmatchOpen = unmatch.phase === "confirming" || unmatch.phase === "failed";
  const closeUnmatch = useCallback(() => dispatchUnmatch({ type: "CANCEL" }), []);
  const unmatchA11y = useModalAccessibility<HTMLDivElement>(unmatchOpen, closeUnmatch, keepMatchRef);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    }
  }, [matchId]);

  const fetchMatchInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        const conns = data.connections || [];
        const current = conns.find(
          (c: any) => c.match_id === matchId,
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
    }
  }, [matchId]);

  useEffect(() => {
    if (!user || isNaN(matchId)) return;
    setInitialLoading(true);
    Promise.all([fetchMessages(), fetchMatchInfo()]).finally(() => {
      setInitialLoading(false);
    });
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [user, matchId]);

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
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify({ match_id: matchId, content }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send message");
        setNewMsg(content);
        return;
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setError("");
      inputRef.current?.focus();
    } catch {
      setError("Network error. Try again.");
      setNewMsg(content);
    } finally {
      setSending(false);
    }
  };

  const handleBlock = async () => {
    if (!otherUser) return;
    setBlocking(true);
    setBlockError("");
    let blocked = false;
    try {
      const blockRes = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify({ user_id: otherUser.id }),
      });
      if (!blockRes.ok) { const data = await blockRes.json().catch(() => null); setBlockError(data?.error || "Could not block this user. Please try again."); return; }
      blocked = true;
      navigate({ to: "/connections" });
    } catch {
      setBlockError("Network error. Please try again.");
    } finally {
      setBlocking(false);
    }
    if (blocked) setShowMenu(false);
  };

  const handleMessageReport = async () => {
    if (!msgReportTarget || !msgReportReason || msgReporting) return;
    setMsgReporting(true);
    setMsgReportError("");
    try {
      const res = await fetch("/api/users/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
        body: JSON.stringify({ message_id: msgReportTarget.id, reason: msgReportReason }),
      });
      if (res.status === 409) {
        // Already reported (by this user) — treat as reported.
        setReportedMessageIds((prev) => new Set(prev).add(msgReportTarget.id));
        setMsgReportState("done");
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        setMsgReportError(data?.error || "You've sent too many reports. Please try again later.");
        setMsgReportState("error");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMsgReportError(data?.error || "Could not submit the report. Please try again.");
        setMsgReportState("error");
        return;
      }
      setReportedMessageIds((prev) => new Set(prev).add(msgReportTarget.id));
      setMsgReportState("done");
    } catch {
      setMsgReportError("Network error. Please try again.");
      setMsgReportState("error");
    } finally {
      setMsgReporting(false);
    }
  };

  const requestUnmatch = () => {
    if (!otherUser) return;
    setShowMenu(false);
    dispatchUnmatch({ type: "REQUEST", targetUserId: otherUser.id });
  };

  const confirmUnmatch = async () => {
    if (!otherUser || (unmatch.phase !== "confirming" && unmatch.phase !== "failed")) return;
    const userId = otherUser.id;
    dispatchUnmatch({ type: "CONFIRM" });
    try {
      const res = await fetch('/api/matches/unmatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() || '' },
        body: JSON.stringify({ matchUserId: userId }),
      });
      const data = await res.json().catch(() => null);
      const failure = unmatchFailureMessage(res.ok, data);
      if (failure) {
        dispatchUnmatch({ type: "FAILED", error: failure });
        return;
      }
      dispatchUnmatch({ type: "SUCCEEDED" });
      navigate({ to: '/connections' });
    } catch {
      dispatchUnmatch({ type: "FAILED", error: unmatchFailureMessage(false, null)! });
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
        <div className="flex flex-col items-center gap-4">
          <div className="loader-pulse" />
          <p className="text-sm text-gray-400">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (error && messages.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="card flex flex-col items-center gap-4 border-red-500/30 bg-red-500/10 p-12 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <Link to="/connections" className="btn-secondary">
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
          className="flex-shrink-0 rounded-full p-1 text-gray-400 transition hover:text-white hover:scale-110"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-800 ring-2 ring-rose-500/10 ring-offset-1 ring-offset-gray-950">
          {otherUser?.photo_path ? (
            <img src={otherUser.photo_path} alt={otherUser.display_name || "User"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{otherUser?.display_name || "Unknown"}</h2>
        </div>

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Chat actions"
            aria-expanded={showMenu}
            aria-haspopup="menu"
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {blockError && <p role="alert" className="mt-2 text-sm text-red-400">{blockError}</p>}
      {showMenu && (
            <div role="menu" className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-gray-700 bg-gray-900 py-1.5 shadow-2xl">
              <button
                onClick={handleBlock}
                disabled={blocking}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {blocking ? "Blocking..." : "Block User"}
              </button>
              <button
                onClick={requestUnmatch}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Unmatch
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500">No messages yet. Say hello! 👋</p>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const alreadyReported = reportedMessageIds.has(msg.id);
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[75%] flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm ${
                      isMe
                        ? "bg-rose-600 text-white rounded-br-md animate-[slideInRight_0.3s_ease-out]"
                        : "bg-gray-800 text-gray-100 rounded-bl-md animate-[slideInLeft_0.3s_ease-out]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`mt-1 text-right text-xs ${isMe ? "text-rose-200" : "text-gray-500"}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => {
                        setMsgReportTarget(msg);
                        setMsgReportReason("");
                        setMsgReportState("pick");
                        setMsgReportError("");
                      }}
                      disabled={alreadyReported}
                      aria-label={alreadyReported ? "Message reported" : "Report message"}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${
                        alreadyReported
                          ? "cursor-default text-emerald-400/80"
                          : "text-gray-500 hover:bg-gray-800 hover:text-amber-400"
                      }`}
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      {alreadyReported ? "Reported" : "Report"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="mx-4 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSend} className="border-t border-white/5 bg-gray-950/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            aria-label="Message"
            placeholder="Type a message..."
            maxLength={2000}
            className="flex-1 rounded-full border border-white/10 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-rose-500/50"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!newMsg.trim() || sending}
            aria-label={sending ? "Sending message" : "Send message"}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500 hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {/* Report Modal */}
      {showReportModal && otherUser && (
        <div {...reportA11y} aria-labelledby="chat-report-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div ref={reportA11y.containerRef} tabIndex={-1} className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-2xl">
            <h3 id="chat-report-title" className="text-lg font-bold">Report {otherUser.display_name || "User"}</h3>
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
                    onClick={closeReport}
                    ref={reportCancelRef}
                    className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!reportReason || !otherUser) return;
                      setReporting(true);
                      try {
                        await fetch("/api/users/report", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" },
                          body: JSON.stringify({ user_id: otherUser.id, reason: reportReason }),
                        });
                        setReportDone(true);
                      } catch {
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
              <div className="mt-5" role="status" aria-live="polite">
                <button
                  onClick={() => {
                    closeReport();
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

      {/* Message Report Modal */}
      {msgReportTarget && (
        <div {...msgReportA11y} aria-labelledby="chat-msg-report-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div ref={msgReportA11y.containerRef} tabIndex={-1} className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-2xl">
            <h3 id="chat-msg-report-title" className="text-lg font-bold">Report message</h3>
            <p className="mt-2 line-clamp-2 rounded-lg border border-gray-700/60 bg-gray-800/60 px-3 py-2 text-xs italic text-gray-400">
              &ldquo;{msgReportTarget.content}&rdquo;
            </p>
            <p className="mt-3 text-sm text-gray-400">
              {msgReportState === "done"
                ? "Reported — thanks, our team will review."
                : "Why are you reporting this message?"}
            </p>

            {msgReportState === "error" && (
              <p role="alert" className="mt-2 text-sm text-red-400">{msgReportError}</p>
            )}

            {msgReportState === "pick" && (
              <>
                <div className="mt-4 space-y-2">
                  {MESSAGE_REPORT_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                        msgReportReason === r.value
                          ? "border-rose-500/50 bg-rose-500/10 text-white"
                          : "border-gray-700 text-gray-300 hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="msgReportReason"
                        value={r.value}
                        checked={msgReportReason === r.value}
                        onChange={(e) => setMsgReportReason(e.target.value)}
                        className="accent-rose-500"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={closeMsgReport}
                    ref={msgReportCancelRef}
                    className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMessageReport}
                    disabled={!msgReportReason || msgReporting}
                    className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {msgReporting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </>
            )}

            {msgReportState === "done" && (
              <div className="mt-5" role="status" aria-live="polite">
                <button
                  onClick={() => {
                    closeMsgReport();
                    setMsgReportState("pick");
                    setMsgReportReason("");
                  }}
                  className="w-full rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                >
                  Close
                </button>
              </div>
            )}

            {msgReportState === "error" && (
              <div className="mt-5 flex gap-3">
                <button
                  onClick={closeMsgReport}
                  className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setMsgReportState("pick"); setMsgReportError(""); }}
                  className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unmatch Confirmation Modal */}
      {unmatchOpen && otherUser && (
        <div {...unmatchA11y} aria-labelledby="chat-unmatch-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div ref={unmatchA11y.containerRef} tabIndex={-1} className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 p-6 shadow-2xl">
            <h3 id="chat-unmatch-title" className="text-lg font-bold">
              Unmatch {otherUser.display_name || "this match"}?
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              {unmatch.phase === "failed" ? (
                <span role="alert">{unmatch.error}</span>
              ) : (
                "This permanently removes the match and all chat history. This can't be undone."
              )}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                ref={keepMatchRef}
                onClick={closeUnmatch}
                disabled={unmatch.phase === "pending"}
                className="flex-1 rounded-full border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 disabled:opacity-50"
              >
                Keep Match
              </button>
              <button
                onClick={confirmUnmatch}
                disabled={unmatch.phase === "pending"}
                className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {unmatch.phase === "pending"
                  ? "Unmatching..."
                  : unmatch.phase === "failed"
                    ? "Try Again"
                    : "Unmatch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
