import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getCsrfToken } from "~/csrf-client";

export const Route = createFileRoute("/appeal")({ component: AppealPage });

type Appeal = { id: number; suspension_id: string; status: string; created_at: string; reviewed_at?: string | null };
function AppealPage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [text, setText] = useState("");
  const [suspensionId, setSuspensionId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { fetch("/api/suspension/appeal-status").then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error("We could not load your appeal status."); setAppeals(d?.appeals || []); setSuspensionId(d?.appeals?.find((a: Appeal) => a.status === "pending")?.suspension_id || ""); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(""); setMessage(""); setSubmitting(true); try { const r = await fetch("/api/suspension/appeal-status", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() || "" }, body: JSON.stringify({ suspension_id: suspensionId, text }) }); const d = await r.json().catch(() => null); if (!r.ok) throw new Error("We could not submit your appeal. You may submit one appeal within 14 days."); setAppeals(a => [...a, d.appeal]); setText(""); setMessage("Your appeal was submitted for review."); } catch (e) { setError(e instanceof Error ? e.message : "We could not submit your appeal. Please try again."); } finally { setSubmitting(false); } };
  return <main className="mx-auto max-w-xl px-4 py-12" aria-labelledby="appeal-title"><h1 id="appeal-title" className="text-3xl font-bold">Account review</h1><p className="mt-3 text-gray-400">If your account was suspended, you can check its review status here. We keep this process private and fair.</p>{loading ? <p role="status" className="mt-6 text-gray-400">Loading review status…</p> : <>{error && <p role="alert" className="mt-6 text-red-400">{error}</p>}{message && <p role="status" className="mt-6 text-emerald-400">{message}</p>}<section className="mt-8 card p-6" aria-labelledby="status-title"><h2 id="status-title" className="font-semibold">Appeal status</h2>{appeals.length ? <ul className="mt-3 space-y-2">{appeals.map(a => <li key={a.id} className="text-sm text-gray-300">Review status: <span className="font-medium text-white">{a.status}</span></li>)}</ul> : <p className="mt-3 text-sm text-gray-400">No appeal has been submitted.</p>}</section>{!appeals.some(a => a.status === "pending") && <form onSubmit={submit} className="mt-6 card p-6"><label htmlFor="appeal-text" className="block text-sm font-medium text-gray-300">Briefly share any context for review</label><textarea id="appeal-text" ref={textRef} value={text} onChange={e => setText(e.target.value)} required maxLength={2000} rows={5} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white" aria-describedby="appeal-help" /><p id="appeal-help" className="mt-2 text-xs text-gray-500">One appeal is available within 14 days of suspension.</p><button disabled={submitting || !suspensionId || !text.trim()} className="btn-primary mt-4">{submitting ? "Submitting…" : "Submit appeal"}</button></form>}</>}</main>;
}
