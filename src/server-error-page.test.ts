import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { unexpectedErrorHtml, unexpectedErrorResponse } from "./server-error-page";

describe("document error states", () => {
  test("unexpected error response is a safe branded HTML 500", async () => {
    const response = unexpectedErrorResponse("request-123");
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-request-id")).toBe("request-123");
    expect(html).toContain("<h1 id=\"error-title\">Something went wrong</h1>");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("Internal Server Error");
    expect(html).not.toContain("stack");
  });

  test("root not-found state is accessible and preserves navigation semantics", async () => {
    const source = await readFile(new URL("./routes/__root.tsx", import.meta.url), "utf8");

    expect(source).toContain("notFoundComponent: NotFoundState");
    expect(source).toContain('aria-labelledby="not-found-title"');
    expect(source).toContain('<h1 id="not-found-title"');
    expect(source).toContain('to="/"');
    expect(source).toContain("window.history.back()");
  });

  test("error page renderer remains deterministic", () => {
    expect(unexpectedErrorHtml()).toContain("GradeDate");
  });
});
