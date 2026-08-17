import { analytics } from "@heycatch/sdk";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// HeyCatch analytics — initialize at MODULE SCOPE of the client entry, before
// mount. Nothing is queued before init: every SDK method silently no-ops until
// it runs, so init inside a component or route would leave every other page
// untracked. Static import only (no dynamic import / lazy chunk — the SDK
// forwards reserved short-link paths the moment the bundle evaluates) and no
// typeof-window guards (init is idempotent and a no-op during SSR). The
// project key is publishable and is intentionally inlined as a literal — it
// must not live in env vars. No apiHost and no tracingHosts: the app's API is
// same-origin (/api/*), which the SDK covers automatically.
analytics.init({
  projectKey: "hck_pk_zJyIGqI_UuKsTg9yN4nGyqDCWa8BevNR",
  install: {
    framework: "vite-react", // TanStack Start builds on Vite + React
    frameworkVersion: "19", // React major version (SDK expects the major as a string)
    agent: "other",
  },
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
