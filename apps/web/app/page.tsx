export default function Home() {
  return (
    <main>
      <h1>issue-pilot 🤖</h1>
      <p>
        Pipeline skeleton. The chain to run green: Issue → Branch → PR → CI (lint/unit/api/build) →
        Merge → Staging Deploy → Smoke → Release → Production → Monitoring.
      </p>
      <ul>
        <li>
          <a href="/api/health">/api/health</a> — version + commit reporting (smoke target)
        </li>
        <li>
          <code>POST /api/triage</code> — {"{ issueNumber, title, body }"} → structured triage
          result
        </li>
      </ul>
    </main>
  );
}
