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
  if (!r.ok) throw new Error(`list services failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const services = Array.isArray(j) ? j : (j.services ?? []);
  const found = services.find((s) => s.name === serviceName);
  if (!found) throw new Error(`service '${serviceName}' not found`);
  return found.id;
}

async function listEnvVars(serviceId) {
  const r = await fetch(`${API}/services/${serviceId}/env-vars`, { headers: auth });
  if (!r.ok) throw new Error(`list env vars failed: ${r.status} ${await r.text()}`);
  return r.json();
}

const serviceId = await getServiceId();
console.log(`serviceId=${serviceId} (${serviceName})`);

if (reportOnly) {
  const envs = await listEnvVars(serviceId);
  // Print verbatim (truncated) so the real API shape is visible before writes.
  console.log("current env-vars (verbatim):");
  console.log(JSON.stringify(envs, null, 2).slice(0, 2500));
  process.exit(0);
}

for (const v of manifest.variables) {
  const name = v.source.slice(v.source.indexOf(":") + 1);
  const value = process.env[name] ?? "";
  if (!value) {
    console.log(`  ${v.key}: source (${name}) empty — skipping`);
    continue;
  }
  const r = await fetch(`${API}/services/${serviceId}/env-vars/${v.key}`, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ value, envVarType: "secret" }),
  });
  const detail = r.status < 300 ? "" : ` ${(await r.text()).slice(0, 200)}`;
  console.log(`  ${v.key}: HTTP ${r.status}${detail}`);
  if (r.status >= 300) process.exit(1);
}
