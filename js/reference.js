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

/* How many children this family has training. Brothers and sisters are
   recognised by sharing a parent mobile, which is the one thing every
   family has filled in. Mirrors sibling_count() in the database. */
export function siblingsOf(student, allStudents) {
  const mine = [student.parent_phone, student.parent2_phone].filter(Boolean);
  if (mine.length === 0) return 1;

  const count = allStudents.filter(
    (s) =>
      s.active !== false &&
      (mine.includes(s.parent_phone) || mine.includes(s.parent2_phone))
  ).length;

  return Math.max(count, 1);
}

/* What a student pays.

   base plan + any add-on
     less Rs 1,000 if a brother or sister trains here too
     less anything the dojo has taken off by hand
     plus GST, at Dravid only
   ...unless an exact fee has been set, which replaces the lot.

   This mirrors amount_due() in the database line for line, including
   where the rounding happens, so the app and the fee reminders can
   never disagree about what someone owes. */
export function feeFor(student, ref, addonPlanIds = [], { siblings = 1 } = {}) {
  const dojo = ref.dojoById[student.dojo_id];
  const plan = ref.planById[student.plan_id];
  const gstApplies = Boolean(dojo?.gst_applies);

  if (student.fee_override !== null && student.fee_override !== undefined) {
    const total = Math.round(Number(student.fee_override));
    return {
      ok: true,
      lines: [{ label: "Fee set by the dojo", amount: total }],
      subtotal: total,
      gst: 0,
      siblingDiscount: 0,
      discount: 0,
      total,
      cycle: plan?.cycle || "quarter",
      label: plan ? plan.label : "Fee set by the dojo",
      gstApplies,
      isOverride: true,
    };
  }

  const lines = [];
  let base = 0;

  if (plan) {
    lines.push({ label: plan.label, amount: Number(plan.fee) });
    base += Number(plan.fee);
  }

  for (const id of addonPlanIds) {
    const addon = ref.planById[id];
    if (!addon) continue;
    lines.push({ label: addon.label + " (add-on)", amount: Number(addon.fee) });
    base += Number(addon.fee);
  }

  const siblingDiscount = siblings >= 2 ? 1000 : 0;
  const discount = Number(student.fee_discount) || 0;
  const subtotal = Math.max(base - siblingDiscount - discount, 0);
  const total = Math.round(subtotal * (gstApplies ? 1.18 : 1));

  return {
    ok: Boolean(plan),
    lines,
    subtotal,
    gst: total - subtotal,
    siblingDiscount,
    discount,
    total,
    cycle: plan?.cycle || "quarter",
    label: plan ? plan.label : "No plan set",
    gstApplies,
    isOverride: false,
  };
}

/* The belt a student holds, and the next one up */
export function beltFor(student, ref) {
  const belt = ref.beltById[student.belt_id];
  if (!belt) return { belt: null, next: null };
  const next = ref.belts.find((b) => b.sort_order === belt.sort_order + 1) || null;
  return { belt, next };
}


/* ------------------------------------------------------------------ */
/* Attendance judged against the plan                                  */
/* ------------------------------------------------------------------ */

/* How many classes a week this child's plan buys, including add-ons.
   The number comes from the plan itself, so it changes when you change
   the plan and never needs maintaining separately. */
export function sessionsPerWeek(student, ref, addonPlanIds = []) {
  const plan = ref.planById[student.plan_id];
  let perWeek = Number(plan?.sessions_per_week) || 0;

  for (const id of addonPlanIds) {
    perWeek += Number(ref.planById[id]?.sessions_per_week) || 0;
  }
  return perWeek;
}

/* How many classes they were entitled to between two dates.

   Never counts weeks before they joined, or weeks they were away on a
   break. Mirrors sessions_entitled() in the database line for line, so
   the app and any report always agree. */
/* Was this dojo running on this date?

   A dojo that opens later should not be offered for a day before it
   existed. Koramangala opens on 2 September, so it has no business
   appearing in the register for a Wednesday in March. A dojo with no
   opening day has always run. */
export function dojoOpenOn(dojo, date) {
  if (!dojo) return false;
  if (dojo.active === false) return false;
  if (!dojo.opens_on) return true;
  return String(dojo.opens_on).slice(0, 10) <= String(date).slice(0, 10);
}

/* The day a dojo's timetable began running, if it has one. Classes with
   no first day have always run, so the dojo has no opening date. */
export function dojoOpenedOn(student, ref) {
  const mine = (ref.sessions || []).filter((s) => s.dojo_id === student.dojo_id && s.active !== false);
  if (mine.length === 0 || mine.some((s) => !s.starts_on)) return null;
  return mine.map((s) => String(s.starts_on).slice(0, 10)).sort()[0];
}

export function sessionsEntitled(student, ref, addonPlanIds, from, to) {
  const perWeek = sessionsPerWeek(student, ref, addonPlanIds);
  if (!perWeek) return 0;

  const day = (d) => new Date(String(d).slice(0, 10) + "T00:00:00").getTime();
  const DAY = 86400000;

  /* Three things decide when the clock starts: the period asked about,
     the day the child joined, and the day their dojo actually opened.
     Koramangala begins in September, so a child there is not marked
     down for the Wednesdays of a summer when nothing was running. */
  const dojoOpened = dojoOpenedOn(student, ref);
  const starts = Math.max(
    day(from),
    student.joined_on ? day(student.joined_on) : day(from),
    dojoOpened ? day(dojoOpened) : day(from)
  );
  const ends = Math.min(day(to), Date.now());
  if (ends < starts) return 0;

  let awayDays = 0;
  if (student.break_from) {
    const bFrom = Math.max(starts, day(student.break_from));
    const bTo = Math.min(ends, student.break_to ? day(student.break_to) : ends);
    if (bTo > bFrom) awayDays = (bTo - bFrom) / DAY;
  }

  const days = (ends - starts) / DAY + 1 - awayDays;
  return Math.max(0, Math.round((days / 7) * perWeek));
}

/* The percentage itself. Capped at 100, because a keen child who comes
   to extra classes is not 130% attentive - they are simply there. */
export function attendancePercent(attended, entitled) {
  if (!entitled) return null;
  return Math.min(100, Math.round((attended / entitled) * 100));
}
