import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanRepository, type ScanOptions } from "./scanner.js";
import type { ScanSummary } from "./types.js";

export interface GitHubRepositoryResult {
  name: string;
  url: string;
  defaultBranch: string;
  archived: boolean;
  summary: ScanSummary;
  score: number;
  status: "healthy" | "attention" | "critical" | "unavailable";
  error?: string;
}

export interface GitHubPortfolioReport {
  schemaVersion: 1;
  owner: string;
  generatedAt: string;
  repositories: GitHubRepositoryResult[];
  totals: { repositories: number; healthy: number; attention: number; critical: number; unavailable: number; errors: number; warnings: number; info: number };
}

export interface GitHubPortfolioOptions {
  token?: string;
  limit?: number;
  includeArchived?: boolean;
  scan?: Pick<ScanOptions, "preset" | "failOn">;
  apiUrl?: string;
}

interface GitHubRepository {
  name: string;
  html_url: string;
  default_branch: string;
  archived: boolean;
}

interface GitTreeEntry { path: string; type: "blob" | "tree"; url: string }

const HEALTH_PATHS = new Set([
  "README.md", "README.rst", "README.txt", "README", "LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "SECURITY.md", ".github/SECURITY.md", "CONTRIBUTING.md", ".github/CONTRIBUTING.md",
  "CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS", ".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/config.yml", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/dependabot.yml", ".renovaterc", ".renovaterc.json", "renovate.json", "CHANGELOG.md", "SUPPORT.md",
  "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb",
]);

export async function analyzeGitHubOwner(owner: string, options: GitHubPortfolioOptions = {}): Promise<GitHubPortfolioReport> {
  const repositories = await listRepositories(owner, options);
  const results: GitHubRepositoryResult[] = [];
  for (const repository of repositories) {
    try {
      results.push(await analyzeRepository(owner, repository, options));
    } catch (error: unknown) {
      results.push({
        name: repository.name,
        url: repository.html_url,
        defaultBranch: repository.default_branch,
        archived: repository.archived,
        summary: emptySummary(),
        score: 0,
        status: "unavailable",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  results.sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));
  return {
    schemaVersion: 1,
    owner,
    generatedAt: new Date().toISOString(),
    repositories: results,
    totals: {
      repositories: results.length,
      healthy: results.filter((repository) => repository.status === "healthy").length,
      attention: results.filter((repository) => repository.status === "attention").length,
      critical: results.filter((repository) => repository.status === "critical").length,
      unavailable: results.filter((repository) => repository.status === "unavailable").length,
      errors: sum(results, "errors"), warnings: sum(results, "warnings"), info: sum(results, "info"),
    },
  };
}

export function formatGitHubPortfolioHtml(report: GitHubPortfolioReport): string {
  const rows = report.repositories.map((repo) => `<tr><td><a href="${escapeHtml(repo.url)}">${escapeHtml(repo.name)}</a>${repo.archived ? " <small>archived</small>" : ""}${repo.error ? `<br><small>${escapeHtml(repo.error)}</small>` : ""}</td><td><span class="status ${repo.status}">${repo.status}</span></td><td>${repo.score}</td><td>${repo.summary.errors}</td><td>${repo.summary.warnings}</td><td>${repo.summary.info}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenMaintainer portfolio</title><style>:root{color-scheme:dark;font-family:Inter,system-ui;background:#07111f;color:#e5e7eb}body{margin:0;padding:32px}.shell{max-width:1100px;margin:auto}.hero{background:linear-gradient(135deg,#172554,#581c87);padding:28px;border-radius:24px}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metrics span,.status{padding:7px 11px;border-radius:999px;font-weight:700;background:#172033}.critical,.unavailable{background:#7f1d1d}.attention{background:#78350f}.healthy{background:#14532d}table{margin-top:24px;width:100%;border-collapse:collapse;background:#0f172a;border-radius:18px;overflow:hidden}th,td{text-align:left;padding:14px;border-bottom:1px solid #293548}a{color:#67e8f9}small{color:#94a3b8}@media(max-width:700px){body{padding:12px}table{display:block;overflow:auto}}</style></head><body><main class="shell"><section class="hero"><h1>${escapeHtml(report.owner)} repository portfolio</h1><div class="metrics"><span>${report.totals.repositories} repositories</span><span>${report.totals.critical} critical</span><span>${report.totals.attention} need attention</span><span>${report.totals.healthy} healthy</span><span>${report.totals.unavailable} unavailable</span></div></section><table><thead><tr><th>Repository</th><th>Status</th><th>Score</th><th>Errors</th><th>Warnings</th><th>Info</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>\n`;
}

async function listRepositories(owner: string, options: GitHubPortfolioOptions): Promise<GitHubRepository[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  const perPage = Math.min(limit, 100);
  let repositories: GitHubRepository[] = [];
  for (let page = 1; repositories.length < limit; page += 1) {
    let response = await githubFetch(`${api(options)}/orgs/${encodeURIComponent(owner)}/repos?type=all&sort=full_name&per_page=${perPage}&page=${page}`, options.token);
    if (response.status === 404 && page === 1) response = await githubFetch(`${api(options)}/users/${encodeURIComponent(owner)}/repos?type=owner&sort=full_name&per_page=${perPage}&page=${page}`, options.token);
    if (!response.ok) throw new Error(githubError(`Could not list repositories for ${owner}`, response, options.token));
    const pageItems = await response.json() as GitHubRepository[];
    repositories.push(...pageItems);
    if (pageItems.length < perPage) break;
  }
  repositories = repositories.slice(0, limit);
  return options.includeArchived ? repositories : repositories.filter((repository) => !repository.archived);
}

async function analyzeRepository(owner: string, repository: GitHubRepository, options: GitHubPortfolioOptions): Promise<GitHubRepositoryResult> {
  const temporary = await mkdtemp(join(tmpdir(), "openmaintainer-github-"));
  try {
    const treeResponse = await githubFetch(`${api(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.name)}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, options.token);
    if (!treeResponse.ok) throw new Error(githubError(`Could not read ${owner}/${repository.name}`, treeResponse, options.token));
    const tree = await treeResponse.json() as { tree?: GitTreeEntry[] };
    const selected = (tree.tree ?? []).filter((entry) => entry.type === "blob" && isRelevant(entry.path));
    for (const entry of selected) {
      const blobResponse = await githubFetch(entry.url, options.token);
      if (!blobResponse.ok) continue;
      const blob = await blobResponse.json() as { content?: string; encoding?: string };
      if (blob.encoding !== "base64" || !blob.content) continue;
      const destination = join(temporary, entry.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(blob.content.replaceAll("\n", ""), "base64"));
    }
    const report = await scanRepository(temporary, { ...options.scan, baseline: false });
    const score = Math.max(0, 100 - report.summary.errors * 15 - report.summary.warnings * 5 - report.summary.info);
    return { name: repository.name, url: repository.html_url, defaultBranch: repository.default_branch, archived: repository.archived, summary: report.summary, score, status: score < 60 ? "critical" : score < 85 ? "attention" : "healthy" };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function isRelevant(path: string): boolean {
  return HEALTH_PATHS.has(path) || /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path) || /^\.github\/PULL_REQUEST_TEMPLATE\/[^/]+\.md$/i.test(path) || /^\.github\/ISSUE_TEMPLATE\/[^/]+\.ya?ml$/i.test(path);
}

function githubFetch(url: string, token?: string): Promise<Response> {
  return fetch(url, { headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}), "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "openmaintainer" } });
}

function api(options: GitHubPortfolioOptions): string { return options.apiUrl ?? "https://api.github.com"; }
function sum(results: GitHubRepositoryResult[], key: keyof ScanSummary): number { return results.reduce((total, repository) => total + repository.summary[key], 0); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

function githubError(prefix: string, response: Response, token?: string): string {
  const rateLimited = response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
  const guidance = rateLimited && !token ? " Set GITHUB_TOKEN to increase the API rate limit." : "";
  return `${prefix}: GitHub returned ${response.status}.${guidance}`;
}

function emptySummary(): ScanSummary {
  return { errors: 0, warnings: 0, info: 0, newFindings: 0, existingFindings: 0, resolvedFindings: 0 };
}
