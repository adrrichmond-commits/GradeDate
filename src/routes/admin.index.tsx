import { createFileRoute, Link } from "@tanstack/react-router";
import { startAuthentication } from "@simplewebauthn/browser";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";
import {
  type AppealRow,
  type BetaInviteStats,
  type IssueInvitesResponse,
  type MessageFlag,
  type MessageFlagContext,
  type ModerationFlag,
  type PhotoModerationCase,
  type ReportDetail,
  type ReportRow,
  type WaitlistEntry,
  type WaitlistResponse,
  appealStatusLabel,
  formatConfidence,
  formatDate,
  isMfaRequiredError,
  isOwnerAdminRole,
  isPrivilegedRole,
  isRecentMfaError,
  messageFlagStatusLabel,
  quarantineActionsFor,
  quarantineStatusLabel,
  reportActionsFor,
  reportPriorityLabel,
  reportReasonLabel,
  reportStatusLabel,
  suspensionDurationLabel,
  suspensionReasonLabel,
  SUSPENSION_DURATIONS,
  SUSPENSION_REASONS,
  MESSAGE_FLAG_ACTIONS,
} from "~/admin-ui";

export const Route = createFileRoute("/admin/")({ component: AdminPage });

/* ── Shared fetch helpers (CSRF per the app's contact/appeal pattern) ── */

type AdminApiError = Error & { code?: string; status: number };

async function adminFetch(url: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw Object.assign(new Error("Could not reach the server. Check your connection and try again."), { status: 0 });
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : res.status === 403
          ? "You do not have permission to do that."
          : res.status === 401
            ? "Your session has expired. Sign in again."
            : "The admin service returned an error. Please try again.";
    throw Object.assign(new Error(message), {
      status: res.status,
      code: payload && typeof payload === "object" ? (payload as { code?: string }).code : undefined,
    }) as AdminApiError;
  }
  return payload;
}

async function adminGet(url: string): Promise<unknown> {
  return adminFetch(url);
}

async function adminPost(url: string, body: unknown): Promise<unknown> {
  await fetch("/api/csrf").catch(() => {});
  const token = getCsrfToken();
  return adminFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-CSRF-Token": token } : {}) },
    body: JSON.stringify(body),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ── Small shared presentational pieces ── */

function StatusPill({ tone, children }: { tone: "rose" | "emerald" | "amber" | "gray"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    gray: "border-gray-600/50 bg-gray-700/20 text-gray-400",
  };
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function ActionButton({
  onClick,
  disabled,
  tone = "secondary",
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger" | "ghost";
  children: React.ReactNode;
  title?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-rose-600 text-white hover:bg-rose-500",
    secondary: "border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white",
    danger: "border border-red-600/60 text-red-400 hover:bg-red-600/10 hover:border-red-500",
    ghost: "text-gray-400 hover:text-white",
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[tone]}`}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
      <p>{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold text-red-200 underline underline-offset-2 hover:text-white">
          Try again
        </button>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-gray-500">{children}</p>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
    </div>
  );
}

/* ── Privileged MFA step-up (owner/admin/moderator) ─────────────── */

function MfaStepUp({ defaultEmail, reason, onDone }: { defaultEmail: string; reason: string; onDone: () => Promise<void> }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("");
    setBusy(true);
    try {
      setStatus("Starting passkey challenge…");
      const start = await fetch("/api/auth/privileged/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const startBody = await start.json().catch(() => ({}));
      if (!start.ok) {
        if (startBody?.code === "MFA_REQUIRED") {
          throw new Error("No passkey is enrolled for this account. Enroll one from Profile → Privileged passkey first.");
        }
        throw new Error(startBody?.error || "Passkey authentication could not start.");
      }
      setStatus("Confirm your identity with your enrolled passkey…");
      let assertion: unknown;
      try {
        assertion = await startAuthentication({ optionsJSON: startBody.options });
      } catch {
        throw new Error("Passkey authentication was cancelled or unavailable. Please try again.");
      }
      const finish = await fetch("/api/auth/privileged/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: startBody.challenge_id, response: assertion }),
      });
      const finishBody = await finish.json().catch(() => ({}));
      if (!finish.ok) {
        throw new Error(finishBody?.error || "Passkey authentication failed. Please try again.");
      }
      setStatus("Verified. Refreshing…");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mx-auto max-w-md p-6">
      <h2 className="text-lg font-semibold">Privileged access required</h2>
      <p className="mt-2 text-sm text-gray-400">{reason}</p>
      <p className="mt-2 text-xs text-gray-500">
        Admin actions are protected by an MFA-verified privileged session. Completing this step creates a short-lived
        session (15 minutes) that is required for every admin request. Your password alone is never enough.
      </p>
      <form onSubmit={verify} className="mt-4 space-y-4" aria-busy={busy}>
        <div>
          <label htmlFor="admin-mfa-email" className="mb-1.5 block text-sm font-medium text-gray-300">Email</label>
          <input id="admin-mfa-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="admin-mfa-password" className="mb-1.5 block text-sm font-medium text-gray-300">Password</label>
          <input id="admin-mfa-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Your password" />
        </div>
        {status && <p role="status" className="text-sm text-amber-300">{status}</p>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy || !email.trim() || !password} className="btn-primary w-full justify-center">
          {busy ? "Waiting for passkey…" : "Verify with passkey"}
        </button>
      </form>
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────── */

type TabKey = "photos" | "messages" | "reports" | "appeals" | "suspensions" | "beta";

const TABS: { key: TabKey; label: string; ownerOnly?: boolean }[] = [
  { key: "photos", label: "Photo review" },
  { key: "messages", label: "Message flags" },
  { key: "reports", label: "Reports" },
  { key: "appeals", label: "Appeals" },
  { key: "suspensions", label: "Suspensions" },
  { key: "beta", label: "Beta ops", ownerOnly: true },
];

/* ── Photo review tab ── */

type PhotoQueuePayload = { cases: PhotoModerationCase[]; flags: ModerationFlag[] };

function PhotoCaseRow({
  item,
  flags,
  onMfaRequired,
  onRecentMfa,
}: {
  item: PhotoModerationCase;
  flags: ModerationFlag[];
  onMfaRequired: () => void;
  onRecentMfa: () => void;
}) {
  const [viewing, setViewing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState(item.status);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const relatedFlags = flags.filter((f) => f.photo_id === item.photo_id && f.user_id === item.user_id);

  const loadPhoto = async () => {
    setBusy(true);
    setError("");
    try {
      const access = (await adminGet(`/api/admin/photo-moderation/${String(item.id)}/access`)) as { token: string; expires_at: string };
      const res = await fetch(`/api/admin/photo-moderation/${String(item.id)}/bytes?token=${encodeURIComponent(access.token)}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw Object.assign(new Error(payload?.error || "Could not load the quarantined photo."), {
          status: res.status,
          code: payload?.code,
        }) as AdminApiError;
      }
      const blob = await res.blob();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(blob));
      setExpiresAt(access.expires_at);
      setViewing(true);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else if (isRecentMfaError(e) || e.status === 403) onRecentMfa();
      else setError(errorMessage(e, "Could not load the quarantined photo."));
    } finally {
      setBusy(false);
    }
  };

  const transition = async (to: string) => {
    setActionBusy(true);
    setActionError("");
    try {
      const result = (await adminPost(`/api/admin/photo-moderation/${String(item.id)}`, { status: to })) as { case?: PhotoModerationCase };
      setStatus(result.case?.status ?? to);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setActionError(errorMessage(e, "Could not update this case."));
    } finally {
      setActionBusy(false);
    }
  };

  const actions = quarantineActionsFor(status);
  const hideTone = status === "pending" || status === "quarantined" || status === "removed";

  return (
    <li className="rounded-xl border border-white/5 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill tone={hideTone ? "rose" : "emerald"}>{quarantineStatusLabel(status)}</StatusPill>
        {item.result && <StatusPill tone="gray">{item.result}</StatusPill>}
        <span className="text-gray-400">Case #{String(item.id)}</span>
        <span className="text-gray-400">· user #{item.user_id}</span>
        {item.source && <span className="text-gray-500">· {item.source}</span>}
        <span className="ml-auto text-xs text-gray-500">{formatDate(item.created_at)}</span>
      </div>
      {item.reason && <p className="mt-2 text-xs text-gray-400">Reason: <span className="text-gray-300">{item.reason}</span></p>}
      {item.legal_hold && <p className="mt-1 text-xs text-amber-400">Legal hold — evidence is preserved</p>}
      {relatedFlags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {relatedFlags.map((f) => (
            <li key={String(f.id)} className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span>Auto flag: <span className="text-gray-300">{f.flag_type}</span></span>
              <span>confidence {formatConfidence(f.confidence)}</span>
              <StatusPill tone="gray">{f.status}</StatusPill>
            </li>
          ))}
        </ul>
      )}
      {actionError && <p role="alert" className="mt-2 text-xs text-red-400">{actionError}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      {viewing && imageUrl ? (
        <div className="mt-3">
          <img src={imageUrl} alt={`Quarantined photo review for case ${String(item.id)}`} className="max-h-96 rounded-lg border border-white/10 object-contain" />
          {expiresAt && <p className="mt-1 text-[11px] text-gray-500">Signed review access expires {formatDate(expiresAt)}</p>}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton onClick={loadPhoto} disabled={busy} tone="primary">
          {busy ? "Loading…" : viewing && imageUrl ? "Reload photo" : "View photo"}
        </ActionButton>
        {actions.map((a) => (
          <ActionButton
            key={a.status}
            onClick={() => transition(a.status)}
            disabled={actionBusy}
            tone={a.status === "removed" ? "danger" : "secondary"}
          >
            {a.label}
          </ActionButton>
        ))}
      </div>
    </li>
  );
}

function PhotosTab({ onMfaRequired, onRecentMfa }: { onMfaRequired: () => void; onRecentMfa: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [data, setData] = useState<PhotoQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async (status: string) => {
    setLoading(true);
    setError("");
    try {
      const payload = (await adminGet(`/api/admin/photo-moderation${status === "all" ? "" : `?status=${status}`}`)) as PhotoQueuePayload;
      setData(payload);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not load the photo review queue."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(statusFilter); }, [statusFilter]);
  const cases = data?.cases ?? [];
  const flags = data?.flags ?? [];
  return (
    <section>
      <SectionHeader title="Photo review queue" subtitle="Photos quarantined by automated moderation or user reports. Reviewing loads the image through short-lived signed access — never a raw blob URL." />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "pending", "quarantined", "approved", "removed", "restored"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${statusFilter === s ? "bg-rose-600 text-white" : "border border-gray-700 text-gray-400 hover:text-white"}`}
          >
            {s === "all" ? "All" : quarantineStatusLabel(s)}
          </button>
        ))}
      </div>
      {loading ? <p role="status" className="py-8 text-center text-sm text-gray-400">Loading photo review queue…</p>
        : error ? <ErrorBanner onRetry={() => void load(statusFilter)}>{error}</ErrorBanner>
        : cases.length === 0 ? <EmptyState>No photo moderation cases{statusFilter === "all" ? "" : ` with status “${quarantineStatusLabel(statusFilter)}”`}.</EmptyState>
        : <ul className="space-y-3">{cases.map((c) => <PhotoCaseRow key={String(c.id)} item={c} flags={flags} onMfaRequired={onMfaRequired} onRecentMfa={onRecentMfa} />)}</ul>}
    </section>
  );
}

/* ── Message flags tab ── */

type MessageQueuePayload = { flags: MessageFlag[] };

function MessageRow({
  flag,
  onMfaRequired,
  onRecentMfa,
  onChanged,
}: {
  flag: MessageFlag;
  onMfaRequired: () => void;
  onRecentMfa: () => void;
  onChanged: () => void;
}) {
  const [context, setContext] = useState<MessageFlagContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);

  const loadContext = async () => {
    if (context) { setContext(null); return; }
    setLoadingContext(true);
    setError("");
    try {
      const payload = (await adminGet(`/api/admin/message-moderation/${String(flag.id)}`)) as { flag: MessageFlagContext };
      setContext(payload.flag);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else if (isRecentMfaError(e) || e.status === 403) onRecentMfa();
      else setError(errorMessage(e, "Could not load the message context."));
    } finally {
      setLoadingContext(false);
    }
  };

  const act = async (action: string) => {
    setActionBusy(true);
    setError("");
    try {
      await adminPost(`/api/admin/message-moderation/${String(flag.id)}`, { action });
      setConfirmLock(false);
      onChanged();
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not update this flag."));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-white/5 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill tone={flag.status === "new" ? "amber" : "gray"}>{messageFlagStatusLabel(flag.status)}</StatusPill>
        <span className="text-gray-300">{flag.flag_type}</span>
        {flag.source && <span className="text-gray-500">{flag.source}</span>}
        <span className="text-gray-400">confidence {formatConfidence(flag.confidence)}</span>
        {flag.sender_display && <span className="text-gray-400">· from {flag.sender_display}</span>}
        <span className="ml-auto text-xs text-gray-500">{formatDate(flag.created_at)}</span>
      </div>
      {context && (
        <blockquote className="mt-3 rounded-lg border border-white/10 bg-gray-950/60 p-3 text-sm text-gray-200">
          {context.content}
          <footer className="mt-2 text-[11px] text-gray-500">
            sender user #{context.sender_id} · message #{context.message_id} · match #{context.match_id ?? "—"} · sent {formatDate(context.message_created_at)}
          </footer>
        </blockquote>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton onClick={loadContext} disabled={loadingContext} tone="secondary">
          {loadingContext ? "Loading…" : context ? "Hide context" : "View context"}
        </ActionButton>
        {MESSAGE_FLAG_ACTIONS.map((a) =>
          a.action === "lock_account" ? (
            confirmLock ? (
              <span key={a.action} className="inline-flex items-center gap-2">
                <ActionButton onClick={() => act("lock_account")} disabled={actionBusy} tone="danger">Confirm indefinite suspension</ActionButton>
                <ActionButton onClick={() => setConfirmLock(false)} disabled={actionBusy} tone="ghost">Cancel</ActionButton>
              </span>
            ) : (
              <ActionButton key={a.action} onClick={() => setConfirmLock(true)} tone="danger" title={a.hint}>{a.label}</ActionButton>
            )
          ) : (
            <ActionButton key={a.action} onClick={() => act(a.action)} disabled={actionBusy} tone={a.danger ? "danger" : "secondary"} title={a.hint}>
              {a.label}
            </ActionButton>
          ),
        )}
      </div>
    </li>
  );
}

function MessagesTab({ onMfaRequired, onRecentMfa }: { onMfaRequired: () => void; onRecentMfa: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [data, setData] = useState<MessageQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const load = async (status: string) => {
    setLoading(true);
    setError("");
    try {
      const payload = (await adminGet(`/api/admin/message-moderation${status === "all" ? "" : `?status=${status}`}`)) as MessageQueuePayload;
      setData(payload);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not load the message moderation queue."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(statusFilter); }, [statusFilter, reloadKey]);
  const flags = data?.flags ?? [];
  return (
    <section>
      <SectionHeader title="Message moderation flags" subtitle="Messages flagged by automated moderation or user reports. Message content is only fetched on demand and only what the API returns for review." />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "new", "reviewed", "dismissed", "actioned"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${statusFilter === s ? "bg-rose-600 text-white" : "border border-gray-700 text-gray-400 hover:text-white"}`}
          >
            {s === "all" ? "All" : messageFlagStatusLabel(s)}
          </button>
        ))}
      </div>
      {loading ? <p role="status" className="py-8 text-center text-sm text-gray-400">Loading message flags…</p>
        : error ? <ErrorBanner onRetry={() => void load(statusFilter)}>{error}</ErrorBanner>
        : flags.length === 0 ? <EmptyState>No message flags{statusFilter === "all" ? "" : ` with status “${messageFlagStatusLabel(statusFilter)}”`}.</EmptyState>
        : <ul className="space-y-3">{flags.map((f) => <MessageRow key={String(f.id)} flag={f} onMfaRequired={onMfaRequired} onRecentMfa={onRecentMfa} onChanged={() => setReloadKey((k) => k + 1)} />)}</ul>}
    </section>
  );
}

/* ── Reports tab ── */

type ReportsPayload = { reports: ReportRow[]; photo_flags: ModerationFlag[] };

function ReportRowItem({
  report,
  onMfaRequired,
  onChanged,
  onIssueSuspension,
}: {
  report: ReportRow;
  onMfaRequired: () => void;
  onChanged: () => void;
  onIssueSuspension: (userId: number, reportId: string) => void;
}) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const loadDetail = async () => {
    if (detail) { setDetail(null); return; }
    setLoadingDetail(true);
    setError("");
    try {
      const payload = (await adminGet(`/api/admin/reports/${String(report.id)}`)) as { report: ReportDetail };
      setDetail(payload.report);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not load the report details."));
    } finally {
      setLoadingDetail(false);
    }
  };

  const transition = async (to: string) => {
    setActionBusy(true);
    setError("");
    try {
      await adminPost(`/api/admin/reports/${String(report.id)}`, { status: to });
      onChanged();
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not update this report."));
    } finally {
      setActionBusy(false);
    }
  };

  const priorityTone = report.priority === "urgent" || report.priority === "high" ? "rose" : "gray";
  return (
    <li className="rounded-xl border border-white/5 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill tone="gray">{reportStatusLabel(report.status)}</StatusPill>
        <StatusPill tone={priorityTone}>{reportPriorityLabel(report.priority)}</StatusPill>
        <span className="text-gray-300">{reportReasonLabel(report.reason)}</span>
        <span className="text-gray-400">report #{String(report.id)} · reported user #{report.reported_id}</span>
        <span className="ml-auto text-xs text-gray-500">{formatDate(report.created_at)}</span>
      </div>
      {report.target_photo_id != null && <p className="mt-1 text-xs text-gray-500">Target photo #{report.target_photo_id}</p>}
      {report.target_message_id != null && <p className="mt-1 text-xs text-gray-500">Target message #{report.target_message_id}</p>}
      {detail && (
        <div className="mt-3 rounded-lg border border-white/10 bg-gray-950/60 p-3 text-sm">
          {detail.details ? <p className="text-gray-300"><span className="text-gray-500">Details: </span>{detail.details}</p> : <p className="text-gray-500">No details provided.</p>}
          {detail.resolution_notes ? <p className="mt-1 text-xs text-gray-400"><span className="text-gray-500">Resolution notes: </span>{detail.resolution_notes}</p> : null}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton onClick={loadDetail} disabled={loadingDetail} tone="secondary">{loadingDetail ? "Loading…" : detail ? "Hide details" : "View details"}</ActionButton>
        {reportActionsFor(report.status).map((to) => (
          <ActionButton key={to} onClick={() => transition(to)} disabled={actionBusy} tone={to === "dismissed" ? "secondary" : "primary"}>
            Mark {reportStatusLabel(to)}
          </ActionButton>
        ))}
        <ActionButton onClick={() => onIssueSuspension(report.reported_id, String(report.id))} tone="danger" title="Create a suspension for the reported user">
          Suspend user
        </ActionButton>
      </div>
    </li>
  );
}

function ReportsTab({
  onMfaRequired,
  onIssueSuspension,
}: {
  onMfaRequired: () => void;
  onIssueSuspension: (userId: number, reportId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const load = async (status: string) => {
    setLoading(true);
    setError("");
    try {
      const payload = (await adminGet(`/api/admin/reports${status === "all" ? "" : `?status=${status}`}`)) as ReportsPayload;
      setData(payload);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not load the reports queue."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(statusFilter); }, [statusFilter, reloadKey]);
  const reports = data?.reports ?? [];
  return (
    <section>
      <SectionHeader title="Reports queue" subtitle="User-submitted safety reports. Open reports are sorted by priority, then oldest first." />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "open", "triaged", "actioned", "dismissed", "closed"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${statusFilter === s ? "bg-rose-600 text-white" : "border border-gray-700 text-gray-400 hover:text-white"}`}
          >
            {s === "all" ? "All" : reportStatusLabel(s)}
          </button>
        ))}
      </div>
      {loading ? <p role="status" className="py-8 text-center text-sm text-gray-400">Loading reports…</p>
        : error ? <ErrorBanner onRetry={() => void load(statusFilter)}>{error}</ErrorBanner>
        : reports.length === 0 ? <EmptyState>No reports{statusFilter === "all" ? "" : ` with status “${reportStatusLabel(statusFilter)}”`}.</EmptyState>
        : <ul className="space-y-3">{reports.map((r) => <ReportRowItem key={String(r.id)} report={r} onMfaRequired={onMfaRequired} onChanged={() => setReloadKey((k) => k + 1)} onIssueSuspension={onIssueSuspension} />)}</ul>}
    </section>
  );
}

/* ── Appeals tab ── */

function AppealsTab({
  role,
  onMfaRequired,
}: {
  role: string;
  onMfaRequired: () => void;
}) {
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const ownerAdmin = isOwnerAdminRole(role);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = (await adminGet("/api/admin/appeals")) as { appeals: AppealRow[] };
      setAppeals(payload.appeals);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not load the appeals queue."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [reloadKey]);

  const review = async (appeal: AppealRow, status: "granted" | "denied") => {
    setBusyId(String(appeal.id));
    setError("");
    try {
      await adminPost(`/api/admin/appeals/${String(appeal.id)}`, { status });
      setReloadKey((k) => k + 1);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not update this appeal."));
    } finally {
      setBusyId("");
    }
  };

  const revoke = async (appeal: AppealRow) => {
    setBusyId(`revoke-${String(appeal.id)}`);
    setError("");
    try {
      await adminPost(`/api/admin/suspensions/${appeal.suspension_id}`, { action: "revoke" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not revoke this suspension."));
    } finally {
      setBusyId("");
    }
  };

  return (
    <section>
      <SectionHeader title="Appeals queue" subtitle="Appeals submitted by suspended users. Granting lifts the suspension; denying keeps it in place." />
      {error && <ErrorBanner onRetry={() => void load()}>{error}</ErrorBanner>}
      {loading ? <p role="status" className="py-8 text-center text-sm text-gray-400">Loading appeals…</p>
        : appeals.length === 0 ? <EmptyState>No appeals submitted.</EmptyState>
        : <ul className="space-y-3">{appeals.map((a) => (
          <li key={String(a.id)} className="rounded-xl border border-white/5 bg-gray-900/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill tone={a.status === "pending" ? "amber" : a.status === "granted" ? "emerald" : "gray"}>{appealStatusLabel(a.status)}</StatusPill>
              <span className="text-gray-300">Appeal #{String(a.id)}</span>
              <span className="text-gray-400">· suspension {a.suspension_id}</span>
              <span className="text-gray-400">· user #{a.user_id}</span>
              <span className="ml-auto text-xs text-gray-500">{formatDate(a.created_at)}</span>
            </div>
            {a.reviewed_at && <p className="mt-1 text-xs text-gray-500">Reviewed {formatDate(a.reviewed_at)}</p>}
            {a.status === "pending" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton onClick={() => review(a, "granted")} disabled={busyId === String(a.id)} tone="primary" title="Grant the appeal and lift the suspension (owner/admin)">
                  Grant appeal
                </ActionButton>
                <ActionButton onClick={() => review(a, "denied")} disabled={busyId === String(a.id)} tone="secondary">
                  Deny appeal
                </ActionButton>
                {ownerAdmin && (
                  <ActionButton onClick={() => revoke(a)} disabled={busyId === `revoke-${String(a.id)}`} tone="danger" title="Revoke the suspension outright without an appeal decision">
                    Revoke suspension
                  </ActionButton>
                )}
              </div>
            )}
          </li>
        ))}</ul>}
    </section>
  );
}

/* ── Suspensions tab (create) ── */

function SuspensionForm({
  defaultUserId,
  sourceReportId,
  onDone,
  onCancel,
  onMfaRequired,
}: {
  defaultUserId?: number;
  sourceReportId?: string;
  onDone: (result: string) => void;
  onCancel?: () => void;
  onMfaRequired: () => void;
}) {
  const [userId, setUserId] = useState(defaultUserId ? String(defaultUserId) : "");
  const [reason, setReason] = useState<string>("other");
  const [duration, setDuration] = useState<string>("7d");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = /^\d+$/.test(userId.trim());
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { user_id: Number(userId.trim()), reason, duration };
      if (sourceReportId) body.source_report_id = sourceReportId;
      const payload = (await adminPost("/api/admin/suspensions", body)) as { suspension?: { id?: number | string } };
      setConfirming(false);
      onDone(`Suspension created${payload.suspension?.id != null ? ` (id ${String(payload.suspension.id)})` : ""} for user #${userId.trim()}.`);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not create the suspension."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-white/5 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label htmlFor="susp-user-id" className="mb-1.5 block text-xs font-medium text-gray-300">User ID</label>
          <input id="susp-user-id" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} className="input-field" placeholder="e.g. 42" />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="susp-reason" className="mb-1.5 block text-xs font-medium text-gray-300">Reason</label>
          <select id="susp-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="input-field">
            {SUSPENSION_REASONS.map((r) => <option key={r} value={r}>{suspensionReasonLabel(r)}</option>)}
          </select>
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="susp-duration" className="mb-1.5 block text-xs font-medium text-gray-300">Duration</label>
          <select id="susp-duration" value={duration} onChange={(e) => setDuration(e.target.value)} className="input-field">
            {SUSPENSION_DURATIONS.map((d) => <option key={d} value={d}>{suspensionDurationLabel(d)}</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <ActionButton onClick={submit} disabled={busy || !valid} tone="danger">
              {busy ? "Creating…" : `Confirm suspension of user #${userId.trim()}`}
            </ActionButton>
            <ActionButton onClick={() => setConfirming(false)} disabled={busy} tone="ghost">Cancel</ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => setConfirming(true)} disabled={!valid} tone="danger">
            Suspend user
          </ActionButton>
        )}
        {onCancel && <ActionButton onClick={onCancel} tone="ghost">Close</ActionButton>}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Suspensions immediately lock the account and gate all authenticated actions. This action is audited.
      </p>
    </div>
  );
}

/* ── Beta ops tab (owner/admin) ── */

function BetaTab({ onMfaRequired }: { onMfaRequired: () => void }) {
  const [stats, setStats] = useState<BetaInviteStats | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [count, setCount] = useState("10");
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [issueError, setIssueError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [statsPayload, waitlistPayload] = (await Promise.all([
        adminGet("/api/admin/beta-invites"),
        adminGet("/api/admin/waitlist?limit=100"),
      ])) as [BetaInviteStats, WaitlistResponse];
      setStats(statsPayload);
      setWaitlist(waitlistPayload);
      setSelected((prev) => {
        const valid = new Set(waitlistPayload.entries.map((e) => e.id));
        return new Set([...prev].filter((id) => valid.has(id)));
      });
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setError(errorMessage(e, "Could not load beta operations."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [reloadKey]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const countNum = Math.max(1, Number(count) || 1);
  const recipients = selected.size > 0 ? selected.size : Math.min(countNum, waitlist?.entries.length ?? 0);
  const canIssue = (waitlist?.entries.length ?? 0) > 0;

  const issue = async () => {
    setBusy(true);
    setIssueError("");
    try {
      const body: Record<string, unknown> = { count: countNum, notify };
      if (selected.size > 0) body.waitlist_ids = [...selected];
      const payload = (await adminPost("/api/admin/beta-invites", body)) as IssueInvitesResponse;
      setResult(
        `${payload.codes?.length ?? 0} invite code${(payload.codes?.length ?? 0) === 1 ? "" : "s"} issued.` +
        (notify ? ` ${payload.emailed ?? 0} invite email${(payload.emailed ?? 0) === 1 ? "" : "s"} sent.` : " Emails were not sent (notify off).") +
        (payload.clamped ? " The count was clamped to the remaining cohort capacity or waitlist size." : ""),
      );
      setConfirming(false);
      setSelected(new Set());
      setReloadKey((k) => k + 1);
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) onMfaRequired();
      else setIssueError(errorMessage(e, "Could not issue invites."));
    } finally {
      setBusy(false);
    }
  };

  const entries = waitlist?.entries ?? [];
  return (
    <section>
      <SectionHeader title="Austin beta operations" subtitle="Waitlist, cohort capacity, and invite issuance for the closed beta. Owner/admin only." />
      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4"><p className="text-xs text-gray-400">Cohort cap</p><p className="mt-1 text-2xl font-bold">{stats.cohort.cap}</p></div>
          <div className="card p-4"><p className="text-xs text-gray-400">Redeemed</p><p className="mt-1 text-2xl font-bold">{stats.cohort.redeemed}</p></div>
          <div className="card p-4"><p className="text-xs text-gray-400">Spots remaining</p><p className="mt-1 text-2xl font-bold text-amber-300">{stats.cohort.remaining}</p></div>
          <div className="card p-4"><p className="text-xs text-gray-400">Waitlist total</p><p className="mt-1 text-2xl font-bold">{stats.waitlist.total}</p></div>
        </div>
      )}
      {loading ? <p role="status" className="py-8 text-center text-sm text-gray-400">Loading beta operations…</p>
        : error ? <ErrorBanner onRetry={() => void load()}>{error}</ErrorBanner>
        : <>
          <div className="card p-5">
            <h3 className="font-semibold">Issue invites</h3>
            <p className="mt-1 text-xs text-gray-500">
              Issues plain invite codes. With “notify” on, each code is emailed to a waitlist address — the N oldest entries,
              or the entries you select below. Emails are sent immediately and cannot be unsent.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-32">
                <label htmlFor="invite-count" className="mb-1.5 block text-xs font-medium text-gray-300">How many?</label>
                <input id="invite-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} className="input-field" />
              </div>
              <label className="flex items-center gap-2 pb-2.5 text-sm text-gray-300">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-rose-600" />
                Send invite emails (notify)
              </label>
            </div>
            {notify && recipients > 0 && (
              <p className="mt-2 text-xs text-amber-300">
                This will email {recipients} invite{recipients === 1 ? "" : "s"} to real waitlist addresses{selected.size > 0 ? " you selected" : " (oldest first)"} via Resend.
              </p>
            )}
            {issueError && <p role="alert" className="mt-2 text-xs text-red-400">{issueError}</p>}
            {result && <p role="status" className="mt-2 text-xs text-emerald-300">{result}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {confirming ? (
                <>
                  <ActionButton onClick={issue} disabled={busy || !canIssue} tone="danger">
                    {busy ? "Issuing…" : `Confirm — issue ${recipients} invite${recipients === 1 ? "" : "s"}${notify ? " and send emails" : ""}`}
                  </ActionButton>
                  <ActionButton onClick={() => setConfirming(false)} disabled={busy} tone="ghost">Cancel</ActionButton>
                </>
              ) : (
                <ActionButton onClick={() => setConfirming(true)} disabled={!canIssue} tone="primary">Issue invites…</ActionButton>
              )}
            </div>
            {!canIssue && <p className="mt-2 text-xs text-gray-500">The waitlist is empty — no one can be invited yet.</p>}
          </div>
          <div className="card mt-5 overflow-hidden">
            <div className="border-b border-white/5 p-4">
              <h3 className="font-semibold">Waitlist ({waitlist?.total ?? 0})</h3>
              <p className="mt-1 text-xs text-gray-500">Oldest first. Select entries to invite them specifically instead of oldest-first.</p>
            </div>
            {entries.length === 0 ? <EmptyState>No waitlist entries yet.</EmptyState> : (
              <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
                {entries.map((e: WaitlistEntry) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.email}`}
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-rose-600"
                    />
                    <span className="min-w-0 flex-1 truncate text-gray-200">{e.email}</span>
                    {e.zip_code && <span className="hidden text-xs text-gray-500 sm:inline">{e.zip_code}</span>}
                    <span className="text-xs text-gray-500">{formatDate(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>}
    </section>
  );
}

/* ── Page shell ─────────────────────────────────────────────────── */

function AdminDashboard({ role, email }: { role: string; email: string }) {
  const [tab, setTab] = useState<TabKey>("photos");
  const [mfaState, setMfaState] = useState<"probing" | "ok" | "required">("probing");
  const [mfaReason, setMfaReason] = useState("");
  const [probeError, setProbeError] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const { refetch } = useAuth();

  // Probe the privilege gate: any moderator-accessible admin GET works.
  const probe = async () => {
    setMfaState("probing");
    setProbeError("");
    try {
      await adminGet("/api/admin/photo-moderation");
      setMfaState("ok");
    } catch (err) {
      const e = err as AdminApiError;
      if (isMfaRequiredError(e)) {
        setMfaReason(
          "Every admin request requires a passkey-verified privileged session. Authenticate below to unlock this page — the session lasts 15 minutes.",
        );
        setMfaState("required");
      } else {
        setProbeError(errorMessage(e, "Could not verify privileged access."));
        setMfaState("ok");
      }
    }
  };
  useEffect(() => { void probe(); }, []);

  const onMfaRequired = (reason?: string) => {
    setMfaReason(reason ?? "Your privileged session is no longer valid. Re-authenticate to continue.");
    setMfaState("required");
  };

  const onRecentMfa = () => {
    setMfaReason("Viewing this item requires authentication within the last 5 minutes. Re-authenticate to continue.");
    setMfaState("required");
  };

  const visibleTabs = TABS.filter((t) => !t.ownerOnly || isOwnerAdminRole(role));
  const current = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0];

  const issueSuspension = (userId: number, reportId: string) => {
    setSessionNote("");
    // Swap to the suspensions tab with the prefilled form via a keyed banner.
    setPendingSuspension({ userId, reportId });
    setTab("suspensions");
  };
  const [pendingSuspension, setPendingSuspension] = useState<{ userId: number; reportId: string } | null>(null);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10" aria-labelledby="admin-title">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="admin-title" className="text-3xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-gray-400">
            Safety review and beta operations. Signed in as <span className="text-gray-300">{email}</span> · role <span className="text-gray-300">{role}</span>
            {mfaState === "ok" && <span className="ml-2 text-emerald-400">· privileged session active</span>}
          </p>
        </div>
        <Link to="/profile" className="text-sm text-gray-400 hover:text-rose-400 transition">← Back to profile</Link>
      </div>
      {sessionNote && <p role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{sessionNote}</p>}
      {probeError && <ErrorBanner onRetry={() => void probe()}>{probeError}</ErrorBanner>}
      {mfaState === "probing" ? (
        <p role="status" className="py-10 text-center text-sm text-gray-400">Checking privileged access…</p>
      ) : mfaState === "required" ? (
        <MfaStepUp
          defaultEmail={email}
          reason={mfaReason}
          onDone={async () => {
            await refetch();
            setMfaState("ok");
            setSessionNote("");
          }}
        />
      ) : (
        <>
          <nav aria-label="Admin sections" className="mb-6 flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); setPendingSuspension(null); }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${current.key === t.key ? "bg-rose-600 text-white" : "border border-gray-700 text-gray-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {current.key === "photos" && <PhotosTab onMfaRequired={onMfaRequired} onRecentMfa={onRecentMfa} />}
          {current.key === "messages" && <MessagesTab onMfaRequired={onMfaRequired} onRecentMfa={onRecentMfa} />}
          {current.key === "reports" && <ReportsTab onMfaRequired={onMfaRequired} onIssueSuspension={issueSuspension} />}
          {current.key === "appeals" && <AppealsTab role={role} onMfaRequired={onMfaRequired} />}
          {current.key === "suspensions" && (
            <section>
              <SectionHeader title="Issue suspension" subtitle="Immediately suspends an account by user ID. Destructive — a confirmation is required." />
              {pendingSuspension && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Prefilled from report #{pendingSuspension.reportId} — suspending user #{pendingSuspension.userId}.
                </div>
              )}
              <SuspensionForm
                key={pendingSuspension ? `report-${pendingSuspension.reportId}` : "blank"}
                defaultUserId={pendingSuspension?.userId}
                sourceReportId={pendingSuspension?.reportId}
                onMfaRequired={onMfaRequired}
                onDone={(r) => { setSessionNote(r); setPendingSuspension(null); }}
                onCancel={pendingSuspension ? () => setPendingSuspension(null) : undefined}
              />
            </section>
          )}
          {current.key === "beta" && <BetaTab onMfaRequired={onMfaRequired} />}
        </>
      )}
    </main>
  );
}

/* ── Route guard ────────────────────────────────────────────────── */

function AdminPage() {
  const { user, loading } = useAuth();
  const role = user?.role ?? null;
  const privileged = useMemo(() => isPrivilegedRole(role), [role]);
  if (loading) {
    return <main className="mx-auto max-w-4xl px-4 py-10"><p role="status" className="py-10 text-center text-sm text-gray-400">Loading…</p></main>;
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="card mx-auto max-w-md p-6 text-center">
          <h1 className="text-xl font-bold">Sign in required</h1>
          <p className="mt-2 text-sm text-gray-400">The admin console is restricted to privileged accounts.</p>
          <Link to="/login" className="btn-primary mt-4">Sign in</Link>
        </div>
      </main>
    );
  }
  if (!privileged) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="card mx-auto max-w-md p-6 text-center">
          <h1 className="text-xl font-bold">Privileged access required</h1>
          <p className="mt-2 text-sm text-gray-400">
            This page is restricted to owner, admin, and moderator roles. Your account role is{" "}
            <span className="text-gray-200">{user.role || "none"}</span>.
          </p>
          <Link to="/profile" className="btn-secondary mt-4">Back to profile</Link>
        </div>
      </main>
    );
  }
  return <AdminDashboard role={user.role ?? ""} email={user.email} />;
}
