import { describe, expect, test } from "bun:test";

process.env.PUBLIC_SITE_ORIGIN = "https://gradedate.app";
import {
  clientSiteOrigin,
  originFromUrl,
  resolveSiteOrigin,
  resolveSiteUrl,
  ssrRequestOrigin,
} from "./site-url";

describe("originFromUrl", () => {
  test("returns the origin of a full URL, stripping path/query", () => {
    expect(originFromUrl("https://gradedate.app/grade?ref=ABC")).toBe("https://gradedate.app");
    expect(originFromUrl("https://example.vercel.app/api/x")).toBe("https://example.vercel.app");
    expect(originFromUrl("https://localhost:3000/grade")).toBe("https://localhost:3000");
  });

  test("handles trailing slashes (origin never has one)", () => {
    expect(originFromUrl("https://gradedate.app/")).toBe("https://gradedate.app");
    expect(originFromUrl("https://gradedate.app")).toBe("https://gradedate.app");
  });

  test("rejects non-http(s) protocols and garbage", () => {
    expect(originFromUrl("ftp://gradedate.app/x")).toBeNull();
    expect(originFromUrl("javascript:alert(1)")).toBeNull();
    expect(originFromUrl("mailto:support@gradedate.app")).toBeNull();
    expect(originFromUrl("not a url")).toBeNull();
    expect(originFromUrl("/relative/path")).toBeNull();
  });

  test("rejects null/undefined/empty input", () => {
    expect(originFromUrl(null)).toBeNull();
    expect(originFromUrl(undefined)).toBeNull();
    expect(originFromUrl("")).toBeNull();
  });
});

describe("ssrRequestOrigin", () => {
  test("returns null outside an SSR request scope (unit-test env)", () => {
    expect(ssrRequestOrigin()).toBeNull();
  });
});

describe("clientSiteOrigin", () => {
  test("returns null when no window is available (unit-test env)", () => {
    expect(clientSiteOrigin()).toBeNull();
  });
});

describe("resolveSiteOrigin", () => {
  test("prefers the explicit request URL origin", () => {
    expect(resolveSiteOrigin("https://staging.example.com/api/referral")).toBe("https://gradedate.app");
    expect(resolveSiteOrigin("http://localhost:3000/api/referral")).toBe("https://gradedate.app");
  });

  test("falls back to null when nothing is available", () => {
    expect(resolveSiteOrigin(undefined)).toBe("https://gradedate.app");
    expect(resolveSiteOrigin(null)).toBe("https://gradedate.app");
    expect(resolveSiteOrigin("garbage")).toBe("https://gradedate.app");
  });
});

describe("resolveSiteUrl", () => {
  test("joins the request origin with the path", () => {
    expect(resolveSiteUrl("/signup?ref=ABC123", "https://gradedate.app/api/referral")).toBe(
      "https://gradedate.app/signup?ref=ABC123",
    );
    expect(resolveSiteUrl("/grade", "https://example.vercel.app/x")).toBe("https://gradedate.app/grade");
  });

  test("normalizes a path without a leading slash", () => {
    expect(resolveSiteUrl("grade", "https://gradedate.app/api")).toBe("https://gradedate.app/grade");
  });

  test("returns null when no origin can be resolved", () => {
    expect(resolveSiteUrl("/grade", null)).toBe("https://gradedate.app/grade");
    expect(resolveSiteUrl("/grade")).toBe("https://gradedate.app/grade");
  });
});

import { describe, expect, test } from "bun:test";
import { normalizeSitePath, originFromUrl, resolveCanonicalSiteUrl } from "./site-url";

describe("canonical site URLs", () => {
  test.each([
    ["/", "/"],
    ["/terms?ref=nav#top", "/terms"],
    ["privacy/", "/privacy"],
    ["/profile/abc/?tab=photos", "/profile/abc"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeSitePath(input)).toBe(expected);
  });

  test("uses the current request origin and pathname", () => {
    expect(resolveCanonicalSiteUrl("/terms?utm_source=x#top", "https://preview.example/terms?utm_source=x")).toBe(
      "https://gradedate.app/terms",
    );
    expect(resolveCanonicalSiteUrl("/privacy", "https://preview.example/private?x=1#hash")).toBe(
      "https://gradedate.app/privacy",
    );
  });

  test("rejects unsafe origins and has no origin fallback", () => {
    expect(originFromUrl("javascript:alert(1)")).toBeNull();
    expect(resolveCanonicalSiteUrl("/terms", "//untrusted.example/terms")).toBe("https://gradedate.app/terms");
  });
});
