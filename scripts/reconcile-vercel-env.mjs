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
  if (!r.ok) throw new Error(`list env failed: ${r.status} ${await r.text()}`);
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
    if (!r.ok) throw new Error(`supabase api-keys failed: ${r.status}`);
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
  console.log(`${project} current env (value = first 6 chars):`);
  for (const e of envs) {
    const v = e.value ?? "";
    console.log(
      `  ${e.key} target=${JSON.stringify(e.target)} type=${e.type} value=${v.length > 6 ? `${v.slice(0, 6)}...` : v}`,
    );
  }
  process.exit(0);
}

for (const v of manifest.variables) {
  const value = await resolve(v.source);
  if (!value) {
    console.log(`${project} ${v.key}: source empty — skipping`);
    continue;
  }
  const existing = envs.find((e) => e.key === v.key);
  const url = existing ? `${API}/${projectId}/env/${existing.id}` : `${API}/${projectId}/env`;
  const body = existing
    ? { value, type: v.type, target: v.target }
    : { key: v.key, value, type: v.type, target: v.target };
  const r = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const detail = r.status < 300 ? "" : ` ${(await r.text()).slice(0, 200)}`;
  console.log(`${project} ${v.key}: HTTP ${r.status}${detail}`);
  if (r.status >= 300) process.exit(1);
}
