const API_PREFIX = "/api/v1";
const STORAGE_KEY = "adapttica-local-api-v1";
const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
// The vendored bundle hardcodes `credentials: "same-origin"` on every
// request, so a real backend only works served from the same origin as the
// frontend (via the Vite dev proxy, or one combined server in production).
// VITE_USE_REMOTE_API opts into that path; leaving it unset keeps the
// portable, no-backend-required localStorage adapter below.
const useRemoteApi = String(import.meta.env.VITE_USE_REMOTE_API || "").toLowerCase() === "true";
const nativeFetch = window.fetch.bind(window);

const seedNotifications = [
  {
    id: "notification-output",
    title_el: "Αναρτήθηκε νέο αποτέλεσμα συνδημιουργίας",
    title_en: "A new co-creation output was published",
    body_el: "Διαδρομή ανθεκτικότητας στη ζέστη · πριν από 12 λεπτά",
    body_en: "Heat resilience pathway · 12 min ago",
    href: "?view=case",
    read_at: null,
  },
  {
    id: "notification-comment",
    title_el: "Ένας συμμετέχων σχολίασε το αποτέλεσμα",
    title_en: "A participant commented on the output",
    body_el: "Μαρία Γεωργίου · πριν από 42 λεπτά",
    body_en: "Maria Georgiou · 42 min ago",
    href: "?view=case",
    read_at: null,
  },
  {
    id: "notification-review",
    title_el: "Ζητήθηκαν αλλαγές πριν από την έγκριση",
    title_en: "Changes were requested before approval",
    body_el: "2 παρατηρήσεις από την Περιφέρεια Αττικής · σήμερα",
    body_en: "2 notes from the Region of Attica · today",
    href: "?view=case",
    read_at: null,
  },
];

const seedCases = [
  { id: "case-heat", public_id: "CS-04", title_el: "Ανθεκτικότητα στη ζέστη στη Δυτική Αθήνα", title_en: "Heat resilience in Western Athens", description_el: "Συνεργατική διαδρομή για τη μείωση της θερμικής επιβάρυνσης.", description_en: "A collaborative pathway for reducing urban heat exposure.", organisation_name: "Region of Attica", sector_name_el: "Αστικό περιβάλλον", sector_name_en: "Urban environment", area_el: "Δυτική Αθήνα", area_en: "Western Athens", status: "in_progress", member_count: 24 },
  { id: "case-flood", public_id: "CS-07", title_el: "Διαχείριση πλημμυρικού κινδύνου στη Μάνδρα", title_en: "Flood risk management in Mandra", description_el: "Συνδυασμός πράσινων υποδομών και τεκμηριωμένων παρεμβάσεων.", description_en: "Combining green infrastructure with evidence-based interventions.", organisation_name: "Region of Attica", sector_name_el: "Ύδατα & πλημμύρες", sector_name_en: "Water & floods", area_el: "Μάνδρα", area_en: "Mandra", status: "under_review", member_count: 18 },
  { id: "case-coast", public_id: "CS-09", title_el: "Προστασία παράκτιας ζώνης στην Ανατολική Αττική", title_en: "Coastal protection in Eastern Attica", description_el: "Ενδιάμεσες και μακροπρόθεσμες επιλογές προσαρμογής.", description_en: "Near- and long-term coastal adaptation options.", organisation_name: "Municipality of Rafina-Pikermi", sector_name_el: "Παράκτιες ζώνες", sector_name_en: "Coastal zones", area_el: "Ανατολική Αττική", area_en: "Eastern Attica", status: "approved", member_count: 16 },
  { id: "case-forest", public_id: "CS-11", title_el: "Ανθεκτικότητα δασών και πρόληψη πυρκαγιών", title_en: "Forest resilience and wildfire prevention", description_el: "Κοινός σχεδιασμός πρόληψης και αποκατάστασης.", description_en: "A shared prevention and recovery plan.", organisation_name: "Forestry Department", sector_name_el: "Βιοποικιλότητα & δάση", sector_name_en: "Biodiversity & forests", area_el: "Πάρνηθα", area_en: "Parnitha", status: "completed", member_count: 21 },
];

const seedResources = [
  { id: "resource-plan", type: "report", title_el: "Περιφερειακό Σχέδιο Προσαρμογής στην Κλιματική Αλλαγή", title_en: "Regional Climate Change Adaptation Plan", description_el: "Το επίσημο πλαίσιο προτεραιοτήτων, κινδύνων και μέτρων προσαρμογής για την Περιφέρεια Αττικής.", description_en: "The official framework of adaptation priorities, risks and measures for the Region of Attica.", author_organisation: "Region of Attica", tags: ["Πολλαπλοί τομείς", "Multiple sectors"], file_name: "regional-adaptation-plan.pdf", file_type: "application/pdf", file_size: 13002342, published_at: "2026-07-18", file_key: "regional-adaptation-plan.pdf" },
  { id: "resource-heat", type: "dataset", title_el: "Δείκτης αστικής θερμικής τρωτότητας", title_en: "Urban heat vulnerability index", description_el: "Χωρικά δεδομένα θερμικής επιβάρυνσης και ευάλωτων ομάδων.", description_en: "Spatial data on heat exposure and vulnerable groups.", author_organisation: "Climate Observatory", tags: ["Αστικό περιβάλλον", "Urban environment"], file_name: "heat-index.csv", file_type: "text/csv", file_size: 482000, published_at: "2026-07-12", file_key: "heat-index.csv" },
  { id: "resource-workshop", type: "workshop_output", title_el: "Αποτελέσματα εργαστηρίου κοινής διάγνωσης", title_en: "Shared diagnosis workshop results", description_el: "Σύνοψη προτεραιοτήτων και συμφωνημένων επόμενων βημάτων.", description_en: "A summary of priorities and agreed next steps.", author_organisation: "AdapTTICA", tags: ["Εργαστήριο", "Workshop"], file_name: "workshop-results.pdf", file_type: "application/pdf", file_size: 2450000, published_at: "2026-07-08", file_key: "workshop-results.pdf" },
];

const seedMembers = [
  { id: "member-petros", user_id: "member-petros", full_name: "Petros Kafkias", email: "p.kafkias@dreven.gr", role: "coordinator", joined_at: "2026-06-03T09:00:00.000Z" },
  { id: "member-maria", user_id: "member-maria", full_name: "Maria Georgiou", email: "m.georgiou@attica.gov.gr", role: "facilitator", joined_at: "2026-06-05T10:30:00.000Z" },
  { id: "member-dimitris", user_id: "member-dimitris", full_name: "Dimitris Kostas", email: "d.kostas@example.org", role: "participant", joined_at: "2026-06-08T11:15:00.000Z" },
  { id: "member-eleni", user_id: "member-eleni", full_name: "Eleni Papa", email: "e.papa@example.org", role: "participant", joined_at: "2026-06-10T08:45:00.000Z" },
];

const seedDecisions = [
  {
    id: "decision-priority-neighbourhoods",
    title_el: "Προτεραιότητα στις γειτονιές με τη μεγαλύτερη θερμική επιβάρυνση",
    title_en: "Prioritise the neighbourhoods most affected by heat",
    summary_el: "Ο δείκτης τρωτότητας του Παρατηρητηρίου θα καθοδηγήσει τη σειρά των πιλοτικών παρεμβάσεων.",
    summary_en: "The Observatory vulnerability indicator will guide the order of pilot interventions.",
    creator_name: "Petros Kafkias",
    status: "approved",
    support: 18,
    concern: 2,
    abstain: 1,
    created_at: "2026-07-20T09:30:00.000Z",
    updated_at: "2026-07-21T11:15:00.000Z",
  },
  {
    id: "decision-shading-surfaces",
    title_el: "Συνδυασμός σκίασης και διαπερατών επιφανειών",
    title_en: "Combine shading and permeable surfaces",
    summary_el: "Οι δύο κατηγορίες μέτρων θα αξιολογούνται ως ενιαία παρέμβαση στις πιλοτικές περιοχές.",
    summary_en: "Both measure categories will be assessed as one intervention in pilot areas.",
    creator_name: "Maria Georgiou",
    status: "review",
    support: 15,
    concern: 3,
    abstain: 2,
    created_at: "2026-07-19T08:45:00.000Z",
    updated_at: "2026-07-20T15:20:00.000Z",
  },
  {
    id: "decision-pilot-areas",
    title_el: "Επιλογή τριών πιλοτικών περιοχών",
    title_en: "Select three pilot areas",
    summary_el: "Η τελική επιλογή θα οριστικοποιηθεί μετά τον έλεγχο των δημογραφικών δεδομένων.",
    summary_en: "The final selection will be confirmed after the demographic data review.",
    creator_name: "Eleni Papa",
    status: "draft",
    support: 9,
    concern: 1,
    abstain: 3,
    created_at: "2026-07-17T10:00:00.000Z",
    updated_at: "2026-07-18T12:00:00.000Z",
  },
];

const seedDecisionComments = {
  "decision-priority-neighbourhoods": [
    { id: "comment-1", author_name: "Maria Georgiou", body: "The evidence is clear and the proposed priority order is practical.", created_at: "2026-07-20T12:10:00.000Z" },
    { id: "comment-2", author_name: "Dimitris Kostas", body: "Please retain the vulnerability indicator in the monitoring baseline.", created_at: "2026-07-20T14:25:00.000Z" },
  ],
};

const defaultState = () => ({
  currentUser: null,
  users: [],
  notifications: seedNotifications,
  uploads: [],
  cases: seedCases,
  resources: seedResources,
  members: seedMembers,
  decisions: seedDecisions,
  decisionComments: seedDecisionComments,
  workspaces: {},
});

function readState() {
  try {
    return { ...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function ok(data = {}) {
  return json({ data });
}

function fail(message, status = 400, fields) {
  return json({ error: { code: `HTTP_${status}`, message, ...(fields ? { fields } : {}) } }, status);
}

async function requestBody(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  if (type.includes("multipart/form-data")) return request.formData().catch(() => new FormData());
  return {};
}

function normalizedUser(input, existing = {}) {
  return {
    id: existing.id || crypto.randomUUID(),
    fullName: input.fullName || existing.fullName || "Petros Kafkias",
    email: String(input.email || existing.email || "user@example.org").toLowerCase(),
    phone: input.phone ?? existing.phone ?? "+30 210 000 0000",
    location: input.location ?? existing.location ?? "Athens, Attica",
    organisationName: input.organisation || input.organisationName || existing.organisationName || "Region of Attica",
    platformRole: input.platformRole || existing.platformRole || "user",
    language: input.language || existing.language || "el",
    notificationPreferences: input.notificationPreferences || existing.notificationPreferences || {
      invitations: true,
      comments: true,
      statusChanges: true,
      deadlines: true,
    },
    privacyPreferences: input.privacyPreferences || existing.privacyPreferences || {
      profileVisibility: "participants",
      analytics: false,
    },
  };
}

function inferRole(email) {
  const value = String(email).toLowerCase();
  if (value.includes("admin")) return "admin";
  if (/representative|coordinator|municipality|region/.test(value)) return "representative";
  return "user";
}

function selectedLanguage() {
  try {
    const preference = JSON.parse(localStorage.getItem("adapttica-preferences-v1") || "{}");
    return String(preference.lang || "EL").toLowerCase();
  } catch {
    return "el";
  }
}

function selectedRole() {
  const value = localStorage.getItem("adapttica-selected-role") || "user";
  return ["user", "representative", "admin"].includes(value) ? value : "user";
}

async function localApi(request, path) {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const state = readState();
  const method = request.method.toUpperCase();

  if (path === "/auth/login" && method === "POST") {
    const body = await requestBody(request);
    const requestedRole = selectedRole();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const demoAccess = !email && !password;

    if (!demoAccess && !/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email address.", 422, { email: "Invalid email" });
    if (!demoAccess && password.length < 6) return fail("The password must contain at least 6 characters.", 422, { password: "Password is too short" });

    const demoProfiles = {
      user: { fullName: "Demo Participant", email: "participant@demo.adapttica.local", organisation: "AdapTTICA Community" },
      representative: { fullName: "Demo Organisation Representative", email: "representative@demo.adapttica.local", organisation: "Region of Attica" },
      admin: { fullName: "Demo Administrator", email: "administrator@demo.adapttica.local", organisation: "AdapTTICA" },
    };
    const loginInput = demoAccess ? demoProfiles[requestedRole] : { ...body, email };
    const saved = state.users.find((user) => user.email === loginInput.email);
    state.currentUser = normalizedUser({
      ...loginInput,
      platformRole: requestedRole || inferRole(loginInput.email),
      language: selectedLanguage(),
    }, saved);
    if (saved) {
      state.users = state.users.map((user) => user.id === state.currentUser.id ? state.currentUser : user);
    } else {
      state.users.push(state.currentUser);
    }
    writeState(state);
    return ok({ user: state.currentUser });
  }

  if (path === "/auth/register" && method === "POST") {
    const body = await requestBody(request);
    const fields = {};
    if (!String(body.fullName || "").trim()) fields.fullName = "Full name is required";
    if (!/^\S+@\S+\.\S+$/.test(body.email || "")) fields.email = "Enter a valid email";
    if (String(body.password || "").length < 8) fields.password = "Use at least 8 characters";
    if (Object.keys(fields).length) return fail("Please correct the highlighted fields.", 422, fields);
    if (state.users.some((user) => user.email === String(body.email).toLowerCase())) return fail("An account with this email already exists.", 409);
    // Self-registration always starts with the least-privileged participant
    // role. Organisation and administrator access is granted separately by
    // an authorised administrator.
    const user = normalizedUser({ ...body, platformRole: "user", language: selectedLanguage() });
    state.users.push(user);
    state.currentUser = user;
    writeState(state);
    return ok({ user });
  }

  if (path === "/auth/logout" && method === "POST") {
    state.currentUser = null;
    writeState(state);
    return ok({ success: true });
  }

  if (path === "/me" && method === "GET") {
    return state.currentUser ? ok({ user: state.currentUser }) : fail("Authentication required.", 401);
  }

  if (path === "/me" && method === "PATCH") {
    if (!state.currentUser) return fail("Authentication required.", 401);
    const body = await requestBody(request);
    state.currentUser = normalizedUser(body, state.currentUser);
    state.users = state.users.map((user) => user.id === state.currentUser.id ? state.currentUser : user);
    writeState(state);
    return ok({ user: state.currentUser });
  }

  if (path === "/notifications" && method === "GET") return ok({ items: state.notifications });
  if (path === "/notifications" && method === "PATCH") {
    const now = new Date().toISOString();
    state.notifications = state.notifications.map((item) => ({ ...item, read_at: now }));
    writeState(state);
    return ok({ items: state.notifications });
  }

  const notificationMatch = path.match(/^\/notifications\/([^/]+)$/);
  if (notificationMatch && method === "PATCH") {
    state.notifications = state.notifications.map((item) => item.id === notificationMatch[1] ? { ...item, read_at: new Date().toISOString() } : item);
    writeState(state);
    return ok({ notification: state.notifications.find((item) => item.id === notificationMatch[1]) });
  }

  if (path === "/files/upload" && method === "POST") {
    const body = await requestBody(request);
    const file = body instanceof FormData ? [...body.values()].find((value) => value instanceof File) : null;
    const upload = {
      id: crypto.randomUUID(),
      name: file?.name || "uploaded-file",
      size: file?.size || 0,
      type: file?.type || "application/octet-stream",
      url: "#local-upload",
    };
    state.uploads.push(upload);
    writeState(state);
    return ok({ file: upload });
  }

  if (path === "/cases" && method === "GET") return ok({ items: state.cases });
  if (path === "/cases" && method === "POST") {
    if (state.currentUser?.platformRole !== "admin") return fail("Only platform administrators can create case studies.", 403);
    const body = await requestBody(request);
    const caseStudy = {
      id: crypto.randomUUID(), public_id: `CS-${String(state.cases.length + 12).padStart(2, "0")}`,
      title_el: String(body.titleEl || "Νέα μελέτη περίπτωσης"), title_en: String(body.titleEn || body.titleEl || "New case study"),
      description_el: String(body.descriptionEl || ""), description_en: String(body.descriptionEn || body.descriptionEl || ""),
      organisation_name: state.currentUser.organisationName, sector_name_el: "Αστικό περιβάλλον", sector_name_en: "Urban environment",
      area_el: String(body.areaEl || "Αττική"), area_en: String(body.areaEn || body.areaEl || "Attica"),
      status: body.saveAsDraft ? "draft" : "in_progress", member_count: 1,
      start_date: body.startDate || null, target_date: body.targetDate || null,
    };
    state.cases.unshift(caseStudy);
    state.workspaces[caseStudy.id] = { state: { nodes: [], version: 1 }, provider: "local" };
    writeState(state);
    return ok({ caseStudy });
  }

  const caseMatch = path.match(/^\/cases\/([^/]+)$/);
  if (caseMatch && method === "GET") {
    const caseStudy = state.cases.find((item) => item.id === caseMatch[1]);
    return caseStudy ? ok({ caseStudy }) : fail("Case study not found.", 404);
  }
  if (caseMatch && method === "PATCH") {
    const body = await requestBody(request);
    let caseStudy;
    state.cases = state.cases.map((item) => {
      if (item.id !== caseMatch[1]) return item;
      caseStudy = { ...item, ...body, status: body.status || item.status, target_date: body.targetDate ?? item.target_date };
      return caseStudy;
    });
    if (!caseStudy) return fail("Case study not found.", 404);
    writeState(state);
    return ok({ caseStudy });
  }

  const workspaceMatch = path.match(/^\/cases\/([^/]+)\/workspace$/);
  if (workspaceMatch && ["GET", "POST", "PATCH"].includes(method)) {
    const id = workspaceMatch[1];
    const current = state.workspaces[id] || { state: { nodes: [], version: 1 }, provider: "local" };
    if (method === "PATCH") {
      const body = await requestBody(request);
      state.workspaces[id] = { ...current, ...body, provider: "local" };
      writeState(state);
    } else if (!state.workspaces[id]) {
      state.workspaces[id] = current;
      writeState(state);
    }
    return ok({ workspace: state.workspaces[id], ...state.workspaces[id] });
  }

  if (/^\/cases\/[^/]+\/invitations$/.test(path) && method === "POST") return ok({ existingUser: false, invitationId: crypto.randomUUID() });
  if (/^\/cases\/[^/]+\/decisions$/.test(path) && method === "GET") return ok({ items: state.decisions });
  if (/^\/cases\/[^/]+\/decisions$/.test(path) && method === "POST") {
    if (!state.currentUser || !["representative", "admin"].includes(state.currentUser.platformRole)) return fail("Only a case-study coordinator can record a decision.", 403);
    const body = await requestBody(request);
    const decision = {
      id: crypto.randomUUID(),
      title_el: String(body.titleEl || "Νέα απόφαση"),
      title_en: String(body.titleEn || body.titleEl || "New decision"),
      summary_el: String(body.summaryEl || ""),
      summary_en: String(body.summaryEn || body.summaryEl || ""),
      creator_name: state.currentUser.fullName,
      status: String(body.status || "draft"),
      support: 0,
      concern: 0,
      abstain: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.decisions.unshift(decision);
    writeState(state);
    return ok({ decision });
  }
  if (/^\/cases\/[^/]+\/members$/.test(path) && method === "GET") return ok({ items: state.members });

  const decisionCommentsMatch = path.match(/^\/decisions\/([^/]+)\/comments$/);
  if (decisionCommentsMatch && method === "GET") return ok({ items: state.decisionComments[decisionCommentsMatch[1]] || [] });
  if (decisionCommentsMatch && method === "POST") {
    if (!state.currentUser) return fail("Authentication required.", 401);
    const body = await requestBody(request);
    const value = String(body.body || "").trim();
    if (!value) return fail("A comment cannot be empty.", 422, { body: "A comment cannot be empty." });
    const comment = { id: crypto.randomUUID(), author_name: state.currentUser.fullName, authorName: state.currentUser.fullName, body: value, created_at: new Date().toISOString() };
    state.decisionComments[decisionCommentsMatch[1]] = [...(state.decisionComments[decisionCommentsMatch[1]] || []), comment];
    writeState(state);
    return ok({ comment });
  }

  const decisionVoteMatch = path.match(/^\/decisions\/([^/]+)\/vote$/);
  if (decisionVoteMatch && method === "POST") {
    if (!state.currentUser) return fail("Authentication required.", 401);
    const body = await requestBody(request);
    const decision = state.decisions.find((item) => item.id === decisionVoteMatch[1]);
    if (!decision) return fail("Decision not found.", 404);
    const value = String(body.value || "");
    if (!["support", "concern", "abstain"].includes(value)) return fail("A valid vote is required.", 422);
    decision[value] = Number(decision[value] || 0) + 1;
    decision.updated_at = new Date().toISOString();
    writeState(state);
    return ok({ results: { support: decision.support, concern: decision.concern, abstain: decision.abstain } });
  }

  if (path === "/resources" && method === "GET") return ok({ items: state.resources, total: state.resources.length });
  if (path === "/resources" && method === "POST") {
    const body = await requestBody(request);
    const resource = { id: crypto.randomUUID(), ...body, title_el: body.titleEl, title_en: body.titleEn, description_el: body.descriptionEl, description_en: body.descriptionEn, author_organisation: body.authorOrganisation, file_key: body.fileKey, file_name: body.fileName, file_type: body.fileType, file_size: body.fileSize, published_at: body.publishedAt || new Date().toISOString(), tags: body.tags || [] };
    state.resources.unshift(resource);
    writeState(state);
    return ok({ resource });
  }

  // Read requests deliberately fall through. The recovered UI then uses its
  // complete built-in demonstration catalogue, while real account preferences
  // and notifications remain persistent through the local adapter above.
  return fail(`Local endpoint not implemented: ${method} ${path}`, 404);
}

async function forwardRegisterRequest(request) {
  // Public registration always creates a participant account. Elevated roles
  // are assigned through administration rather than selected by the user.
  let body;
  try {
    body = await request.clone().json();
  } catch {
    body = {};
  }
  const augmented = { ...body, platformRole: "user", language: selectedLanguage() };
  return nativeFetch(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      credentials: request.credentials,
      body: JSON.stringify(augmented),
    })
  );
}

window.fetch = async function adaptticaFetch(input, init = {}) {
  const originalRequest = input instanceof Request ? input : new Request(input, init);
  const url = new URL(originalRequest.url, window.location.origin);
  if (!url.pathname.startsWith(API_PREFIX)) return nativeFetch(input, init);

  if (useRemoteApi) {
    if (url.pathname === `${API_PREFIX}/auth/register`) return forwardRegisterRequest(originalRequest);
    return nativeFetch(originalRequest);
  }

  if (configuredApiBase) {
    const upstream = `${configuredApiBase}${url.pathname}${url.search}`;
    return nativeFetch(new Request(upstream, originalRequest));
  }

  return localApi(originalRequest, url.pathname.slice(API_PREFIX.length) || "/");
};
