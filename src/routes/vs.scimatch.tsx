import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /vs/scimatch — legacy path, now a permanent redirect.
 *
 * The comparison page moved to the GradeDate-first /how-we-compare (owner
 * decision 2026-08-19). This stub keeps the old URL alive with a 308 permanent
 * redirect so existing bookmarks and inbound links don't 404. No page content
 * lives here anymore, and no competitor brand is named anywhere on the app.
 */
export const Route = createFileRoute("/vs/scimatch")({
  loader: () => {
    throw redirect({ to: "/how-we-compare", statusCode: 308 });
  },
  component: () => null,
});
