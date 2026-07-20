import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import { AuthProvider, useAuth } from "~/auth-context";

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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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

function AppShell() {
  const { user, loading } = useAuth();
  const [unread, setUnread] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          <Link to="/" className="text-xl font-bold tracking-tight">
            <span className="text-rose-500">Grade</span>Date
          </Link>
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="h-4 w-16 animate-pulse rounded bg-gray-800" />
            ) : user ? (
              <>
                {user.subscription_status !== "active" && (
                  <Link
                    to="/subscribe"
                    className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
                  >
                    Subscribe
                  </Link>
                )}
                <Link
                  to="/matches"
                  className="text-sm text-gray-400 transition hover:text-white"
                >
                  Matches
                </Link>
                <Link
                  to="/connections"
                  className="relative text-sm text-gray-400 transition hover:text-white"
                >
                  Connections
                  {unread > 0 && (
                    <span className="absolute -right-3 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                <Link
                  to="/profile"
                  className="text-sm text-gray-400 transition hover:text-white"
                >
                  Profile
                </Link>
                {user.subscription_status === "active" && (
                  <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                    ACTIVE
                  </span>
                )}
                <form action="/api/auth/logout" method="POST">
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
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div className="pt-16">
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
          <div className="flex gap-6">
            <a href="#" className="transition hover:text-gray-300">
              Privacy
            </a>
            <a href="#" className="transition hover:text-gray-300">
              Terms
            </a>
            <a href="#" className="transition hover:text-gray-300">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
