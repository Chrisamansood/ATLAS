// Synthetic fixed-wireless (FWA) cell capacity for the Nordwave twin. Invented areas, same seed, same data, every time.
// Read-only: it serves the facts the Capacity Watcher agent reasons over. The selling policy lives in the agent, not here.
import { mulberry32 } from "../../seed/lib/skills.mjs";

const AREAS = [
  ["Aurala", "North"], ["Brinkvik", "North"], ["Calmar Heights", "North"], ["Dalby East", "North"], ["Eskilby", "North"], ["Fjordgata", "North"],
  ["Granholm", "Central"], ["Havnby", "Central"], ["Isleby", "Central"], ["Joensuu Ridge", "Central"], ["Kvarnby", "Central"], ["Lindby", "Central"],
  ["Mariehaven", "Coast"], ["Norrvik", "Coast"], ["Oskarsby", "Coast"], ["Pohjala", "Coast"], ["Questa Bay", "Coast"], ["Rosendal", "Coast"],
  ["Sandvik", "South"], ["Tuulila", "South"], ["Ulvsby", "South"], ["Vasterby", "South"], ["Wikholm", "South"], ["Ylimaa", "South"]
];

export function generateCells({ seed = 20261020 } = {}) {
  const r = mulberry32(seed);
  return AREAS.map(([area, region], i) => {
    const capacity = 180 + Math.floor(r() * 220);                       // FWA connections the cell can carry at busy hour
    const x = r();
    const load = x < 0.5 ? 0.35 + r() * 0.35 : x < 0.8 ? 0.72 + r() * 0.12 : 0.85 + r() * 0.1; // roughly half comfortable, a third watched, the rest hot
    const active = Math.round(capacity * load);
    return {
      id: `NW-CELL-${String(i + 1).padStart(3, "0")}`, area, region, band: r() < 0.5 ? "n78 (3.5 GHz)" : "n28 + n78",
      fwa_capacity: capacity, fwa_active: active, utilisation_pct: Math.round((active / capacity) * 1000) / 10,
      pending_orders: Math.floor(r() * 12), trend_30d_pct: Math.round((r() * 8 - 2) * 10) / 10
    };
  });
}
