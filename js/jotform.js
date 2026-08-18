/* =====================================================================
   NIPPON FIT — filling in the grading form for the parent
   ---------------------------------------------------------------------
   JotForm lets you fill a form in advance by adding the answers to the
   web address. The names below are your form's own field names, read
   from the live form, so they are exact rather than guessed:

     name[first] / name[last]              the student
     fathersName[first] / [last]           the guardian
     dateOf[month] [day] [year]            date of birth
     phoneNumber[full]                     the parent's mobile
     akskaId                               the AC/23/014 card number
     currentKyu                            belt now
     kyuBelt                               belt being graded into
     gradingExamination                    the fee for that grade

   Two fields are deliberately left blank: Gender, which we do not hold,
   and Date of Belt Grading, which the dojo sets on the day.

   If you ever edit the form and the prefill stops working, the field
   names have changed — they are the only thing this depends on.
   ===================================================================== */

const FORM_URL =
  (window.NIPPONFIT_CONFIG || {}).GRADING_FORM_URL ||
  "https://form.jotform.com/251281655478061";

/* Your form words the belts its own way. "9th Kyu / White" is simply
   "White Belt" there, and the brown grades carry no word "Belt". */
export function beltAsFormOption(belt) {
  if (!belt) return null;
  if (belt.is_start || belt.kyu === "9th Kyu") return "White Belt";
  return belt.name.startsWith("Brown")
    ? `${belt.kyu}/ ${belt.name}`
    : `${belt.kyu}/ ${belt.name} Belt`;
}

/* The fee dropdown reads "8th Kyu/ Green Belt - ₹500" */
export function feeAsFormOption(belt) {
  const option = beltAsFormOption(belt);
  if (!option || belt.grading_fee == null) return null;
  return `${option} - ₹${Math.round(Number(belt.grading_fee))}`;
}

const splitName = (full) => {
  const parts = String(full || "").trim().split(/\s+/);
  return { first: parts.shift() || "", last: parts.join(" ") };
};

export function gradingFormUrl(student, currentBelt, nextBelt) {
  const params = new URLSearchParams();

  const student_name = splitName(student.full_name);
  params.set("name[first]", student_name.first);
  params.set("name[last]", student_name.last);

  if (student.guardian_name) {
    const guardian = splitName(student.guardian_name);
    params.set("fathersName[first]", guardian.first);
    params.set("fathersName[last]", guardian.last);
  }

  if (student.date_of_birth) {
    const [year, month, day] = String(student.date_of_birth).slice(0, 10).split("-");
    params.set("dateOf[month]", month);
    params.set("dateOf[day]", day);
    params.set("dateOf[year]", year);
  }

  const phone = String(student.parent_phone || "").replace(/\D/g, "").slice(-10);
  if (phone.length === 10) params.set("phoneNumber[full]", phone);

  if (student.id_card) params.set("akskaId", student.id_card);

  const current = beltAsFormOption(currentBelt);
  if (current) params.set("currentKyu", current);

  const next = beltAsFormOption(nextBelt);
  if (next) params.set("kyuBelt", next);

  const fee = feeAsFormOption(nextBelt);
  if (fee) params.set("gradingExamination", fee);

  return `${FORM_URL}?${params}`;
}

/* A UPI link for the grading fee, same idea as the term fee. Opens the
   parent's payment app with the amount already in it. */
export function gradingFeeUpiLink(student, nextBelt) {
  const upiId = (window.NIPPONFIT_CONFIG || {}).UPI_ID;
  const amount = Math.round(Number(nextBelt?.grading_fee) || 0);
  if (!upiId || !amount) return null;

  return (
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent("Nippon Karate Club")}` +
    `&am=${amount}&cu=INR` +
    `&tn=${encodeURIComponent(`${student.full_name} grading ${nextBelt.name}`)}`
  );
}
