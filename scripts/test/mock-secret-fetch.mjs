/**
 * Preloaded with `node --import` by verify-redaction.mjs. Replaces network
 * access with a deterministic payload containing a unique sentinel secret.
 * Any non-GET request is flagged so the verifier can prove REPORT is read-only.
 */
const SENTINEL = "SENTINEL_REDACTION_7f3a91c2";
const LEAKY_BODY = `upstream body ${SENTINEL}`;

const ok = (data) => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => LEAKY_BODY,
});

globalThis.fetch = async (url, opts) => {
  const method = (opts?.method ?? "GET").toUpperCase();
  if (method !== "GET") console.error("WRITE_DETECTED");
  const u = String(url);
  if (u.includes("api.vercel.com") && u.endsWith("/env")) {
    return ok({
      envs: [
        {
          id: "env_1",
          key: "OPENAI_API_KEY",
          value: SENTINEL,
          target: ["production"],
          type: "sensitive",
        },
      ],
    });
  }
  if (u.includes("api.render.com") && u.endsWith("/services")) {
    return ok([{ cursor: "c1", service: { id: "srv_1", name: "eval-worker" } }]);
  }
  if (u.includes("api.render.com") && u.includes("env-vars")) {
    return ok([{ cursor: "c1", envVar: { key: "WORKER_TOKEN", value: SENTINEL } }]);
  }
  return ok({});
};
