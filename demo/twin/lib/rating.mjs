// Exact rating in integer cents. No floating point reaches an amount; no model computes money.
export const money = (c) => `${c < 0 ? "-" : ""}${Math.trunc(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
export const toCents = (s) => Math.round(parseFloat(s) * 100);

export const ZONE_RATE_CENTS_PER_GB = { 1: 0, 2: 3000, 3: 4500 };   // zone 1 EU is included
export const OVERAGE_CENTS_PER_GB = 500;
export const PREMIUM_SMS_CENTS = 150;

export function rateMonth(plan, u) {
  const [dataMb, roamMb, zone, sms] = u;
  const lines = [{ item: plan.name, cents: plan.fee_cents }];
  if (plan.segment !== "prepaid" && plan.included_mb !== null && dataMb > plan.included_mb) {
    lines.push({ item: `Data over ${plan.included_mb / 1024} GB`, cents: Math.round(((dataMb - plan.included_mb) * OVERAGE_CENTS_PER_GB) / 1024) });
  }
  if (roamMb > 0 && ZONE_RATE_CENTS_PER_GB[zone] > 0) {
    lines.push({ item: `Roaming data, World Zone ${zone}, ${money(ZONE_RATE_CENTS_PER_GB[zone])} EUR/GB, ${(roamMb / 1024).toFixed(1)} GB`, cents: Math.round((roamMb * ZONE_RATE_CENTS_PER_GB[zone]) / 1024), kind: "roaming" });
  }
  if (sms > 0) lines.push({ item: `Premium SMS x${sms}`, cents: sms * PREMIUM_SMS_CENTS });
  return { lines, total_cents: lines.reduce((a, l) => a + l.cents, 0) };
}
