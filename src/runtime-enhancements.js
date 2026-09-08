// @ts-nocheck -- generic-Element DOM patching over an immutable vendored
// bundle; casting every querySelector result to HTMLElement throughout
// would add noise without catching real bugs here.
import { dictionaries as copy } from "./i18n.js";
import {
  api,
} from "./systems-explorer.js";
import {
  installRegionalJourney,
  installRegionalNavigation,
  openRegionalJourney,
  rewriteHomepage,
  syncRegionalJourney,
} from "./regional-journey.js";

const ROLE_STORAGE_KEY = "adapttica-selected-role";
const ACTIVE_CASE_KEY = "adapttica-active-case";
const REGISTER_INTENT_KEY = "adapttica-register-intent";
const LANGUAGE_STORAGE_KEY = "adapttica-language-preference";

const a11yIcons = {
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 19 10.5 6h1L16 19"/><path d="M7.5 15h5"/><path d="M18 19v-6"/><path d="M16.5 14.5 18 13l1.5 1.5"/></svg>`,
  contrast: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>`,
  links: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15 15 9"/><path d="M10.5 7.5 12 6a3.5 3.5 0 0 1 5 5l-1.5 1.5"/><path d="M13.5 16.5 12 18a3.5 3.5 0 0 1-5-5l1.5-1.5"/></svg>`,
  motion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9v6"/><path d="M14.5 9v6"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.3"/><path d="M3 4v5h5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>`,
};

// A simple accessibility figure (head, open arms, legs) inside a circle,
// drawn from basic shapes rather than a third-party icon glyph.
const a11yTriggerIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="6.2" r="1.9" fill="currentColor"/><path d="M12 8.6c-3.6 0-6.6 1-6.9 1.4-.4.5-.1 1.3.5 1.5.3.1 2.4-.5 4.1-.8l.6 2.1-3 6.7c-.2.6.1 1.2.7 1.4.6.2 1.2-.1 1.4-.7l2.6-5.7 2.6 5.7c.2.6.8.9 1.4.7.6-.2.9-.8.7-1.4l-3-6.7.6-2.1c1.7.3 3.8.9 4.1.8.6-.2.9-1 .5-1.5-.3-.4-3.3-1.4-6.9-1.4z" fill="currentColor"/></svg>`;

function currentLanguage() {
  const value = document.querySelector(".language")?.textContent || "";
  return /EN/i.test(value) ? "en" : "el";
}

function currentView() {
  return new URLSearchParams(location.search).get("view") || "home";
}

// The case detail route always carries its id as a query param
// (?view=case&id=...), including on a plain page load/refresh — that's the
// reliable source. ACTIVE_CASE_KEY is a secondary fallback kept only for the
// post-login return flow in consumeReturnToCase(), where the redirect target
// doesn't carry an id in its URL.
function currentCaseId() {
  return new URLSearchParams(location.search).get("id") || sessionStorage.getItem(ACTIVE_CASE_KEY) || "";
}


let authCache = null; // { authenticated: boolean, role: string|null, checkedAt: number }
const AUTH_CACHE_TTL_MS = 5_000;

function runtimeToastStack() {
  let stack = document.querySelector(".runtime-toast-stack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.className = "runtime-toast-stack";
  stack.setAttribute("aria-live", "polite");
  stack.setAttribute("aria-atomic", "false");
  // The bundle's own global translator walks every text node in the
  // document and, for anything it doesn't recognise, falls back to
  // phonetically transliterating Greek into Latin letters rather than
  // leaving it alone — exactly what happened to injected content here
  // before this attribute (its own supported opt-out, already used
  // elsewhere in the bundle, e.g. the header's language switcher).
  stack.setAttribute("data-no-localize", "true");
  document.body.append(stack);
  return stack;
}

function showRuntimeToast({ type = "info", title, message = "", key = "" }) {
  const stack = runtimeToastStack();
  if (key) stack.querySelector(`[data-toast-key="${CSS.escape(key)}"]`)?.remove();
  const toast = document.createElement("div");
  toast.className = `runtime-toast ${type}`;
  toast.dataset.toastKey = key;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span class="runtime-toast-mark" aria-hidden="true">${type === "success" ? "✓" : type === "warning" ? "!" : type === "error" ? "×" : "i"}</span>
    <span class="runtime-toast-copy"><strong></strong><span></span></span>
    <button type="button" class="runtime-toast-close"></button>`;
  toast.querySelector("strong").textContent = title || "";
  toast.querySelector(".runtime-toast-copy > span").textContent = message;
  const close = toast.querySelector(".runtime-toast-close");
  close.textContent = "×";
  close.setAttribute("aria-label", copy[currentLanguage()].closeNotification);
  const dismiss = () => {
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 180);
  };
  close.addEventListener("click", dismiss);
  stack.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(dismiss, type === "error" ? 7000 : 5000);
  return toast;
}

let authCacheFetchPromise = null;

// syncEnhancements() calls this on every debounced DOM-mutation pass (twice,
// even, on a case page — see guardCaseAccess()) with no caller-side
// throttling, unlike refreshNotificationBadge()'s TTL check before its call
// site. A busy page transition can trigger dozens of passes within a couple
// of seconds, each previously firing its own uncached `/me` fetch — enough
// concurrent requests to exhaust the browser's per-origin connection pool
// (surfacing as unrelated fetches across the page failing with "Failed to
// fetch"/ERR_INSUFFICIENT_RESOURCES) and, worse, letting responses resolve
// out of order: an older, pre-login "unauthenticated" response arriving
// after a newer "authenticated" one would flip the cache back and fire a
// bogus sign-out toast despite the user never having logged out. Both the
// TTL short-circuit and the single shared in-flight promise below close
// that off — after this, there is only ever at most one `/me` request in
// flight at a time, and its result is reused by every concurrent caller.
async function refreshAuthCache() {
  if (authCache && Date.now() - authCache.checkedAt < AUTH_CACHE_TTL_MS) {
    return authCache.authenticated;
  }
  if (authCacheFetchPromise) return authCacheFetchPromise;
  authCacheFetchPromise = (async () => {
    const previousAuthenticated = authCache?.authenticated;
    let res;
    try {
      res = await fetch("/api/v1/me", { credentials: "same-origin" });
    } catch {
      // A normal SPA navigation — including this app's own
      // window.location.href redirects for the case-detail login gate —
      // cancels any in-flight fetch, throwing here even though the user
      // never logged out. Treating that as "logged out" was firing a
      // spurious sign-out toast on ordinary navigation; leave the cache
      // untouched instead and let the next successful check settle it.
      return previousAuthenticated ?? false;
    }
    // Only a real 401 is a confirmed "not signed in". Any other non-2xx
    // status (a transient 500, a dev-server hiccup) is inconclusive, not
    // proof of logout — don't let it flip the cached state either.
    if (!res.ok && res.status !== 401) return previousAuthenticated ?? false;

    const authenticated = res.ok;
    let role = null;
    if (authenticated) {
      try {
        role = (await res.json())?.data?.user?.platformRole || null;
      } catch {
        return previousAuthenticated ?? false;
      }
    }
    authCache = { authenticated, role, checkedAt: Date.now() };
    if (previousAuthenticated !== undefined && previousAuthenticated !== authenticated) {
      const t = copy[currentLanguage()];
      showRuntimeToast(authenticated
        ? { type: "success", title: t.loginSuccessTitle, message: t.loginSuccessMessage, key: "auth-state" }
        : { type: "info", title: t.logoutSuccessTitle, message: t.logoutSuccessMessage, key: "auth-state" });
    }
    return authenticated;
  })();
  try {
    return await authCacheFetchPromise;
  } finally {
    authCacheFetchPromise = null;
  }
}

function isAuthenticatedCached() {
  if (!authCache || Date.now() - authCache.checkedAt > AUTH_CACHE_TTL_MS) return null;
  return authCache.authenticated;
}

let caseRoleCache = null; // { caseId, role: string|null, checkedAt: number }
const CASE_ROLE_CACHE_TTL_MS = 15_000;

// The bundle's own permission checks (can("review"), can("manageCase"), ...)
// are keyed off the viewer's site-wide platform role (user/representative/
// admin), not their actual case_members.role for the case on screen — so a
// "representative" who is merely a regular member of one particular case
// still sees every coordinator-only control as enabled there, and then gets
// a 403 the moment they use it (the server correctly checks case_members).
// This fetches the real per-case role so the frontend can match what the
// server will actually allow, rather than trusting the coarser native gate.
async function getCurrentCaseRole(caseId) {
  if (!caseId) return null;
  if (caseRoleCache?.caseId === caseId && Date.now() - caseRoleCache.checkedAt < CASE_ROLE_CACHE_TTL_MS) {
    return caseRoleCache.role;
  }
  try {
    const [meRes, membersRes] = await Promise.all([
      fetch("/api/v1/me", { credentials: "same-origin" }),
      fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, { credentials: "same-origin" }),
    ]);
    if (!meRes.ok || !membersRes.ok) return caseRoleCache?.caseId === caseId ? caseRoleCache.role : null;
    const me = (await meRes.json())?.data?.user;
    if (me?.platformRole === "admin") {
      caseRoleCache = { caseId, role: "admin", checkedAt: Date.now() };
      return "admin";
    }
    const members = (await membersRes.json())?.data?.items || [];
    const mine = members.find((member) => member.user_id === me?.id);
    const role = mine?.role || null;
    caseRoleCache = { caseId, role, checkedAt: Date.now() };
    return role;
  } catch {
    return caseRoleCache?.caseId === caseId ? caseRoleCache.role : null;
  }
}

// The header's notification-bell badge is a bare `<i>3</i>` in the bundle —
// a literal, hardcoded string, not bound to any data at all (confirmed by
// reading the minified source: no state, no .length, no fetch result feeds
// it). It always shows "3" for every signed-in user regardless of their
// real unread count, which is why it disagrees with the popover underneath
// it — that popover *does* fetch real data. This replaces the badge's text
// with the actual unread count from the same endpoint, and hides it at 0
// instead of removing the node (removing a React-owned element the way an
// earlier attempt at a similar fix did caused a real reconciliation crash;
// see the removed replaceEnglishFlags() function this file used to have).
let notificationBadgeCache = null; // { unread: number, checkedAt: number }
const NOTIFICATION_BADGE_TTL_MS = 8_000;
let notificationBadgeFetchInFlight = false;

async function refreshNotificationBadge() {
  if (isAuthenticatedCached() === false) {
    notificationBadgeCache = { unread: 0, checkedAt: Date.now() };
    applyNotificationBadge();
    return;
  }
  // The caller's TTL check only updates checkedAt once this resolves, so a
  // burst of debounced sync passes within one round trip could otherwise
  // still stack up duplicate requests (the same class of bug fixed in
  // refreshAuthCache above).
  if (notificationBadgeFetchInFlight) return;
  notificationBadgeFetchInFlight = true;
  try {
    const res = await fetch("/api/v1/notifications", { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    const items = body?.data?.items || [];
    const unread = items.filter((item) => !item.read_at).length;
    notificationBadgeCache = { unread, checkedAt: Date.now() };
  } catch {
    // Leave the previous cached value in place on a transient network error.
  } finally {
    notificationBadgeFetchInFlight = false;
  }
  applyNotificationBadge();
}

function applyNotificationBadge() {
  const badge = document.querySelector(".icon-btn.notification i");
  if (!badge || !notificationBadgeCache) return;
  const { unread } = notificationBadgeCache;
  badge.textContent = unread > 99 ? "99+" : String(unread);
  badge.classList.toggle("notification-badge-hidden", unread === 0);
}

function savedLanguage() {
  try {
    const stable = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    if (stable === "el" || stable === "en") return stable;
    const preference = JSON.parse(localStorage.getItem("adapttica-preferences-v1") || "{}");
    const saved = String(preference.lang || "").toLowerCase();
    return saved === "en" || saved === "el" ? saved : "el";
  } catch {
    return "el";
  }
}

let restoringLanguage = false;

function persistLanguagePreference(lang) {
  let preference;
  try {
    preference = JSON.parse(localStorage.getItem("adapttica-preferences-v1") || "{}");
  } catch {
    preference = {};
  }
  // The vendored SPA rewrites adapttica-preferences-v1 after `/me` loads,
  // using the account's original language. Keep the user's explicit UI
  // choice in a separate stable key so it survives full-page navigation,
  // refresh, sign-in and sign-out, then mirror it into the native object.
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang.toLowerCase());
  localStorage.setItem("adapttica-preferences-v1", JSON.stringify({ ...preference, lang: lang.toUpperCase() }));
}

function restoreLanguagePreference() {
  const desired = savedLanguage();
  if (!desired || desired === currentLanguage() || restoringLanguage) return;
  const languageButton = document.querySelector("button.language");
  if (!languageButton) return;
  restoringLanguage = true;
  languageButton.click();
  setTimeout(() => {
    const matcher = desired === "en" ? /english|αγγλικά/i : /greek|ελληνικά/i;
    const option = [...document.querySelectorAll(".language-popover button")].find((button) => matcher.test(button.textContent || ""));
    option?.click();
    restoringLanguage = false;
  }, 0);
}

function removeAreaFilters() {
  document.querySelectorAll("select").forEach((select) => {
    const label = `${select.getAttribute("aria-label") || ""} ${select.options?.[0]?.text || ""}`;
    const isArea = /area filter|all areas|φίλτρο περιοχής|όλες οι περιοχές/i.test(label);
    select.classList.toggle("removed-area-filter", isArea);
    select.setAttribute("aria-hidden", String(isArea));
    if (isArea) select.tabIndex = -1;
  });
}

function createRoleSelector(container) {
  const lang = currentLanguage();
  const existing = container.querySelector(".auth-role-selector");
  if (existing?.dataset.lang === lang) return;
  existing?.remove();
  const t = copy[lang];
  const selected = localStorage.getItem(ROLE_STORAGE_KEY) || "user";
  const fieldset = document.createElement("fieldset");
  fieldset.className = "auth-role-selector";
  fieldset.dataset.lang = lang;
  fieldset.setAttribute("data-no-localize", "true");
  fieldset.innerHTML = `<legend>${t.roleLegend}</legend><div class="auth-role-grid"></div>`;
  const grid = fieldset.querySelector(".auth-role-grid");
  const demoAccounts = {
    user: { email: "participant@demo.adapttica.local", password: "Demo123!" },
    representative: { email: "representative@demo.adapttica.local", password: "Demo123!" },
    // Matches the documented default in .env.example / server/src/seed.js
    // (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD) — not a secret beyond what's
    // already committed there. A deployment that overrides those env vars
    // will simply see this quick-fill stop matching, same accepted
    // trade-off as the two demo accounts above.
    admin: { email: "admin@adapttica.local", password: "ChangeMe123!" },
  };

  const populateDemoAccount = (role) => {
    const credentials = demoAccounts[role];
    if (!credentials) return;
    const inputs = [...container.querySelectorAll(".auth-form input")];
    const email = inputs.find((input) => input.type === "email");
    const password = inputs.find((input) => input.type === "password");
    [[email, credentials.email], [password, credentials.password]].forEach(([input, value]) => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  // Admin can only be granted by an existing administrator (via the admin
  // user-management screen), never through self-registration — that rule
  // is enforced on the *registration* form (isRegistration branch below,
  // which drops the role selector entirely), not here: this is the sign-in
  // screen's quick-fill for already-existing demo accounts, so offering
  // the seeded admin account alongside the other two is safe.
  ["user", "representative", "admin"].forEach((role) => {
    const label = document.createElement("label");
    label.className = "auth-role-option";
    label.innerHTML = `<input type="radio" name="platform-role" value="${role}" ${selected === role ? "checked" : ""}><span><b>${t[role]}</b><small>${t[`${role}Help`]}</small></span>`;
    label.addEventListener("click", () => {
      localStorage.setItem(ROLE_STORAGE_KEY, role);
      populateDemoAccount(role);
    });
    label.querySelector("input").addEventListener("change", () => localStorage.setItem(ROLE_STORAGE_KEY, role));
    grid.append(label);
  });
  const submit = [...container.querySelectorAll("button")].find((button) => /σύνδεση|εγγραφή|sign in|register/i.test(button.textContent));
  (submit || container.querySelector(".switch-auth"))?.before(fieldset);
}

function decorateAuthFields(content, isRegistration) {
  content.querySelectorAll(".auth-form label").forEach((label) => {
    const input = label.querySelector("input");
    // .auth-role-option radios (createRoleSelector above) also match
    // ".auth-form label" since the fieldset sits inside the same form —
    // they're pre-selected, mutually exclusive, and have no direct text
    // node for the "required" label treatment below to attach to, so
    // marking them required here only pollutes them with a stray
    // aria-invalid/required pair that means nothing for a radio group.
    if (!input || input.type === "radio" || (input.type === "checkbox" && !isRegistration)) return;

    const labelCopy = [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .trim();
    const isOrganisation = /organisation|organization|οργανισμός/i.test(labelCopy);
    const isRequired = !isOrganisation;

    if (isRequired && !label.querySelector(":scope > .auth-required-label")) {
      const leadingText = [...label.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      if (leadingText) {
        const wrapper = document.createElement("span");
        wrapper.className = "auth-required-label";
        wrapper.textContent = leadingText.textContent.trim();
        const star = document.createElement("span");
        star.className = "auth-required-star";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "*";
        wrapper.append(" ", star);
        leadingText.replaceWith(wrapper);
      }
      input.required = true;
    }

    const error = label.querySelector(":scope > .field-error");
    const control = input.closest(".input-with-icon") || input;
    label.classList.toggle("auth-field-invalid", Boolean(error));
    control.classList.toggle("auth-control-invalid", Boolean(error));
    input.setAttribute("aria-invalid", String(Boolean(error)));
  });
}

// Same case the Regional Resilience Journey uses (regional-journey.js's
// REGIONAL_CASE_ID) -- duplicated here rather than imported since that
// module doesn't export it, and this is the only other place that needs it.
const REGIONAL_CASE_ID_FOR_REGISTRATION = "20000000-0000-4000-8000-000000000001";
const REGISTRATION_CATEGORY_LABELS = {
  el: { public: "Δημόσιος τομέας", private: "Ιδιωτικός τομέας", civil: "ΜΚΟ / Κοινωνία των πολιτών", research: "Έρευνα & ακαδημαϊκή κοινότητα" },
  en: { public: "Public sector", private: "Private sector", civil: "NGOs / Civil Society", research: "Research & Academia" },
};
const REGISTRATION_COUNTS_INTRO = {
  el: "Ποιοι έχουν ήδη εγγραφεί",
  en: "Who has already registered",
};

// The spec asks that the same per-category participant numbers shown in
// Phase 2 also appear during registration, so a prospective participant can
// see where representation is thin before they sign up.
function installRegistrationRepresentationCounts(content) {
  const lang = currentLanguage();
  let panel = content.querySelector(".auth-representation-counts");
  if (panel?.dataset.lang === lang) return;
  panel?.remove();
  panel = document.createElement("div");
  panel.className = "auth-representation-counts";
  panel.dataset.lang = lang;
  panel.setAttribute("data-no-localize", "true");
  panel.innerHTML = `<p></p><div class="auth-representation-grid"></div>`;
  panel.querySelector("p").textContent = REGISTRATION_COUNTS_INTRO[lang];
  const grid = panel.querySelector(".auth-representation-grid");
  const form = content.querySelector(".auth-form");
  (form || content.querySelector("h1"))?.before(panel);
  api(`/cases/${REGIONAL_CASE_ID_FOR_REGISTRATION}/representation`)
    .then((data) => {
      Object.entries(data.counts || {}).forEach(([key, count]) => {
        const item = document.createElement("div");
        item.innerHTML = `<strong></strong><span></span>`;
        item.querySelector("strong").textContent = String(count);
        item.querySelector("span").textContent = REGISTRATION_CATEGORY_LABELS[lang][key] || key;
        grid.append(item);
      });
    })
    .catch(() => panel.remove());
}

// The consent checkbox no longer belongs in this flow, and a stakeholder
// needs to confirm their password and declare which category they represent
// -- none of which the vendored bundle's own register form has a field or
// submit-time hook for. sessionStorage is how the stakeholder-category
// selection reaches local-api.js's forwardRegisterRequest, which is the one
// place that actually builds the POST body sent to the server.
const PENDING_STAKEHOLDER_CATEGORY_KEY = "adapttica-pending-stakeholder-category";

function passwordFieldIconMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-keyhole" aria-hidden="true"><circle cx="12" cy="16" r="1"></circle><rect x="3" y="10" width="18" height="12" rx="2"></rect><path d="M7 10V7a5 5 0 0 1 10 0v3"></path></svg>`;
}

function installRegistrationExtraFields(content, lang) {
  const form = content.querySelector(".auth-form");
  if (!form) return;
  const t = copy[lang];

  // Removed from the flow entirely, not just hidden -- but the Register
  // button underneath it may be gated on the React state this checkbox's
  // own onChange sets, so a genuine .click() flips that state exactly as a
  // visitor checking it themselves would, before the row disappears.
  const consentLabel = form.querySelector("label.check");
  if (consentLabel && !consentLabel.hidden) {
    const checkbox = consentLabel.querySelector('input[type="checkbox"]');
    if (checkbox && !checkbox.checked) checkbox.click();
    consentLabel.hidden = true;
  }

  const passwordLabel = [...form.querySelectorAll("label")].find((label) => label.querySelector('input[type="password"]'));
  if (passwordLabel && !form.querySelector(".auth-confirm-password")) {
    const confirmLabel = document.createElement("label");
    confirmLabel.className = "auth-confirm-password";
    confirmLabel.append(t.confirmPasswordLabel);
    const wrapper = document.createElement("div");
    wrapper.className = "input-with-icon";
    wrapper.innerHTML = passwordFieldIconMarkup();
    const confirmInput = document.createElement("input");
    confirmInput.type = "password";
    confirmInput.autocomplete = "new-password";
    wrapper.append(confirmInput);
    confirmLabel.append(wrapper);
    passwordLabel.after(confirmLabel);

    // decorateAuthFields treats a label as invalid purely by whether a
    // ".field-error" child *exists* -- it never checks visibility -- so the
    // paragraph is only added to the DOM on an actual mismatch, not created
    // upfront and toggled hidden.
    const passwordInput = passwordLabel.querySelector('input[type="password"]');
    const validate = () => {
      const mismatch = Boolean(confirmInput.value) && confirmInput.value !== passwordInput.value;
      confirmInput.setCustomValidity(mismatch ? t.confirmPasswordMismatch : "");
      let error = confirmLabel.querySelector(":scope > .field-error");
      if (mismatch && !error) {
        error = document.createElement("p");
        error.className = "field-error";
        error.textContent = t.confirmPasswordMismatch;
        confirmLabel.append(error);
      } else if (!mismatch && error) {
        error.remove();
      }
    };
    confirmInput.addEventListener("input", validate);
    passwordInput.addEventListener("input", validate);
  }

  if (!form.querySelector(".auth-stakeholder-category")) {
    const organisationLabel = [...form.querySelectorAll("label")].find((label) =>
      /organisation|organization|οργανισμός/i.test(label.textContent || "")
    );
    const categoryLabel = document.createElement("label");
    categoryLabel.className = "auth-stakeholder-category";
    // decorateAuthFields only wraps a label's leading text in the
    // required-star span when it finds an <input> to require -- a <select>
    // never matches that lookup, so the star is built here directly.
    const requiredWrapper = document.createElement("span");
    requiredWrapper.className = "auth-required-label";
    requiredWrapper.append(t.stakeholderCategoryLabel, " ");
    const requiredStar = document.createElement("span");
    requiredStar.className = "auth-required-star";
    requiredStar.setAttribute("aria-hidden", "true");
    requiredStar.textContent = "*";
    requiredWrapper.append(requiredStar);
    categoryLabel.append(requiredWrapper);
    const select = document.createElement("select");
    select.required = true;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t.stakeholderCategoryPlaceholder;
    select.append(placeholder);
    ["public", "private", "civil", "research"].forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = REGISTRATION_CATEGORY_LABELS[lang][key];
      select.append(option);
    });
    select.value = sessionStorage.getItem(PENDING_STAKEHOLDER_CATEGORY_KEY) || "";
    select.addEventListener("change", () => {
      if (select.value) sessionStorage.setItem(PENDING_STAKEHOLDER_CATEGORY_KEY, select.value);
      else sessionStorage.removeItem(PENDING_STAKEHOLDER_CATEGORY_KEY);
    });
    categoryLabel.append(select);
    (organisationLabel || form.firstElementChild)?.after(categoryLabel);
  }
}

function enhanceAuthentication() {
  document.querySelectorAll(".auth-content").forEach((content) => {
    const heading = content.querySelector("h1")?.textContent || "";
    const isRegistration = /create an account|δημιουργήστε λογαριασμό/i.test(heading);

    // Public registration always creates a participant account. Elevated
    // organisation roles are assigned later by an administrator, so asking
    // for a role here is both misleading and a potential permissions leak.
    if (isRegistration) {
      content.querySelector(".auth-role-selector")?.remove();
      installRegistrationExtraFields(content, currentLanguage());
      decorateAuthFields(content, true);
      installRegistrationRepresentationCounts(content);
      return;
    }

    // The React root re-renders this same .auth-content node in place when
    // the visitor switches from register to sign-in, so anything injected
    // above survives unless it's explicitly cleaned up here.
    content.querySelector(".auth-confirm-password")?.remove();
    content.querySelector(".auth-stakeholder-category")?.remove();
    const consentLabel = content.querySelector(".auth-form label.check");
    if (consentLabel?.hidden) consentLabel.hidden = false;

    createRoleSelector(content);
    decorateAuthFields(content, false);
  });
}

function installAccessibility() {
  if (document.querySelector("#userwayAccessibilityIcon, .local-accessibility-widget")) return;
  const account = import.meta.env.VITE_USERWAY_ACCOUNT_ID;
  if (account) {
    const script = document.createElement("script");
    script.src = import.meta.env.VITE_USERWAY_SCRIPT_URL || "https://cdn.userway.org/widget.js";
    script.dataset.account = account;
    script.async = true;
    document.head.append(script);
    return;
  }
  const lang = currentLanguage();
  const t = copy[lang];
  const toggles = [
    { key: "text", label: t.largerText, className: "a11y-large-text" },
    { key: "contrast", label: t.contrast, className: "a11y-high-contrast" },
    { key: "links", label: t.links, className: "a11y-highlight-links" },
    { key: "motion", label: t.motion, className: "a11y-reduced-motion" },
  ];
  const widget = document.createElement("div");
  widget.className = "local-accessibility-widget";
  widget.setAttribute("data-no-localize", "true");
  widget.dataset.lang = lang;
  widget.innerHTML = `
    <button class="local-accessibility-trigger" aria-expanded="false" aria-label="${t.accessibility}">${a11yTriggerIcon}</button>
    <div class="local-accessibility-panel" hidden>
      <div class="local-a11y-header">
        <b>${t.accessibility}</b>
        <button class="local-a11y-close" aria-label="${t.close}">${a11yIcons.close}</button>
      </div>
      <div class="local-a11y-grid">
        ${toggles
          .map(
            (toggle) =>
              `<button data-a11y="${toggle.key}" aria-pressed="false">${a11yIcons[toggle.key]}<span>${toggle.label}</span></button>`
          )
          .join("")}
      </div>
      <button class="local-a11y-reset">${a11yIcons.reset}<span>${t.reset}</span></button>
    </div>`;
  const trigger = widget.querySelector(".local-accessibility-trigger");
  const panel = widget.querySelector(".local-accessibility-panel");
  const openPanel = () => {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  const closePanel = () => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  trigger.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  widget.querySelector(".local-a11y-close").addEventListener("click", closePanel);
  toggles.forEach((toggle) => {
    const button = widget.querySelector(`[data-a11y='${toggle.key}']`);
    button.addEventListener("click", () => {
      const active = document.documentElement.classList.toggle(toggle.className);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("active", active);
      // Toggling a class doesn't trigger the MutationObserver-driven
      // re-sync (it only watches childList changes), but the guide's
      // GIF needs to react immediately to the motion toggle.
      if (toggle.key === "motion") addGuideDemonstrations();
    });
  });
  widget.querySelector(".local-a11y-reset").addEventListener("click", () => {
    toggles.forEach((toggle) => {
      document.documentElement.classList.remove(toggle.className);
      const button = widget.querySelector(`[data-a11y='${toggle.key}']`);
      button.setAttribute("aria-pressed", "false");
      button.classList.remove("active");
    });
    addGuideDemonstrations();
  });
  document.body.append(widget);
}

function syncAccessibilityLanguage() {
  const widget = document.querySelector(".local-accessibility-widget");
  if (!widget) return;
  const lang = currentLanguage();
  if (widget.dataset.lang === lang) return;
  const t = copy[lang];
  widget.dataset.lang = lang;
  widget.querySelector(".local-accessibility-trigger")?.setAttribute("aria-label", t.accessibility);
  widget.querySelector(".local-a11y-close")?.setAttribute("aria-label", t.close);
  const heading = widget.querySelector(".local-a11y-header > b");
  if (heading) heading.textContent = t.accessibility;
  const labels = { text: t.largerText, contrast: t.contrast, links: t.links, motion: t.motion };
  widget.querySelectorAll(".local-a11y-grid button").forEach((button) => {
    const span = button.querySelector("span");
    const key = button.dataset.a11y;
    if (span && labels[key]) span.textContent = labels[key];
  });
  const resetLabel = widget.querySelector(".local-a11y-reset span");
  if (resetLabel) resetLabel.textContent = t.reset;
}

// Restores the bundle's own native, card-based Guide look (per explicit
// user feedback preferring it over an earlier fully custom minimal
// rebuild) — this only replaces the fake, decorative step-cycling
// animation the bundle renders for every topic (component `en({kind})`,
// e.g. "Select → Element → Connect → Save") with one real screen
// recording, and only for the single topic worth it as a real demo. Every
// other topic keeps the bundle's native placeholder untouched, so the
// guide leans on its own already-substantial written content (kicker,
// summary, numbered steps, tip, role breakdown) instead of a GIF per topic.
const GUIDE_REAL_DEMO_TOPIC = "create-case-study";

function addGuideDemonstrations() {
  if (!/[?&]view=guide/.test(location.search)) return;
  const lang = currentLanguage();
  const t = copy[lang];
  // Match on the nav button's short label ("Δημιουργία μελέτης"/"Create
  // case study"), not the h2 (its full title varies in phrasing — "Create
  // a case study step by step" doesn't contain the literal substring
  // "create case study").
  const activeTopicLabel = (document.querySelector(".guide-nav button.active")?.textContent || "").trim();
  const isCreateTopic = /^(δημιουργία μελέτης|create case study)$/i.test(activeTopicLabel);
  const article = isCreateTopic ? document.querySelector(".guide-article") : null;
  // Clean up if a previous pass added the real demo to a topic that's no
  // longer showing (switched tabs) — .guide-article only ever renders the
  // currently-selected topic, so a stale wrapper elsewhere in the DOM
  // would otherwise linger.
  document.querySelectorAll(".guide-demo-media").forEach((el) => {
    if (el.closest(".guide-article") !== article) el.remove();
  });
  if (!article) return;
  const existing = article.querySelector(".guide-demo-media");
  const expectedSource = `/guide/${GUIDE_REAL_DEMO_TOPIC}${lang === "en" ? "-en" : ""}.gif`;
  if (existing?.dataset.lang === lang) return;
  existing?.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "guide-demo-media";
  wrapper.dataset.lang = lang;
  const image = document.createElement("img");
  image.className = "guide-real-demo";
  image.alt = t.guideDemoAlt[GUIDE_REAL_DEMO_TOPIC] || "";
  image.loading = "lazy";
  image.src = expectedSource;
  wrapper.append(image);
  // Insert right after the header, in the same slot the bundle's own fake
  // animation (component `en`) occupies.
  const header = article.querySelector("header");
  (header || article.firstElementChild)?.after(wrapper);
}

// Two of the five guide topics walk through actions a plain "user"
// (participant) role can never actually perform — creating a case study and
// managing/inviting its team are both coordinator-level actions, gated
// server-side the same as everywhere else in the app — so showing them
// unconditionally left a participant reading a guide for a permission they
// don't have. Match nav buttons by their exact label text (same technique
// as addGuideDemonstrations() above) rather than a topic id, since the DOM
// carries no id, only rendered text.
//
// A signed-out visitor gets its own, stricter set: "Create case study"
// still doesn't apply (nothing to create without an account), and "Review
// & approval" walks through in-app moderation/decision states a visitor
// has no case or submission to see — both read as instructions for an
// account this visitor doesn't have. "Team collaboration" and "Knowledge
// library" stay visible since they're relevant background even before
// signing in.
const GUIDE_TOPIC_LABELS = {
  create: /^(δημιουργία μελέτης|create case study)$/i,
  team: /^(συνεργασία ομάδας|team collaboration)$/i,
  review: /^(αξιολόγηση & έγκριση|review & approval)$/i,
};
const GUIDE_TOPICS_HIDDEN_FOR_ROLE = { user: ["create", "team"] };
const GUIDE_TOPICS_HIDDEN_ANONYMOUS = ["create", "review"];

function applyGuideRoleVisibility() {
  if (!/[?&]view=guide/.test(location.search)) return;
  const nav = document.querySelector(".guide-nav");
  if (!nav) return;
  // authCache.authenticated is undefined until the first /me check
  // resolves — treat "not yet known" the same as "signed out" so an
  // anonymous visitor never sees these topics flash on before hiding.
  const authenticated = authCache?.authenticated;
  const role = authCache?.role;
  const hiddenList = authenticated ? GUIDE_TOPICS_HIDDEN_FOR_ROLE[role] || [] : GUIDE_TOPICS_HIDDEN_ANONYMOUS;
  const hidden = new Set(hiddenList);
  let activeWasHidden = false;
  nav.querySelectorAll("button").forEach((button) => {
    const label = (button.textContent || "").trim();
    const topicId = Object.keys(GUIDE_TOPIC_LABELS).find((id) => GUIDE_TOPIC_LABELS[id].test(label));
    if (!topicId) return;
    const shouldHide = hidden.has(topicId);
    button.classList.toggle("permission-hidden", shouldHide);
    button.setAttribute("aria-hidden", String(shouldHide));
    button.disabled = shouldHide;
    if (shouldHide && button.classList.contains("active")) activeWasHidden = true;
  });
  // The now-hidden topic was the one on screen (e.g. a participant who
  // opened the guide while still a coordinator, then had their role
  // changed) — send them somewhere they can actually read.
  if (activeWasHidden) {
    nav.querySelector("button:not(.permission-hidden)")?.click();
  }
}

const guideEnglishRepairs = new Map([
  ["Πρώτα βήματα", "First steps"],
  ["Γνωρίστε το περιβάλλον του AdapTTICA", "Get to know the AdapTTICA environment"],
  ["Μάθετε πώς οργανώνεται η πλατφόρμα, πού βρίσκονται οι βασικές λειτουργίες και πώς προσαρμόζεται το περιεχόμενο στον ρόλο σας.", "Learn how the platform is organised, where to find its core features and how content adapts to your role."],
  ["Ξεκινήστε από τις Μελέτες περίπτωσης. Εκεί εμφανίζονται μόνο οι μελέτες στις οποίες έχετε πρόσβαση.", "Start with Case studies. Only the case studies you can access are shown there."],
  ["Περιήγηση στις μελέτες", "Browse case studies"],
  ["Συνδεθείτε με τον λογαριασμό σας", "Sign in with your account"],
  ["Η αρχική οθόνη εμφανίζει μόνο τις λειτουργίες που επιτρέπονται για τον ρόλο σας.", "The home screen shows only the features available to your role."],
  ["Επιλέξτε γλώσσα", "Choose a language"],
  ["Η ελληνική ή αγγλική επιλογή διατηρείται σε κάθε σελίδα και μετά από ανανέωση.", "Your Greek or English selection is preserved across pages and after refresh."],
  ["Χρησιμοποιήστε την κύρια πλοήγηση", "Use the main navigation"],
  ["Μεταβείτε στις μελέτες, την εργαλειοθήκη, τη βιβλιοθήκη ή τον οδηγό χωρίς να χάνεται η εργασία σας.", "Move between case studies, the toolkit, the library and the guide without losing your work."],
  ["Ελέγξτε τις ειδοποιήσεις", "Check notifications"],
  ["Οι προσκλήσεις, τα σχόλια και οι εκκρεμείς ενέργειες συγκεντρώνονται στο επάνω μέρος.", "Invitations, comments and pending actions are collected in the header."],
  ["Απλός χρήστης", "Standard user"],
  ["Περιήγηση και συμμετοχή σε προσκεκλημένες μελέτες.", "Browse and participate in invited case studies."],
  ["Εκπρόσωπος φορέα", "Organisation representative"],
  ["Δημιουργία μελετών και διαχείριση συνεργασίας.", "Create case studies and manage collaboration."],
  ["Διαχειριστής", "Administrator"],
  ["Πρόσβαση στη διαχείριση χρηστών και ρυθμίσεων.", "Access user management and platform settings."],
  ["Καθοδηγούμενη δημιουργία", "Guided setup"],
  ["Δημιουργήστε μια μελέτη περίπτωσης βήμα προς βήμα", "Create a case study step by step"],
  ["Ο οδηγός δημιουργίας συλλέγει μία φορά τις βασικές πληροφορίες και τις μεταφέρει αυτόματα στον συνεργατικό πίνακα.", "The setup wizard collects the core information once and transfers it automatically to the collaboration board."],
  ["Αποθηκεύστε τη μελέτη ως προσχέδιο αν δεν έχετε ακόμη όλα τα στοιχεία. Μπορείτε να συνεχίσετε αργότερα.", "Save the case study as a draft if some information is still missing. You can continue later."],
  ["Δημιουργία νέας μελέτης", "Create a new case study"],
  ["Καταγράψτε τα βασικά στοιχεία", "Enter the basic details"],
  ["Συμπληρώστε τίτλο, σύντομη περιγραφή, φορέα, περιοχή και επιθυμητή ημερομηνία ολοκλήρωσης.", "Enter a title, short description, organisation, area and target completion date."],
  ["Επιλέξτε τομέα και μέτρο", "Choose a sector and measure"],
  ["Συνδέστε τη μελέτη με έναν ή περισσότερους τομείς και με την κατάλληλη κατηγορία προσαρμογής.", "Connect the case study to one or more sectors and the appropriate adaptation category."],
  ["Προσθέστε συμμετέχοντες", "Add participants"],
  ["Ορίστε ποιοι θα συμμετέχουν, τον φορέα τους και τον ρόλο που θα έχουν.", "Define who will participate, their organisation and their role."],
  ["Ρυθμίστε τη συνεργασία", "Configure collaboration"],
  ["Επιλέξτε το κατάλληλο πρότυπο, τα δικαιώματα και τους κανόνες πρόσβασης.", "Choose the appropriate template, permissions and access rules."],
  ["Ελέγξτε και δημιουργήστε", "Review and create"],
  ["Επιβεβαιώστε τη σύνοψη και ανοίξτε τον έτοιμο συνεργατικό πίνακα.", "Confirm the summary and open the prepared collaboration board."],
  ["Δεν δημιουργεί νέα μελέτη, αλλά συμμετέχει μετά από πρόσκληση.", "Cannot create a new case study, but can participate after being invited."],
  ["Δημιουργεί και διαχειρίζεται μελέτες του φορέα του.", "Creates and manages case studies for their organisation."],
  ["Δημιουργεί μελέτες και εποπτεύει όλες τις ροές.", "Creates case studies and oversees all workflows."],
  ["Συνεργασία και ρόλοι", "Collaboration and roles"],
  ["Οργανώστε τη συνεργασία της ομάδας", "Organise team collaboration"],
  ["Προσκαλέστε τα κατάλληλα άτομα, αποδώστε σαφείς ρόλους και παρακολουθήστε τη συμμετοχή, τα σχόλια και τις αποφάσεις.", "Invite the right people, assign clear roles and track participation, comments and decisions."],
  ["Αποδώστε τον ελάχιστο απαραίτητο βαθμό πρόσβασης και αναβαθμίστε τον μόνο όταν αλλάξει η ευθύνη ενός μέλους.", "Grant the minimum access required and expand it only when a member's responsibility changes."],
  ["Άνοιγμα ενεργής μελέτης", "Open an active case study"],
  ["Ανοίξτε τη μελέτη", "Open the case study"],
  ["Μεταβείτε στην καρτέλα Συμμετέχοντες για να δείτε την υπάρχουσα ομάδα και τους φορείς.", "Open the Participants tab to view the current team and organisations."],
  ["Στείλτε πρόσκληση", "Send an invitation"],
  ["Προσθέστε τη διεύθυνση email, τον φορέα και τον ρόλο του νέου μέλους.", "Add the new member's email address, organisation and role."],
  ["Ορίστε δικαιώματα", "Set permissions"],
  ["Καθορίστε ποιος μπορεί να σχολιάζει, να επεξεργάζεται, να προσθέτει αρχεία ή να εγκρίνει.", "Define who can comment, edit, add files or approve."],
  ["Παρακολουθήστε τις ενημερώσεις", "Follow updates"],
  ["Χρησιμοποιήστε τις ειδοποιήσεις, το ιστορικό έγκρισης και τις αποφάσεις για πλήρη εικόνα της συνεργασίας.", "Use notifications, approval history and decisions for a complete view of collaboration."],
  ["Σχολιάζει και προσθέτει υλικό όπου έχει δικαίωμα.", "Comments and adds material where permission is granted."],
  ["Προσκαλεί μέλη και διαχειρίζεται ρόλους και πρόσβαση.", "Invites members and manages roles and access."],
  ["Εποπτεύει χρήστες, ρόλους και δικαιώματα σε όλη την πλατφόρμα.", "Oversees users, roles and permissions across the platform."],
  ["Ανοικτή γνώση", "Open knowledge"],
  ["Βρείτε και επαναχρησιμοποιήστε τεκμηριωμένο υλικό", "Find and reuse evidence-based material"],
  ["Αναζητήστε μελέτες, δεδομένα, καλές πρακτικές και μεθοδολογίες ή συνδέστε νέο υλικό με μια συγκεκριμένη μελέτη.", "Search for studies, data, good practices and methodologies, or link new material to a specific case study."],
  ["Προσθέστε σαφή περιγραφή και σωστές ετικέτες. Έτσι ο πόρος θα μπορεί να βρεθεί και να επαναχρησιμοποιηθεί ευκολότερα.", "Add a clear description and accurate tags so the resource can be found and reused more easily."],
  ["Άνοιγμα βιβλιοθήκης γνώσης", "Open the knowledge library"],
  ["Αναζητήστε με λέξεις-κλειδιά", "Search with keywords"],
  ["Χρησιμοποιήστε τίτλο, φορέα, θεματική ή περιοχή για να περιορίσετε τα αποτελέσματα.", "Use a title, organisation, theme or area to narrow the results."],
  ["Εφαρμόστε φίλτρα", "Apply filters"],
  ["Συνδυάστε τύπο πόρου, τομέα και σχετική μελέτη χωρίς προεπιλεγμένους περιορισμούς.", "Combine resource type, sector and related case study without preset restrictions."],
  ["Ανοίξτε τις λεπτομέρειες", "Open the details"],
  ["Ελέγξτε την περιγραφή, τα μεταδεδομένα, την ημερομηνία ενημέρωσης και τις συσχετίσεις.", "Review the description, metadata, update date and relationships."],
  ["Κατεβάστε ή προσθέστε υλικό", "Download or add material"],
  ["Χρησιμοποιήστε τη λήψη ή, αν έχετε δικαίωμα, τη σελίδα προσθήκης νέου πόρου.", "Download the file or, if permitted, use the page for adding a new resource."],
  ["Περιηγείται στη δημόσια βιβλιοθήκη και χρησιμοποιεί διαθέσιμους πόρους.", "Browses the public library and uses available resources."],
  ["Προσθέτει πόρους, προσχέδια και συσχετίσεις με μελέτες.", "Adds resources, drafts and relationships to case studies."],
  ["Ελέγχει, εγκρίνει και οργανώνει το δημοσιευμένο περιεχόμενο.", "Reviews, approves and organises published content."],
  ["Ολοκλήρωση και έγκριση", "Completion and approval"],
  ["Ολοκληρώστε τη μελέτη με διαφανή διαδικασία", "Complete the case study through a transparent process"],
  ["Συγκεντρώστε σχόλια, ζητήστε διορθώσεις, καταγράψτε εγκρίσεις και μετακινήστε τη μελέτη με σαφήνεια μέχρι την ολοκλήρωση.", "Collect comments, request changes, record approvals and move the case study clearly through to completion."],
  ["Χρησιμοποιήστε συγκεκριμένες παρατηρήσεις και συνδέστε κάθε αίτημα διόρθωσης με την αντίστοιχη ενότητα.", "Use specific feedback and connect each change request to the relevant section."],
  ["Προβολή ροής αξιολόγησης", "View the review workflow"],
  ["Ελέγξτε την πληρότητα", "Check completeness"],
  ["Βεβαιωθείτε ότι οι απαιτούμενες ενότητες, αποφάσεις και αρχεία έχουν ολοκληρωθεί.", "Ensure that all required sections, decisions and files are complete."],
  ["Υποβάλετε για έλεγχο", "Submit for review"],
  ["Αλλάξτε την κατάσταση σε Υποβλήθηκε για έλεγχο και ειδοποιήστε τους εξουσιοδοτημένους εκπροσώπους.", "Change the status to Submitted for review and notify authorised representatives."],
  ["Καταγράψτε παρατηρήσεις", "Record feedback"],
  ["Οι εξουσιοδοτημένοι εκπρόσωποι μπορούν να σχολιάσουν, να ζητήσουν αλλαγές ή να εγκρίνουν το αποτέλεσμα.", "Authorised representatives can comment, request changes or approve the output."],
  ["Ολοκληρώστε τη διαδικασία", "Complete the process"],
  ["Μετά την τελική έγκριση χαρακτηρίστε τη μελέτη ως Ολοκληρωμένη και διατηρήστε το ιστορικό.", "After final approval, mark the case study as Completed and preserve the history."],
  ["Βλέπει την κατάσταση και σχολιάζει όπου έχει πρόσβαση.", "Views the status and comments where access is granted."],
  ["Υποβάλλει, εγκρίνει ή ολοκληρώνει τη διαδικασία σύμφωνα με τα δικαιώματά του.", "Submits, approves or completes the process according to their permissions."],
  ["Εποπτεύει τις καταστάσεις και παρεμβαίνει σε προβλήματα πρόσβασης ή περιεχομένου.", "Oversees statuses and resolves access or content issues."],
  ["Βήμα προς βήμα", "Step by step"],
  ["Πώς λειτουργεί", "How it works"],
  ["Χρήσιμη συμβουλή", "Helpful tip"],
  ["Δικαιώματα πρόσβασης", "Access permissions"],
  ["Τι μπορεί να κάνει κάθε ρόλος", "What each role can do"],
  ["Έτοιμοι να συνεχίσετε;", "Ready to continue?"],
  ["Η μετάβαση είναι προαιρετική. Μπορείτε να παραμείνετε στον οδηγό και να διαβάσετε οποιαδήποτε άλλη ενότητα.", "Moving to the feature is optional. You can stay in the guide and read any other section."],
  ["Οδηγός Χρήσης", "User guide"],
  ["Κέντρο βοήθειας", "Help centre"],
  ["Κατανοήστε κάθε βασική λειτουργία πριν μεταβείτε στο αντίστοιχο σημείο της πλατφόρμας.", "Understand each core feature before moving to the relevant area of the platform."],
  ["Ενότητες οδηγού χρήσης", "User guide sections"],
  ["Επισκόπηση", "Overview"],
]);

// Extracted+verified programmatically against the bundle's own internal EL→EN
// translation dictionary (every entry above has a matching key there) rather
// than hand-typed, so it can't silently drift from the bundle's real copy.
function repairGuideEnglishCopy() {
  if (currentLanguage() !== "en" || !/[?&]view=guide/.test(location.search)) return;
  const root = document.querySelector("main") || document.body;
  replaceExactCopy(root, guideEnglishRepairs);
  root.querySelectorAll("[aria-label], [title], [placeholder]").forEach((element) => {
    ["aria-label", "title", "placeholder"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      const repaired = guideEnglishRepairs.get(value?.trim());
      if (repaired) element.setAttribute(attribute, repaired);
    });
  });
}

const platformEnglishRepairs = new Map([
  ["Αναζήτηση", "Search"],
  ["Options prosvasimotitas", "Accessibility options"],
  // The register form's heading, description, submit button and
  // sign-in-toggle link don't branch on language at all in the bundle
  // (unlike its input labels, which do) — always Greek regardless of the
  // active language, the same bug pattern as the cases empty state above.
  ["Δημιουργήστε λογαριασμό", "Create an account"],
  ["Εγγραφείτε στον χώρο συνδημιουργίας του AdapTTICA.", "Register for the AdapTTICA co-creation space."],
  ["Εγγραφή", "Register"],
  ["Έχετε ήδη λογαριασμό;", "Already have an account?"],
  ["Σύνδεση", "Sign in"],
  ["Απαιτεί έγκριση φορέα", "Organisation approval required"],
  ["Η αξιολόγηση και έγκριση γίνεται από εκπροσώπους φορέων.", "Review and approval are handled by organisation representatives."],
]);

// The admin screen interpolates a live count into some of these strings
// (e.g. "0 energoi christes"), so they need substring replacement rather
// than an exact full-text-node match.
const adminEnglishRepairs = new Map([
  ["energoi christes", "active users"],
  ["Kentrikos elegchos prosvasis me pragmatiko istoriko metavolon.", "Central access control with a real change history."],
  ["Diacheiristes", "Administrators"],
  ["Katagegrammenes energeies", "Logged actions"],
  ["Allagi prosvasis me amesi apothikeysi", "Access changes save immediately"],
  ["Istoriko elegchoy", "Audit log"],
  ["Pragmatikes energeies christon kai metavoles prosvasis", "Real user actions and access changes"],
  ["Ananeosi", "Refresh"],
]);

function replaceExactCopy(root, repairs) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const repaired = repairs.get(node.nodeValue.trim());
    if (repaired) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), repaired);
  }
}

function replacePartialCopy(root, repairs) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    for (const [from, to] of repairs) {
      if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.split(from).join(to);
    }
  }
}







const HOMEPAGE_JOURNEY_VISUAL = {
  el: "Ο κύκλος μετάβασης του Pathways2Resilience: προετοιμασία βάσης, κοινό όραμα και σχεδιασμός διαδρομών προς την κλιματική ανθεκτικότητα",
  en: "Pathways2Resilience transition cycle: prepare the ground, build a shared vision and design pathways towards climate resilience",
};

// The User Journey diagram is the methodological overview the hero promises.
// Keep it as a real image (rather than a CSS background) so its meaning and
// bilingual alternative text remain available to assistive technology.
// eslint-disable-next-line no-unused-vars -- retained as a rollback-safe legacy renderer while the regional journey replaces it.
function installHomepageJourneyVisual() {
  if (currentView() !== "home") return;
  const visual = document.querySelector(".hero-visual");
  const photo = visual?.querySelector(".hero-photo");
  if (!visual || !photo) return;
  visual.classList.add("homepage-journey-visual");
  visual.setAttribute("data-no-localize", "true");
  visual.setAttribute("aria-label", HOMEPAGE_JOURNEY_VISUAL[currentLanguage()]);
  photo.classList.remove("crop-a");
  photo.classList.add("homepage-journey-visual-frame");
  let image = photo.querySelector("img");
  if (!image) {
    image = document.createElement("img");
    image.src = "/p2r-transition-cycle.png";
    image.decoding = "async";
    photo.replaceChildren(image);
  }
  image.alt = HOMEPAGE_JOURNEY_VISUAL[currentLanguage()];
}

// Pentsiou review comment #6: "A shared pathway towards 2027" reads as
// though Adaptation Pathways themselves are the 2027 deliverable, when in
// the P2R methodology a Pathway is long-term (out to end-of-century) and
// 2027 is just how long this project runs. Retitle the homepage's mission
// section to name the project's own timeline instead of overloading
// "pathway" — "Regional Resilience Journey" is the term the review comment
// itself proposes.
function repairPathwayTerminology() {
  const lang = currentLanguage();

  const heading = document.querySelector(".journey-section h2");
  if (heading) {
    const expected = lang === "el" ? "Περιφερειακή Πορεία Ανθεκτικότητας" : "Regional Resilience Journey";
    if (
      heading.textContent !== expected &&
      /^(Μια κοινή πορεία προς|A shared pathway towards|Περιφερειακή Πορεία Ανθεκτικότητας|Regional Resilience Journey)/.test(heading.textContent || "")
    ) {
      heading.textContent = expected;
    }
  }
}

function repairPlatformLanguageLeaks() {
  if (currentLanguage() === "el") {
    replacePartialCopy(document.body, new Map([["Region of Attica", "Περιφέρεια Αττικής"]]));
    return;
  }
  replaceExactCopy(document.body, platformEnglishRepairs);
  document.querySelectorAll("[aria-label], [title], [placeholder]").forEach((element) => {
    ["aria-label", "title", "placeholder"].forEach((attribute) => {
      const repaired = platformEnglishRepairs.get(element.getAttribute(attribute)?.trim());
      if (repaired) element.setAttribute(attribute, repaired);
    });
  });
  if (/[?&]view=admin/.test(location.search)) {
    replacePartialCopy(document.querySelector("main") || document.body, adminEnglishRepairs);
  }
}

// The header's "Register" button and "Sign in" button both call the exact
// same navigation function with the exact same argument (`go("login")`) —
// the auth page always mounts in sign-in mode regardless of which one was
// clicked, and it reads no query param or prop that could tell it
// otherwise. The only way to reach the register form is the *internal*
// "Don't have an account? Register" toggle inside the auth page itself.
// This records that the header's Register button was clicked, then clicks
// that internal toggle once the auth page has mounted.
function applyRegisterIntent() {
  if (currentView() !== "login" || !sessionStorage.getItem(REGISTER_INTENT_KEY)) return;
  const toggle = document.querySelector(".switch-auth button");
  if (!toggle) return;
  // The toggle shows the *other* mode's label; "Register"/"Εγγραφή" means
  // the form is currently showing sign-in and clicking switches to signup.
  if (/register|εγγραφή/i.test(toggle.textContent || "")) toggle.click();
  sessionStorage.removeItem(REGISTER_INTENT_KEY);
}





// The case page's "Workshop outputs" tab (.workshop-output-section) is
// entirely decorative in the bundle: three permanently hardcoded demo
// cards with no data binding, and its "New workshop output" button just
// shows a toast saying the form isn't available — even to the coordinators
// it's only ever shown to. server/src/routes/workshopOutputs.js is the
// real backend for this; the functions below add a real creation form and
// inject real items into the same .output-grid the demo cards live in
// (they stay alongside the demo cards, which can't be removed since
// they're baked into the bundle's own JSX).
// Handles both creating a new output (no `output` passed) and editing an
// existing one's title/description/label/file (pass the current record) —
// coordinators/representatives needed a way to replace an output's file
// after the fact, not just attach one once at creation.
function buildWorkshopOutputForm(lang, caseId, { onSuccess, output }) {
  const isEdit = Boolean(output);
  const t = copy[lang];
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop workshop-output-overlay";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <form class="modal-card workshop-output-modal">
      <button type="button" class="modal-close icon-btn" aria-label="${t.close}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
      </button>
      <span class="feature-icon cyan-bg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </span>
      <h2></h2>
      <p></p>
      <label></label>
      <label></label>
      <label></label>
      <label></label>
      <div class="modal-actions">
        <button type="button" class="btn secondary workshop-output-cancel"></button>
        <button type="submit" class="btn primary workshop-output-submit"></button>
      </div>
    </form>`;

  overlay.querySelector("h2").textContent = isEdit ? t.workshopOutputEditModalTitle : t.workshopOutputModalTitle;
  overlay.querySelector("p").textContent = isEdit ? t.workshopOutputEditModalDescription : t.workshopOutputModalDescription;
  const [titleLabel, descriptionLabel, workshopLabelLabel, fileLabel] = overlay.querySelectorAll("label");
  const titleInput = Object.assign(document.createElement("input"), { name: "title", required: true });
  titleLabel.append(t.workshopOutputTitleLabel, titleInput);
  const descriptionField = document.createElement("textarea");
  descriptionField.name = "description";
  descriptionLabel.append(t.workshopOutputDescriptionLabel, descriptionField);
  const workshopLabelInput = Object.assign(document.createElement("input"), {
    name: "workshopLabel",
    placeholder: t.workshopOutputWorkshopLabelPlaceholder,
  });
  workshopLabelLabel.append(t.workshopOutputWorkshopLabel, workshopLabelInput);
  const fileInput = document.createElement("input");
  fileInput.name = "file";
  fileInput.type = "file";
  fileLabel.append(isEdit ? t.workshopOutputReplaceFileLabel : t.workshopOutputFileLabel, fileInput);
  if (isEdit) {
    titleInput.value = lang === "el" ? output.title_el : output.title_en;
    descriptionField.value = (lang === "el" ? output.description_el : output.description_en) || "";
    workshopLabelInput.value = output.workshop_label || "";
    if (output.file_name) {
      const current = document.createElement("small");
      current.className = "workshop-output-current-file";
      current.textContent = `${t.workshopOutputCurrentFileLabel} ${output.file_name}`;
      fileLabel.append(current);
    }
  }
  overlay.querySelector(".workshop-output-cancel").textContent = t.workshopOutputCancel;
  overlay.querySelector(".workshop-output-submit").textContent = isEdit ? t.workshopOutputSave : t.workshopOutputSubmit;

  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector(".workshop-output-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  const form = overlay.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const titleValue = form.title.value.trim();
    if (!titleValue) return;
    const submitButton = form.querySelector(".workshop-output-submit");
    submitButton.disabled = true;
    submitButton.textContent = t.workshopOutputSubmitting;
    try {
      let uploaded = null;
      const file = fileInput.files[0];
      if (file) {
        const uploadForm = new FormData();
        uploadForm.set("file", file);
        const uploadRes = await fetch("/api/v1/files/upload", { method: "POST", credentials: "same-origin", body: uploadForm });
        const uploadBody = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadBody?.error?.message || "Upload failed.");
        uploaded = uploadBody.data.file;
      }
      const payload = {
        titleEl: titleValue,
        titleEn: titleValue,
        descriptionEl: form.description.value.trim(),
        descriptionEn: form.description.value.trim(),
        workshopLabel: form.workshopLabel.value.trim(),
      };
      // Omitting fileKey entirely (rather than sending it as undefined)
      // matters here: the edit endpoint treats a present fileKey as "the
      // file was replaced" and an absent one as "leave the existing file
      // alone" — this is the only path that should ever send it.
      if (uploaded) {
        payload.fileKey = uploaded.key;
        payload.fileName = uploaded.name;
        payload.mimeType = uploaded.type;
        payload.byteSize = uploaded.size;
      }
      const res = await fetch(
        isEdit
          ? `/api/v1/workshop-outputs/${encodeURIComponent(output.id)}`
          : `/api/v1/cases/${encodeURIComponent(caseId)}/workshop-outputs`,
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error("request failed");
      const body = await res.json();
      showRuntimeToast({
        type: "success",
        title: isEdit ? t.workshopOutputEditSuccessTitle : t.workshopOutputSuccessTitle,
        message: isEdit ? undefined : t.workshopOutputSuccessMessage,
      });
      close();
      onSuccess?.(body.data.output);
    } catch {
      showRuntimeToast({
        type: "error",
        title: isEdit ? t.workshopOutputEditErrorTitle : t.workshopOutputErrorTitle,
        message: isEdit ? undefined : t.workshopOutputErrorMessage,
      });
      submitButton.disabled = false;
      submitButton.textContent = isEdit ? t.workshopOutputSave : t.workshopOutputSubmit;
    }
  });

  return overlay;
}

// The real Knowledge Library submission form (.resource-create-card) is
// only reachable by "representative"/"admin" — the bundle's own client-side
// router redirects any other role away from ?view=resource-create, and the
// "Add resource" button on the listing page is permanently disabled for
// them (see Ge.user.permissions, which has no "publishKnowledge"). That
// directly conflicts with "all registered participants should be allowed
// to submit new material" — since the real form can't be reached, this
// builds a completely separate, hand-rolled modal (same pattern as
// buildWorkshopOutputForm above, for the same underlying reason: the real
// UI path is a dead end for this audience) that posts straight to
// POST /api/v1/resources, landing as pending_review like any other
// submission.
function buildResourceSubmissionForm(lang, { onSuccess }) {
  const t = copy[lang];
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop resource-submit-overlay";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <form class="modal-card resource-submit-modal">
      <button type="button" class="modal-close icon-btn" aria-label="${t.close}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
      </button>
      <h2></h2>
      <p></p>
      <label></label>
      <label></label>
      <label></label>
      <label></label>
      <label></label>
      <label></label>
      <p class="licence-field-hint"></p>
      <label class="licence-custom-label" hidden></label>
      <div class="modal-actions">
        <button type="button" class="btn secondary resource-submit-cancel"></button>
        <button type="submit" class="btn primary resource-submit-submit"></button>
      </div>
    </form>`;

  overlay.querySelector("h2").textContent = t.resourceSubmitModalTitle;
  overlay.querySelector("p:not(.licence-field-hint)").textContent = t.resourceSubmitModalDescription;
  const [titleLabel, authorLabel, typeLabel, descriptionLabel, tagsLabel, fileLabel] = overlay.querySelectorAll("label:not(.licence-custom-label)");

  titleLabel.append(t.resourceSubmitTitleLabel, Object.assign(document.createElement("input"), { name: "title", required: true }));
  authorLabel.append(t.resourceSubmitAuthorLabel, Object.assign(document.createElement("input"), { name: "authorOrganisation", required: true }));

  const typeSelect = document.createElement("select");
  typeSelect.name = "type";
  typeSelect.required = true;
  typeSelect.append(Object.assign(document.createElement("option"), { value: "", disabled: true, selected: true, textContent: t.resourceSubmitTypePlaceholder }));
  t.resourceTypeOptions.forEach((option) => {
    typeSelect.append(Object.assign(document.createElement("option"), { value: option.value, textContent: option.label }));
  });
  typeLabel.append(t.resourceSubmitTypeLabel, typeSelect);

  const descriptionField = document.createElement("textarea");
  descriptionField.name = "description";
  descriptionField.required = true;
  descriptionLabel.append(t.resourceSubmitDescriptionLabel, descriptionField);
  tagsLabel.append(t.resourceSubmitTagsLabel, Object.assign(document.createElement("input"), { name: "tags" }));

  const fileInput = document.createElement("input");
  fileInput.name = "file";
  fileInput.type = "file";
  fileInput.required = true;
  fileLabel.append(t.resourceSubmitFileLabel, fileInput);

  const licenceSelect = document.createElement("select");
  licenceSelect.name = "licence";
  licenceSelect.required = true;
  licenceSelect.append(Object.assign(document.createElement("option"), { value: "", disabled: true, selected: true, textContent: t.licencePlaceholderOption }));
  t.licenceOptions.forEach((option) => {
    licenceSelect.append(Object.assign(document.createElement("option"), { value: option.value, textContent: option.label }));
  });
  const licenceLabel = document.createElement("label");
  licenceLabel.append(t.licenceSectionHeading, licenceSelect);
  overlay.querySelector(".licence-field-hint").before(licenceLabel);

  const hint = overlay.querySelector(".licence-field-hint");
  const customLabel = overlay.querySelector(".licence-custom-label");
  const customInput = document.createElement("input");
  customInput.name = "licenceCustom";
  customLabel.append(t.licenceCustomLabel, customInput);
  const updateHint = () => {
    const option = t.licenceOptions.find((entry) => entry.value === licenceSelect.value);
    const isOther = licenceSelect.value === "other";
    customLabel.hidden = !isOther;
    customInput.required = isOther;
    hint.replaceChildren();
    if (!option) return;
    hint.append(document.createTextNode(`${option.hint} `));
    if (option.url) {
      const link = Object.assign(document.createElement("a"), { href: option.url, target: "_blank", rel: "noopener", textContent: option.label.split(" — ").pop() });
      hint.append(link);
    }
  };
  licenceSelect.addEventListener("change", updateHint);
  updateHint();

  overlay.querySelector(".resource-submit-cancel").textContent = t.resourceSubmitCancel;
  overlay.querySelector(".resource-submit-submit").textContent = t.resourceSubmitSubmit;

  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector(".resource-submit-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  const form = overlay.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector(".resource-submit-submit");
    submitButton.disabled = true;
    submitButton.textContent = t.resourceSubmitSubmitting;
    try {
      const file = fileInput.files[0];
      if (!file) throw new Error("A file is required.");
      const uploadForm = new FormData();
      uploadForm.set("file", file);
      const uploadRes = await fetch("/api/v1/files/upload", { method: "POST", credentials: "same-origin", body: uploadForm });
      const uploadBody = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadBody?.error?.message || "Upload failed.");
      const uploaded = uploadBody.data.file;

      const titleValue = form.title.value.trim();
      const descriptionValue = form.description.value.trim();
      const tags = form.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
      const res = await fetch("/api/v1/resources", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleEl: titleValue,
          titleEn: titleValue,
          descriptionEl: descriptionValue,
          descriptionEn: descriptionValue,
          authorOrganisation: form.authorOrganisation.value.trim(),
          resourceType: typeSelect.value,
          tags,
          fileKey: uploaded.key,
          fileName: uploaded.name,
          fileType: uploaded.type,
          fileSize: uploaded.size,
          licence: licenceSelect.value,
          licenceOther: licenceSelect.value === "other" ? customInput.value.trim() : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Submission failed.");
      showRuntimeToast({ type: "success", title: t.resourceSubmitSuccessTitle, message: t.resourceSubmitSuccessMessage });
      close();
      onSuccess?.(body.data.resource);
    } catch (error) {
      showRuntimeToast({ type: "error", title: t.resourceSubmitErrorTitle, message: error instanceof Error ? error.message : t.resourceSubmitErrorMessage });
      submitButton.disabled = false;
      submitButton.textContent = t.resourceSubmitSubmit;
    }
  });

  return overlay;
}

// The listing page's "Add resource" button is permanently disabled (with a
// title tooltip) for any role without "publishKnowledge" — replace that
// with a working button that opens the custom modal above instead, and
// correct the accompanying copy, which otherwise wrongly implies
// participants can't contribute material at all.
function enableParticipantResourceSubmission() {
  if (currentView() !== "knowledge") return;
  // This component re-renders itself very frequently on its own (confirmed
  // live: even an isolated, manual removeAttribute("title") on this exact
  // node reverts in well under 200ms with no observable childList/
  // characterData mutation our MutationObserver would catch to re-run this
  // patch) — too fast to chase with any reasonable interval. Re-applying
  // unconditionally on every pass, rather than gating it behind a one-time
  // flag, is a best effort: the `disabled` override has proven reliably
  // sticky in testing (React appears to only ever WRITE it, never
  // compares-and-skips, so our override always lands), but the `title`
  // tooltip may still occasionally show its original, now-inaccurate text
  // between re-renders — a cosmetic gap, not a functional one, since the
  // button's actual clickability (disabled=false + the listener below) is
  // what matters and is unaffected.
  const restrictedButton = [...document.querySelectorAll(".restricted-action > button.btn.primary")].find((button) =>
    /Προσθήκη πόρου|Add resource/i.test(button.textContent || "")
  );
  const lang = currentLanguage();
  if (restrictedButton) {
    restrictedButton.disabled = false;
    restrictedButton.removeAttribute("title");
    const helperText = restrictedButton.closest(".restricted-action")?.querySelector("small");
    if (helperText) {
      helperText.textContent =
        lang === "el"
          ? "Το υλικό σας θα ελεγχθεί πριν δημοσιευτεί στην ανοικτή βιβλιοθήκη."
          : "Your material will be reviewed before it's published in the open library.";
    }
  }
  if (restrictedButton && restrictedButton.dataset.adapttica !== "enabled") {
    restrictedButton.dataset.adapttica = "enabled";
    restrictedButton.addEventListener("click", () => {
      const overlay = buildResourceSubmissionForm(currentLanguage(), {
        onSuccess: () => {
          window.__adapttica_resourceListCache = [];
        },
      });
      document.body.append(overlay);
      overlay.querySelector('input[name="title"]').focus();
    });
  }
  const infoBanner = [...document.querySelectorAll("main *")].find(
    (element) =>
      element.childElementCount === 0 &&
      /^(Διαφορετικά επίπεδα δημοσίευσης|Different publishing levels|Πώς οι πόροι γίνονται δημόσιοι|How resources become public)$/i.test(
        (element.textContent || "").trim()
      )
  );
  if (infoBanner) {
    infoBanner.textContent = lang === "el" ? "Πώς οι πόροι γίνονται δημόσιοι" : "How resources become public";
  }
  const bannerText = infoBanner?.parentElement?.querySelector("p");
  if (bannerText) {
    bannerText.textContent =
      lang === "el"
        ? "Υποβάλετε το υλικό σας για έλεγχο. Μόλις εγκριθεί από τον υπεύθυνο της βιβλιοθήκης, θα είναι διαθέσιμο σε όλους στην ανοικτή βιβλιοθήκη."
        : "Submit your material for review. Once the library moderator approves it, everyone can find it in the open library.";
  }
}

function buildOutputCard(output, lang, { canManage } = {}) {
  const title = (lang === "el" ? output.title_el : output.title_en) || output.title_el || output.title_en;
  const description = (lang === "el" ? output.description_el : output.description_en) || "";
  const statusLabel = (lang === "el" ? output.status_label_el : output.status_label_en) || output.status;
  const formatter = new Intl.DateTimeFormat(lang === "el" ? "el-GR" : "en-GB", { day: "2-digit", month: "short" });
  let created = output.created_at,
    updated = output.updated_at;
  try {
    created = formatter.format(new Date(output.created_at));
    updated = formatter.format(new Date(output.updated_at));
  } catch {
    // Keep the raw ISO strings if parsing fails; still readable.
  }
  const datesText =
    lang === "el" ? `Δημιουργήθηκε ${created} · Ενημερώθηκε ${updated}` : `Created ${created} · Updated ${updated}`;

  const article = document.createElement("article");
  article.className = "output-card";
  article.dataset.realOutputId = output.id;
  article.dataset.lang = lang;
  // See the data-no-localize comment on the toast stack: this card's text
  // comes from our own already-localized fields, and the bundle's global
  // translator would otherwise transliterate anything it doesn't recognise
  // (e.g. a user-typed title) into garbled Latin text on language switch.
  article.setAttribute("data-no-localize", "true");
  article.innerHTML = `
    <div class="output-image crop-real" aria-hidden="true">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>
    </div>
    <div class="output-body">
      <span class="output-status"></span>
      <em></em>
      <h3></h3>
      <p></p>
      <small></small>
      <small></small>
    </div>`;
  const statusClass = { submitted: "status-0", approved: "status-1", changes_requested: "status-2" }[output.status];
  const body = article.querySelector(".output-body");
  const statusEl = body.querySelector(".output-status");
  statusEl.textContent = statusLabel;
  if (statusClass) statusEl.classList.add(statusClass);
  body.querySelector("em").textContent = output.workshop_label || "";
  body.querySelector("h3").textContent = title;
  body.querySelector("p").textContent = description;
  const smalls = body.querySelectorAll("small");
  smalls[0].textContent = output.author_name || "";
  smalls[1].textContent = datesText;

  // Only a real attachment makes the card meaningfully clickable — the
  // three permanent bundle demo cards have no backing file at all, and
  // never will, so they're deliberately left non-interactive rather than
  // faked into looking like they open something.
  if (output.file_url) {
    article.classList.add("output-card-has-file");
    article.setAttribute("role", "link");
    article.tabIndex = 0;
    const open = () => window.open(output.file_url, "_blank", "noopener");
    article.addEventListener("click", (event) => {
      if (event.target.closest(".output-delete, .output-edit")) return;
      open();
    });
    article.addEventListener("keydown", (event) => {
      if (event.target.closest(".output-delete, .output-edit")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    const fileNote = document.createElement("small");
    fileNote.className = "output-file-note";
    fileNote.textContent = `📎 ${output.file_name || (lang === "el" ? "Άνοιγμα αρχείου" : "Open file")}`;
    body.append(fileNote);
  }

  if (canManage) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-btn output-edit";
    editButton.setAttribute("aria-label", lang === "el" ? "Επεξεργασία" : "Edit");
    editButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (document.querySelector(".workshop-output-overlay")) return;
      const overlay = buildWorkshopOutputForm(currentLanguage(), currentCaseId(), {
        output,
        onSuccess: (updated) => {
          const refreshed = buildOutputCard(updated, currentLanguage(), { canManage: true });
          article.replaceWith(refreshed);
        },
      });
      document.body.append(overlay);
      overlay.querySelector('input[name="title"]').focus();
    });
    article.querySelector(".output-image").append(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-btn output-delete";
    deleteButton.setAttribute("aria-label", lang === "el" ? "Διαγραφή" : "Delete");
    deleteButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';
    let armed = false;
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const t = copy[currentLanguage()];
      if (!armed) {
        armed = true;
        deleteButton.classList.add("danger-armed");
        deleteButton.setAttribute("title", t.workshopOutputDeleteConfirm);
        setTimeout(() => {
          armed = false;
          deleteButton.classList.remove("danger-armed");
          deleteButton.removeAttribute("title");
        }, 4000);
        return;
      }
      deleteButton.disabled = true;
      try {
        const res = await fetch(`/api/v1/workshop-outputs/${encodeURIComponent(output.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("request failed");
        showRuntimeToast({ type: "success", title: t.workshopOutputDeleteSuccessTitle });
        article.remove();
      } catch {
        showRuntimeToast({ type: "error", title: t.workshopOutputDeleteErrorTitle });
        deleteButton.disabled = false;
        armed = false;
        deleteButton.classList.remove("danger-armed");
      }
    });
    article.querySelector(".output-image").append(deleteButton);
  }

  return article;
}

// Shared "can this viewer actually manage this case's content" check (see
// getCurrentCaseRole() above) — mirrors the server's own
// requireCaseAccess(..., ["representative", "coordinator", "admin"]) gate
// used for workshop outputs, decisions, invitations and member management.
// Case-level "representative" and "coordinator" are both management roles
// here (only case settings/deletion stay coordinator/admin-only); the
// bundle's own native controls instead gate on the coarser platform role,
// letting a case member without either of these roles see them enabled and
// then hit a 403 (confirmed live for workshop output creation).
async function isCaseCoordinator(caseId) {
  const role = await getCurrentCaseRole(caseId);
  return role === "representative" || role === "coordinator" || role === "admin";
}

let workshopOutputCreatePermissionPatchedFor = null;
async function patchWorkshopOutputCreatePermission() {
  const button = [...document.querySelectorAll(".workshop-output-section button.btn.primary")].find((el) =>
    /νέο αποτέλεσμα εργαστηρίου|new workshop output/i.test(el.textContent || "")
  );
  if (!button || button === workshopOutputCreatePermissionPatchedFor) return;
  const caseId = currentCaseId();
  if (!caseId) return;
  const canManage = await isCaseCoordinator(caseId);
  const currentButton = [...document.querySelectorAll(".workshop-output-section button.btn.primary")].find((el) =>
    /νέο αποτέλεσμα εργαστηρίου|new workshop output/i.test(el.textContent || "")
  );
  if (!currentButton || canManage) return;
  workshopOutputCreatePermissionPatchedFor = currentButton;
  currentButton.disabled = true;
  currentButton.title =
    currentLanguage() === "el"
      ? "Η προσθήκη αποτελεσμάτων απαιτεί δικαίωμα διαχείρισης της μελέτης."
      : "Adding outputs requires case management permission.";
}

function showWorkshopOutputModal(caseId) {
  if (document.querySelector(".workshop-output-overlay")) return;
  const lang = currentLanguage();
  const overlay = buildWorkshopOutputForm(lang, caseId, {
    // A successful creation already proves the server accepted this viewer
    // as coordinator/admin for this case, so the new card can always show
    // the delete affordance without a second permission round-trip.
    onSuccess: (output) => {
      const grid = document.querySelector(".output-grid");
      grid?.prepend(buildOutputCard(output, lang, { canManage: true }));
    },
  });
  document.body.append(overlay);
  overlay.querySelector('input[name="title"]').focus();
}

let workshopOutputsFetchInFlight = false;

// Runs on every sync pass; the check is cheap (an element lookup) so
// calling it often is fine, and it only actually fetches when the grid is
// showing solely the bundle's three permanent demo cards (including right
// after a tab switch away and back, which fully remounts the section and
// wipes out anything injected here previously).
async function injectRealWorkshopOutputs() {
  const grid = document.querySelector(".output-grid");
  if (!grid || workshopOutputsFetchInFlight) return;
  const lang = currentLanguage();
  const existingCard = grid.querySelector("[data-real-output-id]");
  // data-no-localize keeps the bundle's own translator from touching these
  // cards (see buildOutputCard), which also means they never update on a
  // language switch by themselves — refetch and rebuild them when stale.
  if (existingCard && existingCard.dataset.lang === lang) return;
  const caseId = currentCaseId();
  if (!caseId) return;
  workshopOutputsFetchInFlight = true;
  try {
    const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/workshop-outputs`, { credentials: "same-origin" });
    if (res.ok) {
      const body = await res.json();
      const currentGrid = document.querySelector(".output-grid");
      const canManage = await isCaseCoordinator(caseId);
      currentGrid?.querySelectorAll("[data-real-output-id]").forEach((el) => el.remove());
      body.data.items.forEach((output) => currentGrid?.prepend(buildOutputCard(output, currentLanguage(), { canManage })));
    }
  } catch {
    // Leave workshopOutputsFetchInFlight cleared below so the next sync
    // pass (the grid still has no real cards) retries.
  } finally {
    workshopOutputsFetchInFlight = false;
  }
}










function findDecisionsTabButton() {
  return Array.from(document.querySelectorAll(".case-tabs button")).find((button) => {
    const text = button.textContent || "";
    return text.startsWith("Αποφάσεις") || text.startsWith("Decisions");
  });
}

let decisionsCountCache = null; // { caseId, count }
let decisionsCountFetchInFlight = false;

// The "Αποφάσεις" tab is the one case-tab left with no count badge at all —
// unlike "Αποτελέσματα εργαστηρίων"/"Πρόσθετο υλικό" (hardcoded "3"/"7") it
// doesn't even fake one. The bundle already fetches the real decisions list
// unconditionally on page mount (not gated to this tab being active, unlike
// participants), so a real count is always available; this just surfaces it
// on the tab the same way the other three now do.
async function patchDecisionsTabBadge() {
  if (currentView() !== "case") return;
  const tabButton = findDecisionsTabButton();
  if (!tabButton) return;
  const caseId = currentCaseId();
  if (!caseId) return;
  if (decisionsCountCache?.caseId === caseId) {
    applyDecisionsCountBadge(decisionsCountCache.count);
    return;
  }
  if (decisionsCountFetchInFlight) return;
  decisionsCountFetchInFlight = true;
  try {
    const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/decisions`, { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    const count = (body.data.items || []).length;
    decisionsCountCache = { caseId, count };
    applyDecisionsCountBadge(count);
  } catch {
    // Leave decisionsCountFetchInFlight cleared below so the next sync pass
    // (cache still empty) retries.
  } finally {
    decisionsCountFetchInFlight = false;
  }
}

function applyDecisionsCountBadge(count) {
  const tabButton = findDecisionsTabButton();
  if (!tabButton) return;
  let badge = tabButton.querySelector("span");
  if (!badge) {
    badge = document.createElement("span");
    tabButton.append(badge);
  }
  badge.textContent = String(count);
}

// Each decision card's only click handler lives on its "View and
// participate" button (onClick: () => { setSelectedDecisionId(id);
// setModalTab("overview") }) — the surrounding <article> itself does
// nothing. Rather than reimplementing that state update from outside React,
// make the whole card clickable by forwarding the click to the real button,
// which is the one thing here that's actually wired up.
function enableDecisionCardClick() {
  document.querySelectorAll(".decision-grid > article").forEach((card) => {
    if (card.dataset.clickableDecision) return;
    card.dataset.clickableDecision = "true";
    card.addEventListener("click", (event) => {
      if (event.target.closest(".decision-open")) return;
      card.querySelector(".decision-open")?.click();
    });
  });
}

// The decision modal's own status <select> is already gated on
// can("review") — but that's the coarse platform-role check described on
// getCurrentCaseRole() above, so a case member with neither case-level role
// that actually grants this (representative/coordinator/admin — see
// isCaseCoordinator()) still sees it enabled and gets a 403 on change.
// Re-disable it (matching the bundle's own disabled/title/permission-note
// pattern exactly) whenever the real per-case role says otherwise.
let decisionStatusPermissionPatchedFor = null; // select element already patched
async function patchDecisionStatusPermission() {
  const select = document.querySelector(".decision-overview select");
  if (!select || select === decisionStatusPermissionPatchedFor) return;
  const caseId = currentCaseId();
  if (!caseId) return;
  const canManage = await isCaseCoordinator(caseId);
  const currentSelect = document.querySelector(".decision-overview select");
  if (!currentSelect || currentSelect.disabled) return;
  if (canManage) return;
  decisionStatusPermissionPatchedFor = currentSelect;
  const lang = currentLanguage();
  currentSelect.disabled = true;
  currentSelect.title =
    lang === "el" ? "Η αλλαγή κατάστασης απαιτεί δικαίωμα αξιολόγησης." : "Changing status requires review permission.";
  const label = currentSelect.closest("label");
  if (label && !label.parentElement.querySelector(".permission-note")) {
    const note = document.createElement("small");
    note.className = "permission-note";
    note.textContent =
      lang === "el"
        ? "Μπορείτε να ψηφίσετε και να σχολιάσετε, αλλά η κατάσταση αλλάζει μόνο από εξουσιοδοτημένο συντονιστή."
        : "You can vote and comment, but only an authorised coordinator can change the status.";
    label.after(note);
  }
}

// The Case Studies catalogue and the per-case detail page are both retired:
// Attica has one Regional Resilience Journey, not one journey per case. The
// views live in the vendored bundle and cannot be deleted from it, so they
// are made unreachable instead -- redirected before their content can paint.
// This runs on every pass, so it also catches direct URL entry, back/forward
// and the bundle's own post-sign-in landing on ?view=cases.
function guardCaseAccess() {
  const view = currentView();
  if (view !== "cases" && view !== "case") return;
  openRegionalJourney("overview");
}



// The native "New case study" wizard (?view=create, a 5-step flow baked
// into the vendored bundle) only ever collects title/description/area/
// sectors — it has no notion of Primary System, Primary Impact, Hazards or
// Linked Systems. Since a Case Study now requires those (the shared
// backend relationship every Priority System page reads from), letting
// that wizard run would either fail outright on submit or silently create
// a disconnected case. Intercept the click at the capture phase (before
// the bundle's own delegated React handler sees it) and open our own
// connected form instead — same technique already used by
// installSystemsExplorerNativeExitListener() elsewhere in this file.

function removeDeprecatedHomepageTrustItem() {
  if (currentView() !== "home") return;
  document.querySelector(".hero-copy .trust-row")?.remove();
}



function enhanceNativeToasts() {
  document.querySelectorAll(".toast-stack").forEach((stack) => {
    stack.setAttribute("aria-live", "polite");
    stack.setAttribute("aria-atomic", "false");
  });
  document.querySelectorAll(".toast").forEach((toast) => {
    toast.setAttribute("role", toast.classList.contains("error") ? "alert" : "status");
  });
}

// The Toolkit page can't be deleted from the vendored bundle, so it's made
// unreachable instead: redirect away from it outright, and hide every nav
// entry point that links to it. "board" (the shared collaborative-canvas
// view, used both by the Toolkit's own template cards and the per-case
// "Open board" button) is a completely separate view value and must stay
// fully reachable — this only ever matches view === "toolkit".
function guardToolkitAccess() {
  if (currentView() !== "toolkit") return;
  openRegionalJourney("overview");
}

// Four entry points link to the Toolkit page: the public header nav, the
// footer's "Platform" column, a homepage feature-card CTA, and the
// authenticated app-shell sidebar nav. The first three are plain <button>s
// with the exact trimmed text "Εργαλειοθήκη"/"Toolkit"; the homepage CTA is
// a non-button <article role="link"> identified by its aria-label instead.
function hideToolkitEntryPoints() {
  document.querySelectorAll("button").forEach((button) => {
    if (!/^(Εργαλειοθήκη|Toolkit)$/i.test((button.textContent || "").trim())) return;
    button.classList.add("permission-hidden");
    button.setAttribute("aria-hidden", "true");
    button.disabled = true;
  });
  document.querySelectorAll("article.feature-card[role='link']").forEach((card) => {
    const label = card.getAttribute("aria-label") || "";
    if (!/Μετάβαση στην εργαλειοθήκη συνδημιουργίας|Open the co-creation toolkit/i.test(label)) return;
    card.classList.add("permission-hidden");
    card.setAttribute("aria-hidden", "true");
  });
}

// Priority Systems is now the platform's primary destination (it's where
// the whole P2R Journey actually lives, per the reviewed journey doc) --
// Case Studies stays a real, reachable record, but not a top-level nav
// destination in the header, footer or homepage any more. Scoped to the
// header nav specifically (not a blanket document-wide text match like
// hideToolkitEntryPoints above) so this never touches the in-page
// "‹ Case studies" back-link on the native case-detail page itself, which
// must stay reachable when someone lands there via a direct/legacy link.
function demoteCaseStudiesHeaderNav() {
  document.querySelectorAll(".public-header nav, .app-header nav").forEach((nav) => {
    nav.querySelectorAll(":scope > button").forEach((button) => {
      if (!/^(Μελέτες περίπτωσης|Case studies)$/i.test((button.textContent || "").trim())) return;
      button.classList.add("permission-hidden");
      button.setAttribute("aria-hidden", "true");
      button.disabled = true;
    });
  });
}

// The homepage's marketing feature-grid shipped four cards; with Case
// Studies demoted it should read Priority Systems / Knowledge library /
// User guide. Hidden rather than removed, same React-safety rule as
// hideToolkitEntryPoints (both hidden cards leave dead grid slots, which
// the grid's own auto-fill collapses).

function hideCaseStudiesFeatureCard() {
  // Matched on the subject rather than an exact phrase: the bundle ships
  // several wordings for this one card ("Go to case studies" in its
  // translation map but "Open case studies" in the rendered aria-label), so
  // pinning the full string silently missed it in English. No other card in
  // this grid mentions case studies, so a substring match is unambiguous.
  const mentionsCases = (text) => /case studies|μελέτες περίπτωσης/i.test(text || "");
  document.querySelectorAll(".feature-grid article.feature-card[role='link']").forEach((card) => {
    const label = card.getAttribute("aria-label") || "";
    const heading = card.querySelector("h3")?.textContent || "";
    if (!mentionsCases(label) && !mentionsCases(heading)) return;
    card.classList.add("permission-hidden");
    card.setAttribute("aria-hidden", "true");
  });
}

// The footer's "Platform" column linked straight to the Case Studies
// catalogue; replace that slot with a Priority Systems link instead
// (reusing the header nav button's own click handling rather than
// duplicating its navigation logic, since that button isn't exported).
function replaceFooterCaseStudiesLink() {
  const footer = document.querySelector("footer");
  if (!footer) return;
  const native = [...footer.querySelectorAll("button")].find((button) =>
    /^(Μελέτες περίπτωσης|Case studies)$/i.test((button.textContent || "").trim())
  );
  if (native && !native.classList.contains("permission-hidden")) {
    native.classList.add("permission-hidden");
    native.setAttribute("aria-hidden", "true");
    native.disabled = true;
  }
  let replacement = footer.querySelector(".footer-systems-explorer-link");
  if (!replacement) {
    replacement = document.createElement("button");
    replacement.type = "button";
    replacement.className = "footer-systems-explorer-link";
    native?.before(replacement);
    replacement.addEventListener("click", () => {
      document.querySelector(".systems-explorer-nav-button")?.click();
    });
  }
  const lang = currentLanguage();
  replacement.textContent = lang === "el" ? "Συστήματα προτεραιότητας" : "Priority Systems";
}

const GUIDE_FEATURE_ICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>`;
const GUIDE_FEATURE_ARROW_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;

// The homepage's marketing feature-grid used to have three cards (Case
// studies, Toolkit, Knowledge library). hideToolkitEntryPoints() hides the
// Toolkit card rather than removing it, leaving its grid slot dead. Append
// a fourth card, styled to match the bundle's own feature-card markup
// exactly, that links to the User Guide — after Knowledge library so the
// visual order reads Case studies, Knowledge library, User guide.
function addGuideFeatureCard() {
  const grid = document.querySelector(".feature-grid");
  if (!grid) return;
  const lang = currentLanguage();
  const t = copy[lang];
  let card = grid.querySelector(".feature-card-guide");
  if (card && card.dataset.lang === lang) return;
  if (!card) {
    card = document.createElement("article");
    card.className = "feature-card feature-card-guide";
    card.setAttribute("role", "link");
    card.tabIndex = 0;
    card.innerHTML = `
      <span class="feature-icon amber-bg">${GUIDE_FEATURE_ICON_SVG}</span>
      <h3></h3>
      <p></p>
      <span class="feature-cta" aria-hidden="true"><span class="feature-cta-text"></span> ${GUIDE_FEATURE_ARROW_SVG}</span>
    `;
    const navigate = () => {
      window.location.href = `${location.pathname}?view=guide`;
    };
    card.addEventListener("click", navigate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate();
      }
    });
    grid.append(card);
  }
  card.dataset.lang = lang;
  card.setAttribute("aria-label", t.guideFeatureCardAriaLabel);
  card.querySelector("h3").textContent = t.guideFeatureCardTitle;
  card.querySelector("p").textContent = t.guideFeatureCardDescription;
  card.querySelector(".feature-cta-text").textContent = t.guideFeatureCardCta;
}

// The board's sidebar "back to case" button ships icon-only (34x34,
// aria-label carries the text for screen readers only). Add a visible
// text label next to the icon, mirroring whatever the bundle's own
// translator has already put in aria-label so this stays in sync across
// language switches without needing its own translation table.
function enhanceBoardBackButton() {
  const button = document.querySelector("aside.affine-sidebar button.affine-collapse");
  if (!button) return;
  button.classList.add("affine-collapse-labelled");
  const label = (button.getAttribute("aria-label") || "").trim();
  let span = button.querySelector(".affine-collapse-label");
  if (!span) {
    span = document.createElement("span");
    span.className = "affine-collapse-label";
    button.append(span);
  }
  if (span.textContent !== label) span.textContent = label;
}

// The Knowledge Library submission form (.resource-create-card) is a real,
// working React form — unlike Workshop Outputs, its submit handler is not
// fake. It builds its own JSON payload by reading only specific named
// FormData keys, so a plain injected <select name="licence"> would never
// actually reach the request: React's handler doesn't know it exists.
// Installed once: intercepts the outgoing POST /api/v1/resources call and
// merges in whatever the injected field currently holds. Layers on top of
// src/local-api.js's own window.fetch wrapper (installed first, per
// src/app-entry.js's import order) rather than replacing it.
function installLicenceFetchInterceptor() {
  const nativeFetch = window.fetch;
  window.fetch = async function adaptticaLicenceFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    let path;
    try {
      path = new URL(url, location.origin).pathname;
    } catch {
      path = "";
    }

    if (path === "/api/v1/resources" && method === "POST") {
      let body = init.body;
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        // Not a JSON body (shouldn't happen for this endpoint) — send as-is.
      }
      // The custom participant-submission modal (buildResourceSubmissionForm)
      // already builds its own payload with a licence, bypassing the real
      // .resource-create-card entirely — only fall back to reading the DOM
      // when the caller hasn't already supplied one.
      if (payload && !payload.licence) {
        const form = document.querySelector(".resource-create-card");
        const select = form?.querySelector("select[name='licence']");
        const licence = select?.value || "";
        if (!licence) {
          const t = copy[currentLanguage()];
          throw new Error(t.licenceSelectError);
        }
        payload.licence = licence;
        if (licence === "other") payload.licenceOther = form?.querySelector("input[name='licenceCustom']")?.value || "";
        body = JSON.stringify(payload);
      }
      return nativeFetch(input, { ...init, body });
    }

    return nativeFetch(input, init);
  };
}

// Populated by local-api.js, which loads early enough to catch the vendored
// bundle's *first* fetch on mount — this module's own installLicenceFetchInterceptor
// only installs after that bundle has already loaded, too late for that
// first request.
function resourceListCache() {
  return window.__adapttica_resourceListCache || [];
}

// Inserted as the last .resource-form-section, right before the
// visibility-toggle/submit footer — "how this resource may be reused"
// reads naturally right before "make it public and publish".
function injectLicenceField() {
  if (currentView() !== "resource-create") return;
  const form = document.querySelector(".resource-create-card");
  const footer = form?.querySelector(".resource-create-footer");
  if (!form || !footer) return;
  const lang = currentLanguage();
  const existing = form.querySelector(".licence-form-section");
  if (existing?.dataset.lang === lang) return;
  existing?.remove();

  const t = copy[lang];
  const section = document.createElement("section");
  section.className = "resource-form-section licence-form-section";
  section.dataset.lang = lang;

  const heading = document.createElement("h3");
  heading.textContent = t.licenceSectionHeading;
  section.append(heading);

  const label = document.createElement("label");
  label.className = "span-2";
  const requiredWrapper = document.createElement("span");
  requiredWrapper.className = "auth-required-label";
  requiredWrapper.textContent = t.licenceSectionHeading;
  const star = document.createElement("span");
  star.className = "auth-required-star";
  star.setAttribute("aria-hidden", "true");
  star.textContent = "*";
  requiredWrapper.append(" ", star);

  const select = document.createElement("select");
  select.name = "licence";
  select.required = true;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = t.licencePlaceholderOption;
  select.append(placeholder);
  t.licenceOptions.forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    select.append(optionEl);
  });

  const hint = document.createElement("p");
  hint.className = "licence-field-hint";

  const customLabel = document.createElement("label");
  customLabel.className = "span-2 licence-custom-label";
  customLabel.hidden = true;
  const customInput = document.createElement("input");
  customInput.name = "licenceCustom";
  customInput.maxLength = 200;
  customLabel.append(t.licenceCustomLabel, customInput);

  const updateHint = () => {
    const option = t.licenceOptions.find((entry) => entry.value === select.value);
    const isOther = select.value === "other";
    customLabel.hidden = !isOther;
    customInput.required = isOther;
    if (!option) {
      hint.textContent = "";
      return;
    }
    hint.replaceChildren(document.createTextNode(`${option.hint} `));
    if (option.url) {
      const link = document.createElement("a");
      link.href = option.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = option.label.split(" — ").pop();
      hint.append(link);
    }
  };
  select.addEventListener("change", updateHint);
  updateHint();

  label.append(requiredWrapper, select);
  section.append(label, hint, customLabel);
  footer.before(section);
}

// The bundle hardcodes the licence text shown on a resource's detail modal
// Knowledge Library: replace the native Resource type / Sector / Related
// case study filters with a single Phase 1/2/3 filter. A resource is bound
// to a phase by tagging it "phase1"/"phase2"/"phase3" in the Knowledge
// Library, the same convention already used for evidence documents
// (rccap/observatory) and stakeholder-mapping screenshots — the project
// team assigns a resource to a phase without a code change. No id is
// exposed on a rendered card, so cards are correlated to the GET /resources
// cache by title, the same text-matching approach patchResourceLicenceDisplay
// below already relies on.
function patchLibraryPhaseFilter() {
  if (currentView() !== "knowledge") return;
  const section = document.querySelector(".resource-layout > section.resources");
  const toolbar = section?.querySelector(".resource-toolbar");
  if (!section || !toolbar) return;
  const lang = currentLanguage();
  const labels = {
    phase1: lang === "el" ? "Φάση 1" : "Phase 1",
    phase2: lang === "el" ? "Φάση 2" : "Phase 2",
    phase3: lang === "el" ? "Φάση 3" : "Phase 3",
  };

  let bar = section.querySelector(".library-phase-filter");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "library-phase-filter";
    bar.dataset.active = "";
    toolbar.after(bar);
  }
  // Only rebuild the buttons when the language changes — rebuilding on
  // every pass would drop a click mid-interaction.
  if (bar.dataset.lang !== lang) {
    bar.dataset.lang = lang;
    bar.innerHTML = "";
    ["phase1", "phase2", "phase3"].forEach((key) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "library-phase-filter-btn";
      button.dataset.phase = key;
      button.textContent = labels[key];
      button.setAttribute("aria-pressed", bar.dataset.active === key ? "true" : "false");
      button.classList.toggle("active", bar.dataset.active === key);
      // Toggle: clicking the active phase again clears the filter, since
      // "the only filter" still needs a way back to seeing everything.
      button.addEventListener("click", () => {
        const next = bar.dataset.active === key ? "" : key;
        bar.dataset.active = next;
        [...bar.querySelectorAll("button")].forEach((btn) => {
          const on = btn.dataset.phase === next;
          btn.classList.toggle("active", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        applyLibraryPhaseFilter(section, next);
      });
      bar.append(button);
    });
  }
  // Re-applied every pass: search and sort re-render the card list natively,
  // and the phase filter has to be re-imposed on whatever set survives that.
  applyLibraryPhaseFilter(section, bar.dataset.active || "");
}

const LIBRARY_PHASE_PILL_LABEL = {
  el: { phase1: "Φάση 1", phase2: "Φάση 2", phase3: "Φάση 3" },
  en: { phase1: "Phase 1", phase2: "Phase 2", phase3: "Phase 3" },
};

function applyLibraryPhaseFilter(section, phase) {
  const lang = currentLanguage();
  section.querySelectorAll(".resource-card").forEach((card) => {
    const title = card.querySelector("h2")?.textContent?.trim() || "";
    const match = resourceListCache().find((item) => item.title_el === title || item.title_en === title);
    const tags = match?.tags || [];
    const visible = !phase || tags.includes(phase);
    card.classList.toggle("library-phase-hidden", !visible);

    // The card's own second pill already renders tags[0] verbatim — when
    // that happens to be one of ours, it leaks the raw filter key
    // ("phase1") rather than a label a reader would recognise. The raw key
    // is stashed in a data attribute the first time round, so a later
    // language switch can still re-derive the label instead of trying to
    // translate whatever text is already showing.
    const rawPill = card.querySelector(".resource-pills > span:last-child");
    if (rawPill) {
      if (!rawPill.dataset.phaseTag) {
        const initial = rawPill.textContent.trim();
        if (LIBRARY_PHASE_PILL_LABEL.en[initial]) rawPill.dataset.phaseTag = initial;
      }
      const label = LIBRARY_PHASE_PILL_LABEL[lang][rawPill.dataset.phaseTag];
      if (label && rawPill.textContent !== label) rawPill.textContent = label;
    }
  });
}

// ("Όπως δηλώνεται από τον εκδότη"/"As specified by the publisher") — it
// never reflects the real per-resource value. No id is exposed in the
// rendered DOM, so this correlates the open modal to a raw record from the
// GET /resources cache above by title + author + date, the same
// text-matching approach already used elsewhere in this file.
function patchResourceLicenceDisplay() {
  const modal = document.querySelector(".resource-modal");
  if (!modal || !resourceListCache().length) return;
  const licenceRow = [...modal.querySelectorAll(".resource-detail-grid > div")].find((row) =>
    /^(Άδεια|Licence)$/i.test(row.querySelector("small")?.textContent?.trim() || "")
  );
  if (!licenceRow) return;
  const valueEl = licenceRow.querySelector("b");
  if (!valueEl || valueEl.dataset.patched === "true") return;

  const title = modal.querySelector("h2")?.textContent?.trim() || "";
  const author = modal.querySelector(".resource-detail-grid b")?.textContent?.trim() || "";
  const matches = resourceListCache().filter(
    (item) => (item.title_el === title || item.title_en === title) && (item.author_organisation || "") === author
  );
  if (matches.length !== 1) return;
  const [item] = matches;
  if (!item.licence) return;
  const lang = currentLanguage();
  const label = lang === "el" ? item.licence_label_el : item.licence_label_en;
  if (!label) return;
  valueEl.textContent = item.licence === "other" && item.licence_other ? item.licence_other : label;
  valueEl.dataset.patched = "true";
}

function syncEnhancements() {
  restoreLanguagePreference();
  document.documentElement.lang = currentLanguage();
  removeAreaFilters();
  enhanceAuthentication();
  applyRegisterIntent();
  syncAccessibilityLanguage();
  repairPlatformLanguageLeaks();
  repairPathwayTerminology();
  repairGuideEnglishCopy();
  removeDeprecatedHomepageTrustItem();
  enhanceNativeToasts();
  addGuideDemonstrations();
  applyGuideRoleVisibility();
  injectRealWorkshopOutputs();
  patchWorkshopOutputCreatePermission();
  patchDecisionsTabBadge();
  enableDecisionCardClick();
  patchDecisionStatusPermission();
  injectLicenceField();
  patchResourceLicenceDisplay();
  patchLibraryPhaseFilter();
  enableParticipantResourceSubmission();
  refreshAuthCache().then(() => {
        });
  guardCaseAccess();
  guardToolkitAccess();
  hideToolkitEntryPoints();
  demoteCaseStudiesHeaderNav();
  replaceFooterCaseStudiesLink();
  hideCaseStudiesFeatureCard();
  addGuideFeatureCard();
  enhanceBoardBackButton();
  installRegionalNavigation();
  rewriteHomepage();
  syncRegionalJourney();
  applyNotificationBadge();
  if (!notificationBadgeCache || Date.now() - notificationBadgeCache.checkedAt > NOTIFICATION_BADGE_TTL_MS) {
    refreshNotificationBadge();
  }
}

export function installRuntimeEnhancements() {
  window.adaptticaNotify = showRuntimeToast;
  // Redirect away from a direct ?view=toolkit URL as early as possible,
  // before the bundle's own Toolkit page has a chance to render.
  guardToolkitAccess();
  installLicenceFetchInterceptor();
  installRegionalJourney();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // setTimeout rather than requestAnimationFrame: these DOM repairs
    // (language-leak fixes, permission-independent accessibility sync)
    // must still run when the tab is backgrounded, where rAF callbacks
    // are throttled or never fire.
    setTimeout(() => {
      scheduled = false;
      syncEnhancements();
    }, 0);
  };
  // characterData matters as much as childList here: some of the bundle's
  // own views (e.g. the user guide's tabs) update an existing text node's
  // .data in place when you switch tabs, rather than replacing the node —
  // childList-only observation misses that, which is exactly why some
  // guide tabs kept showing raw Greek after a switch (see
  // guideEnglishRepairs above) while others "just worked": whichever ones
  // happened to get a fresh node creation were caught, the rest weren't.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  // Same reasoning as the auth cache above: keep the notification badge
  // correct even while the page sits idle with no DOM mutations.
  setInterval(refreshNotificationBadge, Math.floor(NOTIFICATION_BADGE_TTL_MS * 0.8));
  window.addEventListener("popstate", schedule);
  window.addEventListener("storage", schedule);
  document.addEventListener("click", (event) => {
    // Covers both "Mark all as read" (.popover-head button) and clicking
    // an individual notification (which the bundle also marks read).
    if (!event.target.closest?.(".notifications-popover button")) return;
    // The click triggers a PATCH the bundle awaits internally before
    // updating its own popover state; give it a moment to land before we
    // re-fetch for the badge.
    setTimeout(refreshNotificationBadge, 300);
  });
  document.addEventListener("click", (event) => {
    const option = event.target.closest?.(".language-popover button");
    if (!option) return;
    const value = option.textContent || "";
    if (/english|αγγλικά/i.test(value)) persistLanguagePreference("en");
    if (/greek|ελληνικά/i.test(value)) persistLanguagePreference("el");
  }, true);
  // Capture-phase, so this runs and can stopPropagation before the
  // bundle's own click handler (attached higher up via React's synthetic
  // event system) ever sees the event. isAuthenticatedCached() reads the
  // cache kept warm by syncEnhancements()/guardCaseAccess() on every pass,
  // Header "Register"/"Εγγραφή" click: record the intent, then let the
  // click proceed normally (it still navigates to the login view like
  // today) — applyRegisterIntent() picks the flag up once that view mounts.
  document.addEventListener("click", (event) => {
    const header = event.target.closest?.(".public-header, .app-header");
    if (!header) return;
    const button = event.target.closest?.("button");
    if (!button) return;
    if (/register|εγγραφή/i.test(button.textContent || "")) {
      sessionStorage.setItem(REGISTER_INTENT_KEY, "1");
    }
  }, true);
  // "New workshop output" only ever shows a toast in the bundle (see
  // buildWorkshopOutputForm above for why) — intercept it before that
  // handler runs and open the real form instead.
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".workshop-output-section button.btn.primary");
    if (!button || !/νέο αποτέλεσμα εργαστηρίου|new workshop output/i.test(button.textContent || "")) return;
    const caseId = currentCaseId();
    if (!caseId) return;
    event.preventDefault();
    event.stopPropagation();
    showWorkshopOutputModal(caseId);
  }, true);
  installAccessibility();
  schedule();
}
