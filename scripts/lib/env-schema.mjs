/**
 * Pure validation logic for the R-09 environment contract.
 * Kept dependency-free so the same code runs locally and in CI.
 */

/** Keys declared in a .env.example text (comments and blanks ignored). */
export function exampleKeys(text) {
  return [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
}

/**
 * @returns {string[]} human-readable contract violations; empty means valid.
 */
export function validateContract({ schema, envExample, vercelManifest, renderManifest }) {
  const errors = [];
  const variables = schema?.variables ?? [];
  const keys = variables.map((v) => String(v.key));
  const known = new Set(keys);

  const dup = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (dup.length) errors.push(`duplicate schema keys: ${dup.join(", ")}`);

  for (const v of variables) {
    if (String(v.key).startsWith("NEXT_PUBLIC_") && v.secret === true) {
      errors.push(`public key must not be secret: ${v.key}`);
    }
    if (typeof v.secret !== "boolean") errors.push(`invalid secret flag: ${v.key}`);
    if (typeof v.required !== "boolean") errors.push(`invalid required flag: ${v.key}`);
    if (!Array.isArray(v.consumers) || v.consumers.length === 0) {
      errors.push(`missing consumers: ${v.key}`);
    }
  }

  const declared = new Set([
    ...exampleKeys(envExample),
    ...(vercelManifest?.variables ?? []).map((v) => String(v.key)),
    ...(renderManifest?.variables ?? []).map((v) => String(v.key)),
  ]);

  for (const k of declared) {
    if (!known.has(k)) errors.push(`undeclared env key: ${k}`);
  }
  for (const v of variables) {
    if (v.required === true && !declared.has(String(v.key))) {
      errors.push(`required key not declared anywhere: ${v.key}`);
    }
  }
  return errors;
}

/** Negative tests: each mutation MUST make the contract invalid. */
export function runSelfTest(base) {
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const failures = [];

  const cases = [
    {
      name: "unknown key in .env.example",
      mutate: (b) => {
        b.envExample += "\nUNDECLARED_FUTURE_KEY=1\n";
      },
    },
    {
      name: "duplicate schema key",
      mutate: (b) => {
        b.schema.variables.push(clone(b.schema.variables[0]));
      },
    },
    {
      name: "required key missing from declarations",
      mutate: (b) => {
        b.schema.variables.push({
          key: "REQUIRED_BUT_UNDECLARED",
          secret: false,
          required: true,
          consumers: ["somewhere"],
        });
      },
    },
    {
      name: "public key marked secret",
      mutate: (b) => {
        const v = b.schema.variables.find((x) => x.key === "NEXT_PUBLIC_SUPABASE_URL");
        v.secret = true;
      },
    },
    {
      name: "unknown key in Vercel manifest",
      mutate: (b) => {
        b.vercelManifest.variables.push({ key: "ROGUE_KEY", source: "constant:1" });
      },
    },
  ];

  const clean = validateContract(base);
  if (clean.length) failures.push(`baseline should be valid: ${clean.join("; ")}`);

  for (const c of cases) {
    const b = clone(base);
    c.mutate(b);
    const errs = validateContract(b);
    if (errs.length === 0) failures.push(`negative case did not fail: ${c.name}`);
  }
  return failures;
}
