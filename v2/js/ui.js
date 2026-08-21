/* =====================================================================
   NIPPON FIT — small helpers for building screens
   ---------------------------------------------------------------------
   No framework. `el` builds an HTML element, and screens are plain
   functions that return one. That is the whole idea.
   ===================================================================== */

/* el("div", { class: "card" }, "some text", anotherElement) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/* Replace a node's contents, ignoring anything null or false.

   node.replaceChildren() turns a null into the literal text "null" on
   screen. `el` already filters them, so mixing the two is an easy trap.
   Use fill() and it cannot happen. */
export function fill(node, ...children) {
  node.replaceChildren(
    ...children.flat().filter((c) => c !== null && c !== undefined && c !== false)
  );
  return node;
}

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

/* ------------------------------------------------------------------ */
/* Formatting — Indian conventions throughout                          */
/* ------------------------------------------------------------------ */

export const money = (n) => {
  const v = Math.round(Number(n) || 0);
  // A discount reads better as -₹1,000 than ₹-1,000
  return (v < 0 ? "-₹" : "₹") + Math.abs(v).toLocaleString("en-IN");
};

export const shortDate = (d) =>
  d
    ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not set";

export const today = () => new Date().toISOString().slice(0, 10);

export const phoneDigits = (p) => String(p || "").replace(/\D/g, "").slice(-10);

/* ------------------------------------------------------------------ */
/* Building blocks used across screens                                 */
/* ------------------------------------------------------------------ */

export const card = (title, sub, ...body) =>
  el(
    "section",
    { class: "card" },
    title && el("h2", { class: "card-title" }, title),
    sub && el("p", { class: "card-sub" }, sub),
    ...body
  );

export const spinner = (label = "Loading…") =>
  el("div", { class: "loading" }, el("div", { class: "spinner" }), el("p", {}, label));

export const errorBox = (err) =>
  el(
    "div",
    { class: "error-box" },
    el("strong", {}, "Something went wrong"),
    el("p", {}, err?.message || String(err)),
    err?.hint && el("p", { class: "muted" }, err.hint)
  );

export const empty = (message) => el("p", { class: "empty" }, message);

export const button = (label, onClick, kind = "") =>
  el("button", { class: `btn ${kind}`.trim(), type: "button", onClick }, label);

export const field = (label, input) =>
  el("label", { class: "field" }, el("span", { class: "field-label" }, label), input);

export const input = (attrs = {}) => el("input", { class: "input", ...attrs });

/* A labelled number, used across the dashboards */
export const stat = (label, value, note) =>
  el(
    "div",
    { class: "stat" },
    el("div", { class: "stat-value" }, value),
    el("div", { class: "stat-label" }, label),
    note && el("div", { class: "stat-note" }, note)
  );

/* A simple table from rows of data.
   columns: [{ key, label, format }]                                    */
export function table(columns, rows, opts = {}) {
  if (!rows || rows.length === 0) return empty(opts.emptyMessage || "Nothing to show yet.");

  return el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      { class: "table" },
      el(
        "thead",
        {},
        el("tr", {}, ...columns.map((c) => el("th", { class: c.align || "" }, c.label)))
      ),
      el(
        "tbody",
        {},
        ...rows.map((row) =>
          el(
            "tr",
            {},
            ...columns.map((c) => {
              const raw = row[c.key];
              const value = c.format ? c.format(raw, row) : raw;
              return el(
                "td",
                { class: c.align || "" },
                value instanceof Node ? value : value === null || value === undefined || value === "" ? "—" : String(value)
              );
            })
          )
        )
      )
    )
  );
}

/* The belt colour bar that runs across the top of the app */
export const beltStrip = () =>
  el(
    "div",
    { class: "belt-strip" },
    ...["#FFFFFF", "#2E8B45", "#E8730B", "#1D5FA8", "#6B3FA0", "#6B4423", "#141414"].map((c) =>
      el("i", { style: `background:${c}` })
    )
  );

/* A brief message that fades away — used for "Saved", "Marked", etc. */
export function toast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const node = el("div", { class: "toast" }, message);
  document.body.append(node);
  setTimeout(() => node.remove(), 3000);
}

/* Load data, showing a spinner then either the error or the content.
   Every screen uses this so they all behave the same way.             */
export function section(loader, render, { label } = {}) {
  const host = el("div", {}, spinner(label));

  loader()
    .then((data) => clear(host).append(render(data)))
    .catch((err) => clear(host).append(errorBox(err)));

  return host;
}
