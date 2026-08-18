/**
 * Shared head builder for static/legal pages (audit A2).
 *
 * Each page gets its own distinct "GradeDate — <Page>" title, an honest
 * one-line description, and matching Open Graph / Twitter metadata. TanStack
 * merges route heads child-first (see headContentUtils buildTagsFromMatches),
 * so a route that provides its own head overrides the root default head and
 * the emitted HTML carries exactly one <title> and one set of description/OG
 * tags. The canonical link and og:url remain route-agnostic and are emitted by
 * RootDocument (resolveCanonicalSiteUrl), so pages built with this helper need
 * no hardcoded URL of their own.
 */
export function staticPageHead(title: string, description: string) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  };
}
