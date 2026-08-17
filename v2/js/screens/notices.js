/* =====================================================================
   NOTICES — founder and admin
   ---------------------------------------------------------------------
   Post a notice to one dojo or all of them. Parents see it the next
   time they open the app.
   ===================================================================== */

import * as db from "../db.js";
import { reference } from "../reference.js";
import { el, card, input, button, shortDate, section, toast, errorBox, empty } from "../ui.js";

export async function noticesScreen({ me, refresh }) {
  return el("div", {}, section(load, (d) => render(d, me, refresh), { label: "Fetching notices…" }));
}

async function load() {
  const [notices, ref] = await Promise.all([
    db.select("notices", { order: "created_at.desc", limit: 50 }),
    reference(),
  ]);
  return { notices, ref };
}

function render({ notices, ref }, me, refresh) {
  return el("div", {}, composer(ref, me, refresh), list(notices, ref));
}

function composer(ref, me, refresh) {
  const title = input({ placeholder: "e.g. Dojo closed on 26 January" });
  const body = el("textarea", { class: "input", rows: "4", placeholder: "The details parents need." });
  const dojo = el(
    "select",
    { class: "input" },
    el("option", { value: "" }, "Everyone, all dojos"),
    ...ref.dojos.map((d) => el("option", { value: d.id }, d.name))
  );
  const problem = el("div", {});

  const post = button(
    "Post the notice",
    async () => {
      problem.replaceChildren();
      if (!title.value.trim()) {
        problem.append(errorBox(new Error("Give the notice a title.")));
        return;
      }
      post.disabled = true;
      post.textContent = "Posting…";
      try {
        await db.insert("notices", {
          title: title.value.trim(),
          body: body.value.trim() || null,
          dojo_id: dojo.value || null,
          created_by: me.id,
        });
        toast("Notice posted.");
        title.value = "";
        body.value = "";
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
      post.disabled = false;
      post.textContent = "Post the notice";
    },
    "wide"
  );

  return card(
    "Post a notice",
    "It appears in the app for the parents you choose. It does not send an email or a message.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Title"), title),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Details"), body),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Who sees it"), dojo),
    problem,
    post
  );
}

function list(notices, ref) {
  if (notices.length === 0) return card("Posted notices", null, empty("Nothing posted yet."));

  return card(
    "Posted notices",
    null,
    ...notices.map((n) =>
      el(
        "div",
        { style: "padding:12px 0;border-bottom:1px solid var(--line)" },
        el("div", { style: "font-weight:600" }, n.title),
        n.body ? el("p", { style: "margin:4px 0" }, n.body) : null,
        el("div", { class: "muted" }, `${shortDate(n.created_at)} · ${n.dojo_id ? ref.dojoById[n.dojo_id]?.name || "one dojo" : "all dojos"}`)
      )
    )
  );
}
