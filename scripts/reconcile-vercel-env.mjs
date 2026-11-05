/**
 * Reconcile a Vercel project's env vars from infra/vercel-env-manifest.json.
 * Driven by admin-vercel-env.yml (staging + production matrix).
 *
 * Value sources: "secret:<GH secret>" / "variable:<GH variable>" (injected as
 * env vars), "constant:<literal>", "supabase:anon" (Supabase Management API).
 * PATCH if the key exists, POST if absent — Vercel's ?upsert=true can't update
 * an existing var (ENV_ALREADY_EXISTS, learned on #62).
 * REPORT=1 lists current env and exits without writing.
 */

import { readFileSync } from "node:fs";
import { describeEnv, missingSource, safeHttpError } from "./lib/env-report.mjs";

const token = process.env.VERCEL_TOKEN ?? "";
const projectId = process.env.PROJECT_ID ?? "";
const project = process.env.PROJECT_NAME ?? "?";
const reportOnly = process.env.REPORT === "1" || process.env.REPORT === "true";
const manifest = JSON.parse(
  readFileSync(new URL("../infra/vercel-env-manifest.json", import.meta.url), "utf8"),
);

const API = "https://api.vercel.com/v9/projects";
const auth = { authorization: `Bearer ${token}` };

async function listEnv() {
  const r = await fetch(`${API}/${projectId}/env`, { headers: auth });
  if (!r.ok) throw new Error(safeHttpError("list env failed", r.status));
  const j = await r.json();
  return j.envs ?? [];
}

async function resolve(source) {
  if (source.startsWith("constant:")) return source.slice("constant:".length);
  if (source === "supabase:anon") {
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/api-keys`,
      { headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } },
    );
    if (!r.ok) throw new Error(safeHttpError("supabase api-keys failed", r.status));
    const keys = await r.json();
    return keys.find((k) => k.name === "anon")?.api_key ?? "";
  }
  // secret:NAME / variable:NAME -> the value was injected as an env var named NAME
  const name = source.slice(source.indexOf(":") + 1);
  return process.env[name] ?? "";
}

const envs = await listEnv();

// verify mode: exit 1 listing manifest keys missing from the project (drift-check)
if (process.argv[2] === "verify") {
  const keys = new Set(envs.map((e) => e.key));
  const missing = manifest.variables.map((v) => v.key).filter((k) => !keys.has(k));
  if (missing.length) {
    console.log(`${project} MISSING from Vercel: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`${project} env manifest ok (${manifest.variables.length} keys)`);
  process.exit(0);
}

if (reportOnly) {
  // Read-only: only key names, targets and types. Never values or prefixes.
  console.log(`${project} current env (metadata only, ${envs.length} keys):`);
  for (const e of envs) console.log(describeEnv(e));
  process.exit(0);
}

const missing = [];
for (const v of manifest.variables) {
  const existing = envs.find((e) => e.key === v.key);
  let value;
  try {
    value = await resolve(v.source);
  } catch (err) {
    // A broken optional source (e.g. Supabase Management API 401) must not
    // block syncing unrelated keys when the var already exists remotely.
    if (existing) {
      console.log(
        `${project} ${v.key}: kept (source unavailable — ${err instanceof Error ? err.message : "error"})`,
      );
      continue;
    }
    missing.push(v.key);
    console.log(missingSource(project, v.key));
    continue;
  }
  if (!value) {
    missing.push(v.key);
    console.log(missingSource(project, v.key));
    continue;
  }
  const url = existing ? `${API}/${projectId}/env/${existing.id}` : `${API}/${projectId}/env`;
  const body = existing
    ? { value, type: v.type, target: v.target }
    : { key: v.key, value, type: v.type, target: v.target };
  const r = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const detail = r.status < 300 ? "" : ` ${safeHttpError("write failed", r.status)}`;
  console.log(`${project} ${v.key}: HTTP ${r.status}${detail}`);
  if (r.status >= 300) process.exit(1);
}
if (missing.length) {
  console.error(
    `${project}: ${missing.length} manifest key(s) had no source (${missing.join(", ")}) — reconcile incomplete`,
  );
  process.exit(1);
}
