"""DeepEval-backed judge for LLM-as-judge metrics (G-Eval et al.).

Import is lazy on purpose: deepeval + its deps are an optional extra
(pip install -e 'workers/eval[judge]') so CI and keyless operation stay light.
Judge metrics require an OPENAI_API_KEY (or compatible) — that's the only
place in this worker where an LLM key is ever needed.
"""

from __future__ import annotations

from typing import Any

from ..protocols import EvalTask


class DeepEvalJudge:
    def supports(self, metric_type: str) -> bool:
        return metric_type == "geval"

    def grade(
        self, metric: dict[str, Any], task: EvalTask, output: dict[str, Any]
    ) -> dict[str, Any]:
        # Lazy import keeps the rest of the platform keyless/light.
        from deepeval.metrics import GEval  # noqa: PLC0415
        from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # noqa: PLC0415

        tc = LLMTestCase(
            input=str(task.input),
            actual_output=str(output),
            expected_output=str(task.expected),
        )
        m = GEval(
            name=str(metric.get("criteria") or "correctness"),
            criteria=str(metric.get("criteria") or "Correctness of the verdict."),
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.EXPECTED_OUTPUT,
            ],
            threshold=float(metric.get("threshold", 0.5)),
        )
        m.measure(tc)
        score = float(getattr(m, "score", 0.0) or 0.0)
        return {
            "metric": "geval",
            "score": score,
            "passed": bool(getattr(m, "success", score >= m.threshold)),
            "reason": str(getattr(m, "reason", ""))[:500],
        }
