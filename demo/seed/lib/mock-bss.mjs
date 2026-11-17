// The mock BSS: one fixture file per workflow, grouped by the system that would answer (customer, charging, catalogue, policy...).
// Served read-only by the Explorer server at /mock/<workflow>/<system> so Sim's API blocks have something real to call.
export function mockBss(fixtures, system) {
  if (!fixtures || typeof fixtures !== "object" || typeof system !== "string") return null;
  return Object.hasOwn(fixtures, system) ? fixtures[system] : null;
}
