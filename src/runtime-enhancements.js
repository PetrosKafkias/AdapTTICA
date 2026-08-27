// @ts-nocheck -- generic-Element DOM patching over an immutable vendored
// bundle; casting every querySelector result to HTMLElement throughout
// would add noise without catching real bugs here.
import { dictionaries as copy } from "./i18n.js";

const ROLE_STORAGE_KEY = "adapttica-selected-role";
const RETURN_TO_CASE_KEY = "adapttica-return-to-case";
const ACTIVE_CASE_KEY = "adapttica-active-case";
const REGISTER_INTENT_KEY = "adapttica-register-intent";

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

// The bundle's own case-detail components (Participants tab, the invite
// modal, the resources tab, the collaborative board) all read the current
// case id exclusively from sessionStorage[ACTIVE_CASE_KEY] — never from the
// URL. That key is normally set by the bundle itself when a case card is
// clicked from the catalogue, but a direct URL visit, a refresh, or
// navigating back/forward never (re)sets it, silently breaking all of the
// above (e.g. the Participants tab permanently shows "no participants").
// Keep it mirrored from the URL's id param on every render pass so those
// native features always see a case id that matches what's on screen.
function syncActiveCaseId() {
  if (currentView() !== "case") return;
  const urlCaseId = new URLSearchParams(location.search).get("id");
  if (urlCaseId) sessionStorage.setItem(ACTIVE_CASE_KEY, urlCaseId);
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
    const preference = JSON.parse(localStorage.getItem("adapttica-preferences-v1") || "{}");
    return String(preference.lang || "").toLowerCase();
  } catch {
    return "";
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
  // user-management screen), never through self-registration.
  ["user", "representative"].forEach((role) => {
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

function enhanceAuthentication() {
  document.querySelectorAll(".auth-content").forEach((content) => {
    const heading = content.querySelector("h1")?.textContent || "";
    const isRegistration = /create an account|δημιουργήστε λογαριασμό/i.test(heading);

    // Public registration always creates a participant account. Elevated
    // organisation roles are assigned later by an administrator, so asking
    // for a role here is both misleading and a potential permissions leak.
    if (isRegistration) {
      content.querySelector(".auth-role-selector")?.remove();
      decorateAuthFields(content, true);
      return;
    }

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

function repairPlatformLanguageLeaks() {
  if (currentLanguage() === "el") {
    replaceExactCopy(document.body, new Map([["Region of Attica", "Περιφέρεια Αττικής"]]));
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

// The bundle's case-studies empty state (shown when a search/filter yields
// no results) is hard-coded Greek with no English branch at all — unlike
// almost every other string in the bundle, it never switches with the
// language toggle. This replaces it with the correct text for the active
// language on every render, and normalises the Greek wording to the
// platform's standard phrasing.
function repairCasesEmptyState() {
  if (currentView() !== "cases") return;
  const empty = document.querySelector(".empty-state");
  if (!empty) return;
  const t = copy[currentLanguage()];
  const heading = empty.querySelector("h2");
  const description = empty.querySelector("p");
  const button = empty.querySelector("button");
  if (heading && heading.textContent !== t.casesEmptyTitle) heading.textContent = t.casesEmptyTitle;
  if (description && description.textContent !== t.casesEmptyDescription) description.textContent = t.casesEmptyDescription;
  if (button && button.textContent !== t.casesEmptyButton) button.textContent = t.casesEmptyButton;
}

function buildCaseLoginOverlay(lang, { onLogin, onContinue }) {
  const t = copy[lang];
  const overlay = document.createElement("div");
  overlay.className = "case-login-overlay";
  overlay.setAttribute("data-no-localize", "true");
  overlay.innerHTML = `
    <div class="case-login-modal" role="dialog" aria-modal="true" aria-labelledby="case-login-title">
      <h2 id="case-login-title">${t.caseLoginTitle}</h2>
      <p>${t.caseLoginDescription}</p>
      <div class="case-login-actions">
        <button type="button" class="btn primary case-login-primary">${t.caseLoginPrimary}</button>
        <button type="button" class="btn secondary case-login-secondary">${t.caseLoginSecondary}</button>
      </div>
    </div>`;
  overlay.querySelector(".case-login-primary").addEventListener("click", onLogin);
  overlay.querySelector(".case-login-secondary").addEventListener("click", onContinue);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) onContinue();
  });
  return overlay;
}

// Shows the login prompt required before a guest can open a case study's
// full detail. `caseId` (when known) is only ever a bare id we generate
// ourselves — never a URL — so there is nothing here an attacker could turn
// into an open redirect; the return navigation below always targets our
// own `?view=case` on the current origin.
function showCaseLoginPrompt({ caseId, onContinue }) {
  if (document.querySelector(".case-login-overlay")) return;
  const lang = currentLanguage();
  const previouslyFocused = document.activeElement;
  const overlay = buildCaseLoginOverlay(lang, {
    onLogin: () => {
      if (caseId) sessionStorage.setItem(RETURN_TO_CASE_KEY, caseId);
      window.location.href = `${location.pathname}?view=login`;
    },
    onContinue: () => {
      overlay.remove();
      if (onContinue) onContinue();
      else if (previouslyFocused?.focus) previouslyFocused.focus();
    },
  });
  document.body.append(overlay);
  overlay.querySelector(".case-login-primary").focus();
  overlay.dataset.lang = lang;
}

function syncCaseLoginPromptLanguage() {
  const overlay = document.querySelector(".case-login-overlay");
  if (!overlay || overlay.dataset.lang === currentLanguage()) return;
  const t = copy[currentLanguage()];
  overlay.dataset.lang = currentLanguage();
  overlay.querySelector("h2").textContent = t.caseLoginTitle;
  overlay.querySelector("p").textContent = t.caseLoginDescription;
  overlay.querySelector(".case-login-primary").textContent = t.caseLoginPrimary;
  overlay.querySelector(".case-login-secondary").textContent = t.caseLoginSecondary;
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
          resourceListCache = [];
        },
      });
      document.body.append(overlay);
      overlay.querySelector('input[name="title"]').focus();
    });
  }
  const infoBanner = [...document.querySelectorAll("main *")].find(
    (element) => element.childElementCount === 0 && /^(Διαφορετικά επίπεδα δημοσίευσης|Different publishing levels)$/i.test((element.textContent || "").trim())
  );
  const bannerText = infoBanner?.parentElement?.querySelector("p");
  if (bannerText) {
    bannerText.textContent =
      lang === "el"
        ? "Μπορείτε να υποβάλετε υλικό στην ανοικτή βιβλιοθήκη — θα δημοσιευτεί μετά τον έλεγχο από τον υπεύθυνο της βιβλιοθήκης."
        : "You can submit material to the open library — it's published once the library moderator reviews it.";
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

function initialsFor(fullName) {
  return (fullName || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

let participantSummaryCache = null; // { caseId, lang, count, initials: string[] }
let participantSummaryFetchInFlight = false;

// The case-detail hero's avatar cluster ("ΠΚ ΜΓ ΔΚ +21 · 24 συμμετέχοντες")
// and the "Συμμετέχοντες" tab (unlike its "Αποτελέσματα εργαστηρίων"/
// "Πρόσθετο υλικό" siblings, which at least carry a — still hardcoded —
// count badge) are baked-in demo literals with zero data binding: every
// case shows the exact same fake "24", regardless of its real membership.
// Patch both from the real /members list so they agree with what the
// Participants tab itself shows.
function findParticipantsTabButton() {
  // Not a \b-anchored regex: JS's \b only recognises ASCII word characters,
  // so it silently fails to match a boundary right after a Greek word like
  // "Συμμετέχοντες" — a plain startsWith side-steps that Unicode gap.
  return Array.from(document.querySelectorAll(".case-tabs button")).find((button) => {
    const text = button.textContent || "";
    return text.startsWith("Συμμετέχοντες") || text.startsWith("Participants");
  });
}

async function patchCaseParticipantSummary() {
  if (currentView() !== "case") return;
  const heroCount = document.querySelector(".avatar-row small");
  const tabButton = findParticipantsTabButton();
  if (!heroCount && !tabButton) return;
  const lang = currentLanguage();
  const caseId = currentCaseId();
  if (!caseId) return;
  if (participantSummaryCache?.caseId === caseId && participantSummaryCache.lang === lang) {
    applyParticipantSummary(participantSummaryCache);
    return;
  }
  if (participantSummaryFetchInFlight) return;
  participantSummaryFetchInFlight = true;
  try {
    const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    const items = body.data.items || [];
    const summary = { caseId, lang, count: items.length, initials: items.slice(0, 3).map((m) => initialsFor(m.full_name)) };
    participantSummaryCache = summary;
    applyParticipantSummary(summary);
  } catch {
    // Leave participantSummaryFetchInFlight cleared below so the next sync
    // pass (cache still stale/empty) retries.
  } finally {
    participantSummaryFetchInFlight = false;
  }
}

// Always re-queries the live DOM rather than reusing element references
// captured before the fetch above — the tab bar and hero can both re-render
// while that request is in flight, which would otherwise silently patch
// detached nodes.
function applyParticipantSummary({ count, initials, lang }) {
  const heroCount = document.querySelector(".avatar-row small");
  const tabButton = findParticipantsTabButton();
  const avatarRow = heroCount?.closest(".avatar-row");
  if (avatarRow) {
    avatarRow.setAttribute("data-no-localize", "true");
    const avatarSpans = Array.from(avatarRow.querySelectorAll(":scope > span"));
    avatarSpans.forEach((span, index) => {
      if (index < initials.length) {
        span.textContent = initials[index];
        span.style.display = "";
      } else {
        span.style.display = "none";
      }
    });
    const overflow = count - initials.length;
    const overflowSpan = avatarSpans[avatarSpans.length - 1];
    if (overflowSpan && overflow > 0 && initials.length === avatarSpans.length - 1) {
      overflowSpan.textContent = `+${overflow}`;
      overflowSpan.style.display = "";
    }
    heroCount.textContent = `${count} ${lang === "el" ? "συμμετέχοντες" : "participants"}`;
  }
  if (tabButton) {
    let badge = tabButton.querySelector("span");
    if (!badge) {
      badge = document.createElement("span");
      tabButton.append(badge);
    }
    badge.textContent = String(count);
  }
}

const CASE_MEMBER_ROLE_LABELS = {
  user: { el: "Συμμετέχων", en: "Participant" },
  representative: { el: "Εκπρόσωπος φορέα", en: "Organisation representative" },
  coordinator: { el: "Συντονιστής", en: "Coordinator" },
};

// The Participants tab's per-row "Manage" button is correctly permission
// gated (disabled unless the viewer's role carries "manageCase" — the
// bundle's own client-side check), but even when enabled its onClick only
// ever shows an info toast naming the person and their role; there was
// never a real management action behind it. This builds the real one:
// change role (PATCH /cases/:id/members) or remove them from the case
// (DELETE /cases/:id/members/:userId), both already permission-checked
// server-side too.
function buildParticipantManageModal(member, caseId, lang, { onDone }) {
  const t = copy[lang];
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop participant-manage-overlay";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="modal-card participant-manage-modal">
      <button type="button" class="modal-close icon-btn" aria-label="${t.close}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
      </button>
      <h2></h2>
      <p class="participant-manage-subtitle"></p>
      <div class="participant-manage-roles"></div>
      <div class="modal-actions participant-manage-remove-row">
        <button type="button" class="btn secondary participant-manage-remove"></button>
      </div>
    </div>`;

  overlay.querySelector("h2").textContent = t.participantManageTitle;
  overlay.querySelector(".participant-manage-subtitle").textContent =
    `${member.full_name} · ${(CASE_MEMBER_ROLE_LABELS[member.role] || {})[lang] || member.role}`;

  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  const roleContainer = overlay.querySelector(".participant-manage-roles");
  Object.keys(CASE_MEMBER_ROLE_LABELS).forEach((role) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn secondary participant-manage-role-option";
    if (role === member.role) button.classList.add("active");
    button.textContent = CASE_MEMBER_ROLE_LABELS[role][lang];
    button.addEventListener("click", async () => {
      if (role === member.role) return;
      roleContainer.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: member.user_id, role }),
        });
        if (!res.ok) throw new Error("request failed");
        showRuntimeToast({ type: "success", title: t.participantManageRoleSuccessTitle, message: t.participantManageRoleSuccessMessage });
        close();
        onDone?.({ type: "role", role });
      } catch {
        showRuntimeToast({ type: "error", title: t.participantManageErrorTitle, message: t.participantManageErrorMessage });
        roleContainer.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    });
    roleContainer.append(button);
  });

  const removeButton = overlay.querySelector(".participant-manage-remove");
  removeButton.textContent = t.participantManageRemove;
  let removeArmed = false;
  removeButton.addEventListener("click", async () => {
    if (!removeArmed) {
      removeArmed = true;
      removeButton.textContent = t.participantManageRemoveConfirm;
      removeButton.classList.add("danger-armed");
      return;
    }
    removeButton.disabled = true;
    try {
      const res = await fetch(
        `/api/v1/cases/${encodeURIComponent(caseId)}/members/${encodeURIComponent(member.user_id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message || "request failed");
      showRuntimeToast({ type: "success", title: t.participantManageRemoveSuccessTitle, message: t.participantManageRemoveSuccessMessage });
      close();
      onDone?.({ type: "removed" });
    } catch (error) {
      showRuntimeToast({
        type: "error",
        title: t.participantManageErrorTitle,
        message: error instanceof Error ? error.message : t.participantManageErrorMessage,
      });
      removeButton.disabled = false;
    }
  });

  return overlay;
}

function findParticipantsGrid() {
  return document.querySelector(".people-grid");
}

// Matches each row's displayed name back to a real member record fetched
// fresh from the API — the DOM only ever has the rendered name/role text,
// never the underlying user id the management endpoints need. The native
// button's own `disabled` state (gated on the coarse platform-role
// can("manageCase") check) isn't trustworthy on its own — see the comment
// on getCurrentCaseRole() — so this re-checks the real per-case role before
// wiring anything, and force-disables the button (matching the bundle's own
// disabled/title pattern) when that role isn't actually coordinator/admin.
async function enableParticipantManagement() {
  const grid = findParticipantsGrid();
  if (!grid) return;
  const caseId = currentCaseId();
  if (!caseId) return;
  const canManage = await isCaseCoordinator(caseId);
  const lang = currentLanguage();
  grid.querySelectorAll("article").forEach((article) => {
    const button = article.querySelector(".icon-btn[aria-label]");
    if (!button) return;
    if (!canManage) {
      if (!button.disabled) {
        button.disabled = true;
        button.title =
          lang === "el" ? "Η διαχείριση μελών ανήκει στον συντονιστή." : "Member management belongs to the coordinator.";
      }
      return;
    }
    if (button.disabled || button.dataset.manageWired) return;
    button.dataset.manageWired = "true";
    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const fullName = article.querySelector("b")?.textContent?.trim();
        if (!fullName) return;
        try {
          const res = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/members`, { credentials: "same-origin" });
          if (!res.ok) throw new Error("request failed");
          const body = await res.json();
          const member = (body.data.items || []).find((item) => item.full_name === fullName);
          if (!member) return;
          const lang = currentLanguage();
          const overlay = buildParticipantManageModal(member, caseId, lang, {
            onDone: (result) => {
              participantSummaryCache = null;
              patchCaseParticipantSummary();
              if (result?.type === "removed") {
                article.remove();
              } else if (result?.type === "role") {
                const roleLabel = article.querySelector("em");
                if (roleLabel) roleLabel.textContent = CASE_MEMBER_ROLE_LABELS[result.role][currentLanguage()];
              }
            },
          });
          document.body.append(overlay);
        } catch {
          showRuntimeToast({
            type: "error",
            title: copy[currentLanguage()].participantManageErrorTitle,
            message: copy[currentLanguage()].participantManageErrorMessage,
          });
        }
      },
      { capture: true }
    );
  });
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

// Guards the case-study *detail* route only — the catalogue (view=cases)
// stays fully public. Runs on every render pass so it also catches direct
// URL navigation and back/forward, not just clicking a card.
function guardCaseAccess() {
  const view = currentView();
  if (view !== "cases" && view !== "case") return;
  refreshAuthCache().then((authenticated) => {
    if (authenticated || currentView() !== "case") return;
    if (document.querySelector(".case-login-overlay")) return;
    const activeCaseId = currentCaseId();
    showCaseLoginPrompt({
      caseId: activeCaseId,
      onContinue: () => {
        window.location.href = `${location.pathname}?view=cases`;
      },
    });
  });
}

// After a guest logs in from the prompt above, send them straight back to
// the case study they wanted instead of the homepage/dashboard.
function consumeReturnToCase() {
  const pendingCaseId = sessionStorage.getItem(RETURN_TO_CASE_KEY);
  if (!pendingCaseId || currentView() === "case") return;
  const cached = isAuthenticatedCached();
  if (cached !== true) return;
  sessionStorage.removeItem(RETURN_TO_CASE_KEY);
  sessionStorage.setItem(ACTIVE_CASE_KEY, pendingCaseId);
  window.location.href = `${location.pathname}?view=case`;
}

// The bundle only disables (greys out) this button when it has a *signed
// in* user whose role isn't admin — it never considered the
// no-user-at-all case, because the case-studies catalogue used to require
// a session to view at all. Now that browsing it is public, an anonymous
// visitor sees a fully clickable "New case study" button. Hide it
// outright for that specific case; leave the bundle's own (correct)
// disabled state alone for signed-in non-admins.
function guardCaseCreationButton() {
  if (!authCache || authCache.role === "admin") return;
  document.querySelectorAll("button").forEach((button) => {
    if (!/new case study|νέα μελέτη περίπτωσης/i.test(button.textContent || "")) return;
    button.classList.add("permission-hidden");
    button.setAttribute("aria-hidden", "true");
    button.disabled = true;
  });
}

function removeDeprecatedHomepageTrustItem() {
  if (currentView() !== "home") return;
  document.querySelector(".hero-copy .trust-row > span:nth-child(3)")?.remove();
}

function removeCasesRoleNotices() {
  if (currentView() !== "cases") return;
  const exactMatches = (patterns) => [...document.querySelectorAll("main *")].filter((element) => {
    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .trim();
    return patterns.some((pattern) => pattern.test(ownText));
  });

  exactMatches([/^Οι δικές σας προσκλήσεις$/i, /^Your invitations$/i]).forEach((heading) => {
    const container = heading.closest("aside, section, .case-access-banner, .info-banner") || heading.parentElement;
    container?.classList.add("cases-notice-hidden");
    container?.setAttribute("aria-hidden", "true");
  });
  exactMatches([
    /^Απαιτεί ρόλο εκπροσώπου φορέα\.?$/i,
    /^Requires (an? )?organisation representative role\.?$/i,
  ]).forEach((element) => {
    element.classList.add("cases-notice-hidden");
    element.setAttribute("aria-hidden", "true");
  });
}

// Participants can still use the collaborative board, comment and add files,
// but coordinator-only actions must not compete for attention as disabled
// lock buttons. The backend remains the authority for the permission check;
// this is the matching presentation rule for the case-study detail screen.
function hideParticipantCaseActions() {
  if (currentView() !== "case" || authCache?.role !== "user") return;
  document.querySelectorAll("main button:disabled").forEach((button) => {
    const permissionCopy = `${button.textContent || ""} ${button.title || ""} ${button.getAttribute("aria-label") || ""}`;
    const isCoordinatorAction = button.querySelector(".lucide-lock-keyhole") ||
      /invite|settings|new decision|manage|review|approval|πρόσκληση|ρυθμίσεις|νέα απόφαση|διαχείριση|αξιολόγηση|έγκριση/i.test(permissionCopy);
    if (!isCoordinatorAction) return;
    button.classList.add("participant-action-hidden");
    button.setAttribute("aria-hidden", "true");
    button.tabIndex = -1;
  });
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
  window.location.href = `${location.pathname}?view=cases`;
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

    if (path === "/api/v1/resources" && method === "GET") {
      nativeFetch(input, init)
        .then((response) => response.clone().json())
        .then((body) => {
          resourceListCache = body?.data?.items || [];
        })
        .catch(() => {});
    }
    return nativeFetch(input, init);
  };
}

let resourceListCache = [];

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
// ("Όπως δηλώνεται από τον εκδότη"/"As specified by the publisher") — it
// never reflects the real per-resource value. No id is exposed in the
// rendered DOM, so this correlates the open modal to a raw record from the
// GET /resources cache above by title + author + date, the same
// text-matching approach already used elsewhere in this file.
function patchResourceLicenceDisplay() {
  const modal = document.querySelector(".resource-modal");
  if (!modal || !resourceListCache.length) return;
  const licenceRow = [...modal.querySelectorAll(".resource-detail-grid > div")].find((row) =>
    /^(Άδεια|Licence)$/i.test(row.querySelector("small")?.textContent?.trim() || "")
  );
  if (!licenceRow) return;
  const valueEl = licenceRow.querySelector("b");
  if (!valueEl || valueEl.dataset.patched === "true") return;

  const title = modal.querySelector("h2")?.textContent?.trim() || "";
  const author = modal.querySelector(".resource-detail-grid b")?.textContent?.trim() || "";
  const matches = resourceListCache.filter(
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
  repairGuideEnglishCopy();
  repairCasesEmptyState();
  removeCasesRoleNotices();
  removeDeprecatedHomepageTrustItem();
  enhanceNativeToasts();
  syncCaseLoginPromptLanguage();
  addGuideDemonstrations();
  applyGuideRoleVisibility();
  syncActiveCaseId();
  injectRealWorkshopOutputs();
  patchWorkshopOutputCreatePermission();
  patchCaseParticipantSummary();
  enableParticipantManagement();
  patchDecisionsTabBadge();
  enableDecisionCardClick();
  patchDecisionStatusPermission();
  injectLicenceField();
  patchResourceLicenceDisplay();
  enableParticipantResourceSubmission();
  refreshAuthCache().then(() => {
    consumeReturnToCase();
    guardCaseCreationButton();
    hideParticipantCaseActions();
  });
  guardCaseCreationButton();
  hideParticipantCaseActions();
  guardCaseAccess();
  guardToolkitAccess();
  hideToolkitEntryPoints();
  addGuideFeatureCard();
  enhanceBoardBackButton();
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
  // The auth cache backs a synchronous click-time decision (guarding case
  // cards / the "New case study" button), but syncEnhancements() only runs
  // on a DOM mutation — on a page that's sat still for a few seconds with
  // no mutations, the cache would go stale and never refresh again until
  // something else happened to change. Keep it warm independent of that.
  setInterval(() => refreshAuthCache().then(guardCaseCreationButton), Math.floor(AUTH_CACHE_TTL_MS * 0.8));
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
  // since the real check is async and a click has to be decided
  // synchronously. If the cache hasn't warmed yet, the click is allowed
  // through; guardCaseAccess() still catches the unauthenticated case a
  // moment later once the "case" view has actually mounted.
  document.addEventListener("click", (event) => {
    if (currentView() !== "cases") return;
    const card = event.target.closest?.(".case-card");
    if (!card) return;
    if (isAuthenticatedCached() !== false) return;
    event.preventDefault();
    event.stopPropagation();
    showCaseLoginPrompt({ caseId: null, onContinue: () => card.querySelector("button")?.focus() });
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelector(".case-login-overlay .case-login-secondary")?.click();
  });
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
