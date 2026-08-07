import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

// Regression guard for the P0 Rules-of-Hooks violation that shipped in
// src/routes/matches.tsx: `fetchMatches` / `fetchLikesRemaining` (useCallback)
// and their two useEffect companions were declared AFTER the conditional
// returns (`if (loading || checking)`, `if (!user)`), so hook call order
// differed between renders and React could throw
// "Rendered more hooks than during the previous render" in development.
//
// This test parses the route file and asserts every hook call in the
// component body appears before the first statement that can early-return.
// It is deliberately static (no DOM) so it runs anywhere `bun test` runs.

const matchesRoutePath = path.join(import.meta.dir, "routes", "matches.tsx");

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

// Walk a top-level statement. Function-like nodes (including the root, e.g. a
// local `function` declaration) are boundaries: hooks/returns inside them
// belong to that nested function, not the component.
function walk(node: ts.Node, check: (n: ts.Node) => boolean): boolean {
  if (isFunctionLike(node)) return false;
  if (check(node)) return true;
  return node.getChildren().some((child) => walk(child, check));
}

function containsReturn(node: ts.Node): boolean {
  return walk(node, (n) => ts.isReturnStatement(n));
}

const HOOK_CALL_RE = /^use[A-Z]/;

function containsHookCall(node: ts.Node): boolean {
  return walk(
    node,
    (n) =>
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      HOOK_CALL_RE.test(n.expression.text),
  );
}

interface Violation {
  line: number;
  text: string;
}

function findComponentBody(
  sourceFile: ts.SourceFile,
  name: string,
): ts.Block | null {
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      statement.body
    ) {
      return statement.body;
    }
  }
  return null;
}

/** Statements (top-level) in the component body that call a hook. */
function hookStatements(body: ts.Block): ts.Statement[] {
  return body.statements.filter(containsHookCall);
}

/** Hook calls in statements that follow the first early-return statement. */
function violationsAfterEarlyReturn(
  sourceFile: ts.SourceFile,
  body: ts.Block,
): Violation[] {
  const found: Violation[] = [];
  let earlyReturned = false;
  for (const statement of body.statements) {
    if (containsReturn(statement)) earlyReturned = true;
    if (earlyReturned && containsHookCall(statement)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        statement.getStart(sourceFile),
      );
      found.push({
        line: line + 1,
        text: statement.getText(sourceFile).split("\n")[0].slice(0, 80),
      });
    }
  }
  return found;
}

describe("matches.tsx Rules of Hooks", () => {
  const sourceText = readFileSync(matchesRoutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    "matches.tsx",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const body = findComponentBody(sourceFile, "MatchesPage");

  test("component body exists and still calls hooks (no vacuous pass)", () => {
    expect(body).not.toBeNull();
    expect(body && hookStatements(body).length).toBeGreaterThan(3);
    expect(sourceText).toContain("const fetchMatches = useCallback");
    expect(sourceText).toContain("const fetchLikesRemaining = useCallback");
  });

  test("no hook is declared after a conditional return", () => {
    expect(body).not.toBeNull();
    expect(violationsAfterEarlyReturn(sourceFile, body!)).toEqual([]);
  });
});
