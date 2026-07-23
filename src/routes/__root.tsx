import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import { AuthProvider, useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";

import { Analytics } from "@vercel/analytics/react";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GradeDate — Find Your Looks-Match" },
      {
        name: "description",
        content:
          "GradeDate matches you with people at your attractiveness level. Upload a selfie, get your grade, and date your looks-match. $5.99/month.",
      },
      { property: "og:title", content: "GradeDate — Find Your Looks-Match" },
      {
        property: "og:description",
        content:
          "We grade your selfie. You date people at your level. No more shooting out of your league.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "GradeDate — Find Your Looks-Match" },
      {
        name: "twitter:description",
        content:
          "We grade your selfie. You date people at your level. No more shooting out of your league.",
      },
      { name: "twitter:image", content: "/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  notFoundComponent: () => <div>Page not found</div>,
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </RootDocument>
  );
}

/* ------------------------------------------------------------------ */
/* Inline Logo Mark SVG                                               */
/* ------------------------------------------------------------------ */
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lmg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill="none" stroke="url(#lmg)" strokeWidth="1.5" opacity="0.3" />
      <path
        d="M24 35C24 35 8 27 8 17.5c0-4.14 3.36-7.5 7.5-7.5 2.48 0 4.66 1.2 6 3.07L24 15l2.5-1.93c1.34-1.87 3.52-3.07 6-3.07 4.14 0 7.5 3.36 7.5 7.5C40 27 24 35 24 35z"
        fill="url(#lmg)"
        opacity="0.9"
      />
      <text x="24" y="26.5" textAnchor="middle" fill="#030712" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="900">10</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Nav Link Component — highlights active route                       */
/* ------------------------------------------------------------------ */
function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const routerState = useRouterState();
  const isActive = routerState.location.pathname === to;

  return (
    <Link
      to={to}
      className={`relative text-sm transition-colors ${
        isActive
          ? "text-white"
          : "text-gray-400 hover:text-white"
      }`}
    >
      {children}
      {isActive && (
        <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-rose-500" />
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Branded Loader                                                      */
/* ------------------------------------------------------------------ */
function BrandedLoader({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="loader-pulse" />
      {text && <p className="text-sm text-gray-400">{text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App Shell                                                           */
/* ------------------------------------------------------------------ */
function AppShell() {
  const { user, loading, pushPermission, pushSubscribed, subscribeToPush, unsubscribeFromPush } = useAuth();
  const [unread, setUnread] = useState(0);
  const [cookieConsent, setCookieConsent] = useState(true);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cookie helper
  function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name: string, value: string, days: number) {
    if (typeof document === "undefined") return;
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
  }

  useEffect(() => {
    if (typeof window !== "undefined" && !getCookie("cookie_consent")) {
      setCookieConsent(false);
    }
  }, []);

  // Register service worker for push notifications
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  // Show push prompt when user is logged in and notification permission is "default"
  useEffect(() => {
    if (
      user &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      pushPermission === "default" &&
      !pushSubscribed
    ) {
      // Delay the prompt slightly so it doesn't flash on load
      const timer = setTimeout(() => setShowPushPrompt(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowPushPrompt(false);
    }
  }, [user, pushPermission, pushSubscribed]);

  const acceptCookies = () => {
    setCookie("cookie_consent", "1", 365);
    setCookieConsent(true);
  };

  const fetchUnread = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/messages/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnread(data.count ?? 0);
      }
    } catch {
      // Silently fail
    }
  };

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchUnread();
      pollRef.current = setInterval(fetchUnread, 5000);
    } else {
      setUnread(0);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Navbar */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <LogoMark size={28} />
            <span className="text-rose-500">Grade</span>
            <span>Date</span>
          </Link>
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="h-4 w-16 animate-pulse rounded bg-gray-800" />
            ) : user ? (
              <>
                {user.subscription_status !== "active" && (
                  <Link
                    to="/subscribe"
                    className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 hover:scale-105 active:scale-95"
                  >
                    Subscribe
                  </Link>
                )}
                <NavLink to="/matches">Matches</NavLink>
                <NavLink to="/connections">
                  <span className="relative">
                    Connections
                    {unread > 0 && (
                      <span className="absolute -right-3 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </span>
                </NavLink>
                <NavLink to="/profile">Profile</NavLink>
                <NavLink to="/store">Store</NavLink>
                {user.subscription_status === "active" && (
                  <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                    ACTIVE
                  </span>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await fetch("/api/auth/logout", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": getCsrfToken() || "",
                      },
                    });
                    window.location.href = "/";
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm text-gray-400 transition hover:text-white"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm text-gray-400 transition hover:text-white"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 hover:scale-105 active:scale-95"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Page content with fade-in transition */}
      <div className="page-enter pt-16">
        {/* Push notification prompt */}
        {showPushPrompt && user && (
          <div className="mx-auto max-w-6xl px-4 pt-4">
            <div className="rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-rose-600/5 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔔</span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Get notified about new matches
                  </p>
                  <p className="text-xs text-gray-400">
                    We&apos;ll let you know instantly when someone matches or messages you.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowPushPrompt(false)}
                  className="text-sm text-gray-400 hover:text-white transition px-2 py-1"
                >
                  Not now
                </button>
                <button
                  onClick={async () => {
                    await subscribeToPush();
                    setShowPushPrompt(false);
                  }}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 hover:scale-105 active:scale-95"
                >
                  Enable notifications
                </button>
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-gray-500 sm:flex-row">
          <span>
            © {new Date().getFullYear()}{" "}
            <span className="font-semibold text-gray-400">GradeDate</span>.
            All rights reserved.
          </span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/terms" className="transition hover:text-gray-300">
              Terms of Service
            </Link>
            <Link to="/privacy" className="transition hover:text-gray-300">
              Privacy Policy
            </Link>
            <Link to="/cookies" className="transition hover:text-gray-300">
              Cookie Policy
            </Link>
            <Link to="/safety" className="transition hover:text-gray-300">
              Safety Tips
            </Link>
            <Link to="/refund" className="transition hover:text-gray-300">
              Refund Policy
            </Link>
            <Link to="/rules" className="transition hover:text-gray-300">
              Community Rules
            </Link>
            <Link to="/dmca" className="transition hover:text-gray-300">
              DMCA
            </Link>
            <Link to="/accessibility" className="transition hover:text-gray-300">
              Accessibility
            </Link>
            <Link to="/data" className="transition hover:text-gray-300">
              Data Rights
            </Link>
            <Link to="/legal" className="transition hover:text-gray-300">
              Law Enforcement
            </Link>
          </div>
        </div>
      </footer>

      {/* Cookie Consent Banner */}
      {!cookieConsent && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-rose-600/5 backdrop-blur-md px-4 py-4">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                We use essential cookies for security and sessions.
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                See our{" "}
                <Link to="/cookies" className="text-rose-400 underline hover:text-rose-300">cookie policy</Link>.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/cookies"
                className="text-sm text-gray-400 hover:text-white transition px-2 py-1"
              >
                Cookie Policy
              </Link>
              <button
                onClick={acceptCookies}
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 hover:scale-105 active:scale-95 shrink-0"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <title>GradeDate — Looks-Matched Dating</title>
        <meta name="description" content="Stop dating out of your league. GradeDate uses AI to match you with singles at your attractiveness level. Get your grade free." />
        <meta property="og:title" content="GradeDate — Looks-Matched Dating" />
        <meta property="og:description" content="Stop dating out of your league. AI-powered grading matches you with looks-compatible singles. Free preview." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://gradedate.app" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GradeDate — Looks-Matched Dating" />
        <meta name="twitter:description" content="Stop dating out of your league. AI-powered grading matches you with looks-compatible singles. Free preview." />
        <link rel="canonical" href="https://gradedate.app" />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}
