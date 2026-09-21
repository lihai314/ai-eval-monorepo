/**
 * Smoke test for the jev-ai System One integration (#62).
 * Usage: JEV_API_KEY=... pnpm tsx scripts/jev-smoke.mts
 * Exits 1 when the key is missing or the API call fails.
 */
import { callSystemOne, getJevCredits, getJevFromEnv } from "@ai-eval/agent";

const opts = getJevFromEnv(process.env);
if (!opts) {
  console.error("jev-smoke: JEV_API_KEY is not set — skipping (jev feature stays disabled).");
  process.exit(1);
}

// The canonical example from the jev docs — exercises noul + choice + score in one call.
const result = await callSystemOne(
  "Help! My payouts have been failing for 3 days.",
  {
    is_urgent: { type: "noul", instructions: "Does this convey urgency?" },
    department: {
      type: "choice",
      instructions: "Which team should handle this?",
      criteria: {
        billing: "Payments and refunds",
        technical: "Bugs and outages",
        sales: "Pricing",
      },
    },
    frustration: {
      type: "score",
      instructions: "How frustrated is the customer?",
      criteria: ["Calm", "Frustrated", "Very angry"],
    },
  },
  opts,
);

console.log(`MODEL: ${result.model}`);
console.log("ANSWERS:", JSON.stringify(result.answers, null, 2));
console.log("USAGE:", JSON.stringify(result.usage, null, 2));

try {
  const credits = await getJevCredits(opts.apiKey, opts.baseUrl);
  console.log(`CREDITS: ${credits}`);
} catch (err) {
  console.warn("credits lookup failed:", err instanceof Error ? err.message : err);
}
