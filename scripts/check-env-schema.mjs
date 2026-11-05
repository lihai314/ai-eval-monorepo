#!/usr/bin/env node
/**
 * R-09: enforce the single machine-readable environment contract.
 *
 *   node scripts/check-env-schema.mjs               # validate the repo
 *   node scripts/check-env-schema.mjs --self-test    # negative tests
 *
 * Unknown keys, duplicate keys, public secrets, missing required declarations
 * and missing consumer metadata all fail with exit 1. No values are printed.
 */
import { readFileSync } from "node:fs";
import { runSelfTest, validateContract } from "./lib/env-schema.mjs";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const loadJson = (path) => JSON.parse(read(path));

const base = {
  schema: loadJson("infra/env.schema.json"),
  envExample: read(".env.example"),
  vercelManifest: loadJson("infra/vercel-env-manifest.json"),
  renderManifest: loadJson("infra/render-env-manifest.json"),
};

if (process.argv.includes("--self-test")) {
  const failures = runSelfTest(base);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log("env contract: baseline + 5 negative cases PASSED");
  process.exit(0);
}

const errors = validateContract(base);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(`env contract OK: ${base.schema.variables.length} keys declared`);
