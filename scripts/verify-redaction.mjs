/**
 * R-08 acceptance test: prove env reconciliation reports never leak secret
 * values, value prefixes or raw upstream bodies, and that REPORT is read-only.
 *
 *   node scripts/verify-redaction.mjs
 *
 * Fully offline: network is replaced by scripts/test/mock-secret-fetch.mjs.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describeEnv, describeEnvVars, safeHttpError } from "./lib/env-report.mjs";

const SENTINEL = "SENTINEL_REDACTION_7f3a91c2";
const TARGETS = ["scripts/reconcile-vercel-env.mjs", "scripts/reconcile-render-env.mjs"];
const root = new URL("..", import.meta.url).pathname;
const mock = new URL("./test/mock-secret-fetch.mjs", import.meta.url).pathname;

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures += 1;
}

// 1. Pure helpers never echo a value or its prefix.
const env = {
  key: "OPENAI_API_KEY",
  value: SENTINEL,
  target: ["production"],
  type: "sensitive",
};
const line = describeEnv(env);
check(!line.includes(SENTINEL), "describeEnv omits the full value");
check(!line.includes(SENTINEL.slice(0, 6)), "describeEnv omits the value prefix");
check(line.includes("OPENAI_API_KEY"), "describeEnv still reports the key name");
check(
  !safeHttpError("write failed", 500).includes(SENTINEL),
  "safeHttpError drops the response body",
);
check(
  describeEnvVars([{ cursor: "c1", envVar: { key: "WORKER_TOKEN", value: SENTINEL } }])[0].includes(
    "WORKER_TOKEN",
  ),
  "Render {cursor, envVar} shape is unwrapped",
);

// 2. Static scan: no verbatim payloads, raw bodies or prefixes in source.
for (const file of TARGETS) {
  const src = readFileSync(`${root}${file}`, "utf8");
  check(!src.includes("JSON.stringify(envs"), `${file}: no verbatim env payload`);
  check(!src.includes("await r.text()"), `${file}: no raw response in errors`);
  check(!src.includes(".slice(0, 6)"), `${file}: no value-prefix formatting`);
  check(!src.includes("raw=${JSON.stringify"), `${file}: no raw service payload`);
}

// 3. Runtime: run both scripts in REPORT mode against the sentinel mock.
for (const file of TARGETS) {
  const r = spawnSync(process.execPath, ["--import", mock, file], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      REPORT: "1",
      VERCEL_TOKEN: "dummy",
      PROJECT_ID: "proj_test",
      PROJECT_NAME: "test",
      RENDER_API_KEY: "dummy",
    },
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  check(r.status === 0, `${file}: REPORT exits 0 (got ${r.status})`);
  check(!output.includes(SENTINEL), `${file}: stdout/stderr contains no full sentinel`);
  check(!output.includes(SENTINEL.slice(0, 6)), `${file}: no sentinel prefix`);
  check(!output.includes("WRITE_DETECTED"), `${file}: REPORT issued no write request`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall redaction checks passed");
process.exit(failures ? 1 : 0);
