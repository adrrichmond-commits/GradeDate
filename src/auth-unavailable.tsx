import { useAuth } from "~/auth-context";

export function AuthUnavailable() {
  const { refetch } = useAuth();
  return (
    <main aria-labelledby="auth-unavailable-title" className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <section className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <h1 id="auth-unavailable-title" className="text-lg font-semibold text-amber-200">We couldn’t verify your session</h1>
        <p className="mt-2 text-sm text-gray-300">GradeDate is having trouble connecting. You may still be signed in. Try again.</p>
        <button type="button" onClick={() => void refetch()} className="mt-5 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500">Try again</button>
      </section>
    </main>
  );
}
