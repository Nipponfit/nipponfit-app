/* =====================================================================
   NIPPON FIT — talking to the database
   ---------------------------------------------------------------------
   Everything that touches Supabase happens in this one file. Nothing
   else in the app knows a database exists.

   There is no library here on purpose. Supabase is a normal web API, so
   this is plain fetch() calls. That means nothing to install, nothing to
   compile, and nothing that can go out of date underneath you.
   ===================================================================== */

const CFG = window.NIPPONFIT_CONFIG || {};
const URL_BASE = CFG.SUPABASE_URL;
const ANON = CFG.SUPABASE_ANON_KEY;

// Where the signed-in session is kept between visits.
const STORE_KEY = "nipponfit.session";

export const isConfigured = () =>
  Boolean(URL_BASE && ANON && !ANON.startsWith("PASTE") && !/^sb_secret_/i.test(ANON));

/* ------------------------------------------------------------------ */
/* The session                                                         */
/* ------------------------------------------------------------------ */

let session = null;

function loadSession() {
  try {
    session = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    session = null;
  }
  return session;
}

function saveSession(s) {
  session = s;
  if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORE_KEY);
}

export function getSession() {
  return session || loadSession();
}

export function signedIn() {
  return Boolean(getSession()?.access_token);
}

/* Tokens last an hour. Refresh a few minutes early so a parent never
   gets thrown out in the middle of looking at something. */
async function freshToken() {
  const s = getSession();
  if (!s) return null;

  const expiresAt = (s.expires_at || 0) * 1000;
  if (Date.now() < expiresAt - 120000) return s.access_token;

  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });

  if (!res.ok) {
    saveSession(null);
    return null;
  }
  const next = await res.json();
  saveSession(next);
  return next.access_token;
}

/* ------------------------------------------------------------------ */
/* Signing in and out                                                  */
/* ------------------------------------------------------------------ */

/* A mobile number becomes the hidden address the account is stored
   under. An email address is looked up in the database first, because
   accounts are keyed on the mobile-based address. */
export async function loginAddressFor(typed) {
  const text = String(typed || "").trim();
  if (!text) return null;

  if (text.includes("@")) {
    const found = await rpc("resolve_login", { p_contact: text }, { anon: true });
    return found || text.toLowerCase();
  }

  const digits = text.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `${digits.slice(-10)}@phone.nipponfit.com`;
}

export async function signIn(contact, password) {
  const email = await loginAddressFor(contact);
  if (!email) throw new Error("Enter your 10-digit mobile number, or your email address.");

  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json();

  if (!res.ok) {
    const code = body.error_code || "";
    const msg = String(body.msg || body.error_description || "").toLowerCase();

    if (code === "invalid_credentials" || msg.includes("invalid login")) {
      throw new Error(
        `That mobile number and password do not match. Check both, or call the dojo on ${CFG.HELP_PHONE || "9945616005"} to have it reset.`
      );
    }
    if (msg.includes("not confirmed")) throw new Error("That account is not confirmed yet. Call the dojo.");
    if (res.status === 429) throw new Error("Too many attempts. Wait a minute and try again.");
    throw new Error(body.msg || "Could not sign in. Please try again.");
  }

  saveSession(body);
  return body;
}

export async function signOut() {
  const s = getSession();
  if (s?.access_token) {
    try {
      await fetch(`${URL_BASE}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` },
      });
    } catch {
      /* signing out locally matters more than telling the server */
    }
  }
  saveSession(null);
}

/* ------------------------------------------------------------------ */
/* Reading and writing tables                                          */
/* ------------------------------------------------------------------ */

async function request(path, options = {}, { anon = false } = {}) {
  const token = anon ? ANON : (await freshToken()) || ANON;

  const res = await fetch(`${URL_BASE}${path}`, {
    ...options,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.message || data?.msg || `Request failed (${res.status})`);
    err.code = data?.code;
    err.hint = data?.hint;
    err.details = data?.details;
    throw err;
  }
  return data;
}

/* Read rows from a table or view.
     select("students", { eq: { dojo_id: id }, order: "full_name" })      */
export function select(table, opts = {}) {
  const q = new URLSearchParams();
  q.set("select", opts.columns || "*");

  for (const [col, val] of Object.entries(opts.eq || {})) q.set(col, `eq.${val}`);
  for (const [col, val] of Object.entries(opts.filter || {})) q.set(col, val);
  if (opts.order) q.set("order", opts.order);
  if (opts.limit) q.set("limit", opts.limit);

  return request(`/rest/v1/${table}?${q}`);
}

export function insert(table, row) {
  return request(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
}

export function update(table, match, changes) {
  const q = new URLSearchParams();
  for (const [col, val] of Object.entries(match)) q.set(col, `eq.${val}`);
  return request(`/rest/v1/${table}?${q}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(changes),
  });
}

export function upsert(table, rows, onConflict) {
  const q = onConflict ? `?on_conflict=${onConflict}` : "";
  return request(`/rest/v1/${table}${q}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
}

/* Call a database function, e.g. rpc("change_my_password", {...}) */
export function rpc(name, args = {}, opts = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) }, opts);
}

/* ------------------------------------------------------------------ */
/* Who am I?                                                           */
/* ------------------------------------------------------------------ */

export async function whoAmI() {
  const s = getSession();
  if (!s?.user?.id) return null;
  const rows = await select("profiles", {
    columns: "id, role, full_name, phone, email, rank, active",
    eq: { id: s.user.id },
  });
  return rows[0] || null;
}
