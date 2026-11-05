/**
 * Reconcile a Render service's env vars from infra/render-env-manifest.json.
 * Driven by admin-render-env.yml.
 *
 * Sources: "secret:<GitHub secret>" (injected as an env var). PUT per key
 * (upsert) via the Render API. REPORT=1 lists the service id + current env
 * without writing — run it first, the JSON shape is printed verbatim so any
 * API drift is visible before we write. #62
 */

import { readFileSync } from "node:fs";
import { describeEnvVars, missingSource, safeHttpError } from "./lib/env-report.mjs";

const token = process.env.RENDER_API_KEY ?? "";
const reportOnly = process.env.REPORT === "1" || process.env.REPORT === "true";
const manifest = JSON.parse(
  readFileSync(new URL("../infra/render-env-manifest.json", import.meta.url), "utf8"),
);
const serviceName = manifest.service;

const API = "https://api.render.com/v1";
const auth = { authorization: `Bearer ${token}` };

async function getServiceId() {
  const r = await fetch(`${API}/services`, { headers: auth });
  if (!r.ok) throw new Error(safeHttpError("list services failed", r.status));
  const j = await r.json();
  // Response is an array of {cursor, service}; unwrap to the service objects.
  const services = Array.isArray(j) ? j.map((s) => s.service ?? s) : (j.services ?? []);
  const found = services.find((s) => s.name === serviceName);
  if (!found) {
    const names = services
      .slice(0, 20)
      .map((s) => `${s.name}(${s.id})`)
      .join(", ");
    throw new Error(
      `service '${serviceName}' not found; first=${names || "(empty)"} (raw response suppressed)`,
    );
  }
  return found.id;
}

async function listEnvVars(serviceId) {
  const r = await fetch(`${API}/services/${serviceId}/env-vars`, { headers: auth });
  if (!r.ok) throw new Error(safeHttpError("list env vars failed", r.status));
  return r.json();
}

const serviceId = await getServiceId();
console.log(`serviceId=${serviceId} (${serviceName})`);

if (reportOnly) {
  // Read-only: key names / metadata only. The verbatim payload may contain
  // secret values, so it is never printed (learned in the 2026-10-23 audit).
  const envs = await listEnvVars(serviceId);
  const lines = describeEnvVars(envs);
  console.log(`current env-vars (metadata only, ${lines.length} keys):`);
  for (const line of lines) console.log(line);
  process.exit(0);
}

const missing = [];
for (const v of manifest.variables) {
  const name = v.source.slice(v.source.indexOf(":") + 1);
  const value = process.env[name] ?? "";
  if (!value) {
    missing.push(v.key);
    console.log(missingSource("render", v.key));
    continue;
  }
  const r = await fetch(`${API}/services/${serviceId}/env-vars/${v.key}`, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ value, envVarType: "secret" }),
  });
  const detail = r.status < 300 ? "" : ` ${safeHttpError("write failed", r.status)}`;
  console.log(`  ${v.key}: HTTP ${r.status}${detail}`);
  if (r.status >= 300) process.exit(1);
}
if (missing.length) {
  console.error(
    `render: ${missing.length} manifest key(s) had no source (${missing.join(", ")}) — reconcile incomplete`,
  );
  process.exit(1);
}
