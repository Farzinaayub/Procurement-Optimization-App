// JavaScript port of artifacts/api-server/backend/optimizer.py (PuLP model).
// The model has only two products and two suppliers, so it is solved exactly by
// enumerating Supplier A's total allocation t; for a fixed t the cost is linear
// in X_A, so the optimum is at an end of X_A's feasible range.
export const DEFAULTS = {
  demand_x: 100, demand_y: 80, supplier_a_capacity: 40, supplier_b_capacity: 180,
  max_average_delivery: 3.5, x_cost_a: 10, x_cost_b: 15, y_cost_a: 12, y_cost_b: 10,
  shipping_a: 300, shipping_b: 100, delivery_a: 5, delivery_b: 2,
};
const INT_FIELDS = ["demand_x", "demand_y", "supplier_a_capacity", "supplier_b_capacity"];

export function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be a JSON object." };
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return { error: `${key} is required and must be a number.` };
    if (v < 0) return { error: `${key} must be greater than or equal to 0.` };
    if (INT_FIELDS.includes(key) && !Number.isInteger(v)) return { error: `${key} must be a whole number.` };
    out[key] = v;
  }
  return { value: out };
}

export function optimizeProcurement(p) {
  const dx = p.demand_x, dy = p.demand_y, D = dx + dy;
  const capA = p.supplier_a_capacity, capB = p.supplier_b_capacity;
  let best = null;
  const tMax = Math.min(capA, D);
  if (tMax > 5_000_000) throw new Error("Scenario is too large for the hosted solver.");
  for (let t = Math.max(0, D - capB); t <= tMax; t++) {
    const tb = D - t;
    if (p.delivery_a * t + p.delivery_b * tb > p.max_average_delivery * D + 1e-9) continue;
    const lo = Math.max(0, t - dy), hi = Math.min(dx, t);
    if (lo > hi) continue;
    const coef = p.x_cost_a - p.x_cost_b - p.y_cost_a + p.y_cost_b;
    const XA = coef < 0 ? hi : lo;
    const YA = t - XA, XB = dx - XA, YB = dy - YA;
    const SA = t > 0 ? 1 : 0, SB = tb > 0 ? 1 : 0;
    const purchase = p.x_cost_a * XA + p.x_cost_b * XB + p.y_cost_a * YA + p.y_cost_b * YB;
    const shipping = p.shipping_a * SA + p.shipping_b * SB;
    const total = purchase + shipping;
    if (!best || total < best.total - 1e-9) best = { XA, YA, XB, YB, SA, SB, purchase, shipping, total };
  }
  if (!best) return { status: "Infeasible", message: "No feasible optimal solution was found." };
  const allocationA = best.XA + best.YA, allocationB = best.XB + best.YB;
  return {
    status: "Optimal",
    allocation: {
      supplier_a: { x: best.XA, y: best.YA, total: allocationA },
      supplier_b: { x: best.XB, y: best.YB, total: allocationB },
    },
    cost: { purchase: best.purchase, shipping: best.shipping, total: best.total },
    delivery: {
      average_days: D === 0 ? 0 : (p.delivery_a * allocationA + p.delivery_b * allocationB) / D,
      maximum_allowed_days: p.max_average_delivery,
    },
    supplier_usage: { supplier_a: best.SA, supplier_b: best.SB },
  };
}
