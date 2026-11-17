// Pure replay arithmetic shared by the Decisions page (served to the browser) and its tests.
// A decision is answered locally when its confidence reaches the frozen threshold; otherwise it goes to the LLM.
export function outcomeOf(row, threshold) {
  if (threshold === null || threshold === undefined || row.conf < threshold) return "llm";
  return row.truth === row.pred ? "local-correct" : "local-wrong";
}

export function replayState(rows, { threshold, tokensPerDecision }, k) {
  const n = Math.max(0, Math.min(k, rows.length));
  let correct = 0, wrong = 0, escalated = 0;
  for (let i = 0; i < n; i++) { const o = outcomeOf(rows[i], threshold); if (o === "local-correct") correct++; else if (o === "local-wrong") wrong++; else escalated++; }
  const answered = correct + wrong;
  return { seen: n, answered, correct, wrong, escalated, coverage: n ? answered / n : 0, answeredAccuracy: answered ? correct / answered : null, tokensAvoided: answered * tokensPerDecision };
}

// Money only from a price the viewer typed in. No price, no figure.
export function euros(tokens, pricePerMillionTokens) {
  const p = typeof pricePerMillionTokens === "string" && pricePerMillionTokens.trim() !== "" ? Number(pricePerMillionTokens) : pricePerMillionTokens;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0) return null;
  return (tokens / 1_000_000) * p;
}
