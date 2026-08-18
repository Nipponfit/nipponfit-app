/* =====================================================================
   NIPPON FIT — reference data
   ---------------------------------------------------------------------
   Dojos, belts, fee plans and the timetable. Every screen needs some of
   this, so it is fetched once and kept.

   In the old app this was passed around as a property called "ref",
   which React reserves for its own use and silently threw away. That is
   what made every screen blank. Here it is a plain module that screens
   import directly, so there is nothing to pass and nothing to lose.
   ===================================================================== */

import * as db from "./db.js";

let cache = null;

export async function reference({ reload = false } = {}) {
  if (cache && !reload) return cache;

  const [belts, dojos, plans, sessions] = await Promise.all([
    db.select("belts", { order: "sort_order" }),
    db.select("dojos", { order: "name" }),
    db.select("fee_plans"),
    db.select("sessions"),
  ]);

  cache = {
    belts,
    dojos,
    plans,
    sessions,
    beltById: Object.fromEntries(belts.map((b) => [b.id, b])),
    dojoById: Object.fromEntries(dojos.map((d) => [d.id, d])),
    planById: Object.fromEntries(plans.map((p) => [p.id, p])),
  };
  return cache;
}

export const forget = () => { cache = null; };

/* ------------------------------------------------------------------ */
/* Working out what a student owes                                     */
/* ------------------------------------------------------------------ */

/* Base plan plus any add-on such as Elite squad, plus GST at Dravid
   only. Mirrors amount_due() in the database so both agree. */
export function feeFor(student, ref, addonPlanIds = []) {
  const dojo = ref.dojoById[student.dojo_id];
  const plan = ref.planById[student.plan_id];

  const lines = [];
  let subtotal = 0;

  if (plan) {
    lines.push({ label: plan.label, amount: Number(plan.fee) });
    subtotal += Number(plan.fee);
  }

  for (const id of addonPlanIds) {
    const addon = ref.planById[id];
    if (!addon) continue;
    lines.push({ label: addon.label + " (add-on)", amount: Number(addon.fee) });
    subtotal += Number(addon.fee);
  }

  const gst = dojo?.gst_applies ? Math.round(subtotal * 0.18) : 0;

  return {
    ok: Boolean(plan),
    lines,
    subtotal,
    gst,
    total: subtotal + gst,
    cycle: plan?.cycle || "quarter",
    label: plan ? plan.label : "No plan set",
    gstApplies: Boolean(dojo?.gst_applies),
  };
}

/* The belt a student holds, and the next one up */
export function beltFor(student, ref) {
  const belt = ref.beltById[student.belt_id];
  if (!belt) return { belt: null, next: null };
  const next = ref.belts.find((b) => b.sort_order === belt.sort_order + 1) || null;
  return { belt, next };
}
