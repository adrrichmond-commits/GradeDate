import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "~/auth-context";
import { getCsrfToken } from "~/csrf-client";

export const Route = createFileRoute("/logout")({
  component: Logout,
});

function Logout() {
  const navigate = useNavigate();
  const { refetch } = useAuth();

  useEffect(() => {
    const doLogout = async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() || "" },
      });
      await refetch();
      navigate({ to: "/" });
    };
    doLogout();
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <p className="text-gray-400">Logging out...</p>
    </div>
  );
}
