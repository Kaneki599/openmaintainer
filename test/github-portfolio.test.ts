import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGitHubOwner, formatGitHubPortfolioHtml } from "../src/github-portfolio.js";

test("builds a portfolio from GitHub repository metadata and selected files", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/orgs/example/repos")) return Response.json([{ name: "demo", html_url: "https://github.com/example/demo", default_branch: "main", archived: false }]);
    if (url.includes("/git/trees/main")) return Response.json({ tree: [
      { path: "README.md", type: "blob", url: "https://api.test/blob/readme" },
      { path: "LICENSE", type: "blob", url: "https://api.test/blob/license" },
      { path: ".github/workflows/ci.yml", type: "blob", url: "https://api.test/blob/workflow" },
    ] });
    if (url.endsWith("/blob/readme")) return Response.json({ encoding: "base64", content: Buffer.from("# Demo").toString("base64") });
    if (url.endsWith("/blob/license")) return Response.json({ encoding: "base64", content: Buffer.from("MIT").toString("base64") });
    if (url.endsWith("/blob/workflow")) return Response.json({ encoding: "base64", content: Buffer.from("name: CI\npermissions:\n  contents: read\njobs: {}\n").toString("base64") });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const report = await analyzeGitHubOwner("example", { apiUrl: "https://api.test", limit: 1, scan: { preset: "starter" } });
  assert.equal(report.totals.repositories, 1);
  assert.equal(report.repositories[0]?.name, "demo");
  assert.match(formatGitHubPortfolioHtml(report), /example repository portfolio/);
});

test("keeps unavailable repositories in the portfolio without aborting the owner scan", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/orgs/example/repos")) return Response.json([{ name: "empty", html_url: "https://github.com/example/empty", default_branch: "main", archived: false }]);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const report = await analyzeGitHubOwner("example", { apiUrl: "https://api.test", limit: 1 });
  assert.equal(report.totals.unavailable, 1);
  assert.equal(report.repositories[0]?.status, "unavailable");
  assert.match(report.repositories[0]?.error ?? "", /GitHub returned 404/);
});

test("explains anonymous GitHub API rate limits", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async () => new Response("rate limited", { status: 403, headers: { "x-ratelimit-remaining": "0" } })) as typeof fetch;
  await assert.rejects(analyzeGitHubOwner("example", { apiUrl: "https://api.test", limit: 1 }), /Set GITHUB_TOKEN/);
});
