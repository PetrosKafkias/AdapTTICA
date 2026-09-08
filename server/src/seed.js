import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { migrate } from "./migrate.js";
import { getDb } from "./db.js";
import { hashPassword } from "./lib/auth.js";

const DEMO_CASES = [
  {
    titleEl: "Ανθεκτικότητα στη ζέστη στη Δυτική Αθήνα",
    titleEn: "Heat resilience in Western Athens",
    descriptionEl: "Συνεργατική διαδρομή για τη μείωση της θερμικής επιβάρυνσης.",
    descriptionEn: "A collaborative pathway for reducing urban heat exposure.",
    sectorEl: "Αστικό περιβάλλον",
    sectorEn: "Urban environment",
    areaEl: "Δυτική Αθήνα",
    areaEn: "Western Athens",
    status: "in_progress",
  },
  {
    titleEl: "Διαχείριση πλημμυρικού κινδύνου στη Μάνδρα",
    titleEn: "Flood risk management in Mandra",
    descriptionEl: "Συνδυασμός πράσινων υποδομών και τεκμηριωμένων παρεμβάσεων.",
    descriptionEn: "Combining green infrastructure with evidence-based interventions.",
    sectorEl: "Ύδατα & πλημμύρες",
    sectorEn: "Water & floods",
    areaEl: "Μάνδρα",
    areaEn: "Mandra",
    status: "under_review",
  },
  {
    titleEl: "Προστασία παράκτιας ζώνης στην Ανατολική Αττική",
    titleEn: "Coastal protection in Eastern Attica",
    descriptionEl: "Ενδιάμεσες και μακροπρόθεσμες επιλογές προσαρμογής.",
    descriptionEn: "Near- and long-term coastal adaptation options.",
    sectorEl: "Παράκτιες ζώνες",
    sectorEn: "Coastal zones",
    areaEl: "Ανατολική Αττική",
    areaEn: "Eastern Attica",
    status: "approved",
  },
  {
    titleEl: "Ανθεκτικότητα δασών και πρόληψη πυρκαγιών",
    titleEn: "Forest resilience and wildfire prevention",
    descriptionEl: "Κοινός σχεδιασμός πρόληψης και αποκατάστασης.",
    descriptionEn: "A shared prevention and recovery plan.",
    sectorEl: "Βιοποικιλότητα & δάση",
    sectorEn: "Biodiversity & forests",
    areaEl: "Πάρνηθα",
    areaEn: "Parnitha",
    status: "completed",
  },
];

const SYSTEM_IDS = {
  water: "00000000-0000-4000-8000-000000000001",
  forest: "00000000-0000-4000-8000-000000000002",
  health: "00000000-0000-4000-8000-000000000003",
  built: "00000000-0000-4000-8000-000000000004",
  transport: "00000000-0000-4000-8000-000000000005",
  energy: "00000000-0000-4000-8000-000000000006",
  tourism: "00000000-0000-4000-8000-000000000007",
  coastal: "00000000-0000-4000-8000-000000000008",
  emergency: "00000000-0000-4000-8000-000000000010",
};

const HAZARD_IDS = {
  heat: "00000000-0000-4000-9000-000000000001",
  flood: "00000000-0000-4000-9000-000000000002",
  drought: "00000000-0000-4000-9000-000000000003",
  wildfire: "00000000-0000-4000-9000-000000000004",
  seaLevel: "00000000-0000-4000-9000-000000000005",
};

const IMPACTS = {
  flood: {
    id: "10000000-0000-4000-8000-000000000001",
    systemId: SYSTEM_IDS.built,
    title: { el: "Αστικές πλημμύρες", en: "Urban Flooding" },
    description: {
      el: "Πλημμυρικός κίνδυνος στο δομημένο περιβάλλον και στις κρίσιμες αστικές υποδομές.",
      en: "Flood risk affecting the built environment and critical urban infrastructure.",
    },
    hazards: [HAZARD_IDS.flood],
    linked: [SYSTEM_IDS.water, SYSTEM_IDS.transport, SYSTEM_IDS.health, SYSTEM_IDS.emergency],
  },
  heat: {
    id: "10000000-0000-4000-8000-000000000002",
    systemId: SYSTEM_IDS.built,
    title: { el: "Αστική θερμική επιβάρυνση", en: "Urban Heat" },
    description: { el: "Έκθεση κατοίκων και υποδομών σε ακραία ζέστη.", en: "Exposure of people and infrastructure to extreme heat." },
    hazards: [HAZARD_IDS.heat],
    linked: [SYSTEM_IDS.health, SYSTEM_IDS.energy],
  },
  coastal: {
    id: "10000000-0000-4000-8000-000000000003",
    systemId: SYSTEM_IDS.coastal,
    title: { el: "Παράκτια διάβρωση", en: "Coastal Erosion" },
    description: { el: "Διάβρωση και πλημμύρες σε παράκτιες ζώνες.", en: "Erosion and flooding affecting coastal zones." },
    hazards: [HAZARD_IDS.seaLevel, HAZARD_IDS.flood],
    linked: [SYSTEM_IDS.water, SYSTEM_IDS.tourism, SYSTEM_IDS.emergency],
  },
  wildfire: {
    id: "10000000-0000-4000-8000-000000000004",
    systemId: SYSTEM_IDS.forest,
    title: { el: "Κίνδυνος δασικών πυρκαγιών", en: "Wildfire Risk" },
    description: { el: "Κίνδυνος πυρκαγιάς και επιπτώσεις στην αποκατάσταση οικοσυστημάτων.", en: "Wildfire risk and ecosystem recovery impacts." },
    hazards: [HAZARD_IDS.wildfire, HAZARD_IDS.drought],
    linked: [SYSTEM_IDS.emergency, SYSTEM_IDS.health],
  },
};

const CONNECTED_CASE_ID = "20000000-0000-4000-8000-000000000001";

async function ensureConnectedJourney(db, { adminId, organisationId }) {
  for (const impact of Object.values(IMPACTS)) {
    await db.run(
      `insert into impacts (id, system_id, title, description, created_by)
       values (?, ?, ?, ?, ?)
       on conflict(id) do update set system_id = excluded.system_id, title = excluded.title,
         description = excluded.description, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      impact.id,
      impact.systemId,
      JSON.stringify(impact.title),
      JSON.stringify(impact.description),
      adminId
    );
    await db.run("delete from impact_hazards where impact_id = ?", impact.id);
    await db.run("delete from impact_linked_systems where impact_id = ?", impact.id);
    for (const hazardId of impact.hazards) await db.run("insert into impact_hazards (impact_id, hazard_id) values (?, ?)", impact.id, hazardId);
    for (const systemId of impact.linked) await db.run("insert into impact_linked_systems (impact_id, system_id) values (?, ?)", impact.id, systemId);
  }

  const existingCases = await db.all("select id, title from case_studies where deleted_at is null");
  for (const row of existingCases) {
    const title = JSON.parse(row.title || "{}").en || "";
    const impact = /heat/i.test(title) ? IMPACTS.heat : /flood|mandra/i.test(title) ? IMPACTS.flood : /coastal/i.test(title) ? IMPACTS.coastal : /forest|wildfire/i.test(title) ? IMPACTS.wildfire : null;
    if (!impact) continue;
    await db.run("update case_studies set impact_id = ? where id = ?", impact.id, row.id);
    await db.run("delete from case_hazards where case_id = ?", row.id);
    await db.run("delete from case_linked_systems where case_id = ?", row.id);
    for (const hazardId of impact.hazards) await db.run("insert into case_hazards (case_id, hazard_id) values (?, ?)", row.id, hazardId);
    for (const systemId of impact.linked) await db.run("insert into case_linked_systems (case_id, system_id) values (?, ?)", row.id, systemId);
  }

  await db.run(
    `insert into case_studies
       (id, slug, title, description, organisation_id, owner_id, status, sectors, area, impact_id)
     values (?, 'flood-resilience-western-athens', ?, ?, ?, ?, 'in_progress', ?, ?, ?)
     on conflict(id) do update set slug = excluded.slug, title = excluded.title, description = excluded.description,
       area = excluded.area, impact_id = excluded.impact_id, deleted_at = null,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    CONNECTED_CASE_ID,
    JSON.stringify({ el: "Ανθεκτικότητα στις πλημμύρες", en: "Flood resilience" }),
    JSON.stringify({ el: "Μια πλήρως συνδεδεμένη διαδρομή αστικής ανθεκτικότητας.", en: "A fully connected urban resilience journey." }),
    organisationId,
    adminId,
    JSON.stringify({ el: "Δομημένο περιβάλλον", en: "Built Environment" }),
    JSON.stringify({ el: "Δυτική Αθήνα", en: "Western Athens" }),
    IMPACTS.flood.id
  );
  await db.run("insert or ignore into case_members (case_id, user_id, role) values (?, ?, 'coordinator')", CONNECTED_CASE_ID, adminId);
  for (const [phase, status] of [["phase1", "completed"], ["phase2", "current"], ["phase3", "locked"]]) {
    await db.run(
      "insert or ignore into case_phase_state (case_id, phase, status, updated_by) values (?, ?, ?, ?)",
      CONNECTED_CASE_ID,
      phase,
      status,
      adminId
    );
  }
  // The product has one Resilience Journey per Climate Impact. Keep older
  // demo records available in the catalogue, but detach duplicate links so
  // the Impact view can never fan out into parallel journeys.
  await db.run(
    "update case_studies set impact_id = null where impact_id = ? and id <> ?",
    IMPACTS.flood.id,
    CONNECTED_CASE_ID
  );
  await db.run("delete from case_hazards where case_id = ?", CONNECTED_CASE_ID);
  await db.run("delete from case_linked_systems where case_id = ?", CONNECTED_CASE_ID);
  for (const hazardId of IMPACTS.flood.hazards) await db.run("insert into case_hazards (case_id, hazard_id) values (?, ?)", CONNECTED_CASE_ID, hazardId);
  for (const systemId of IMPACTS.flood.linked) await db.run("insert into case_linked_systems (case_id, system_id) values (?, ?)", CONNECTED_CASE_ID, systemId);

  const futureId = "30000000-0000-4000-8000-000000000001";
  const visionId = "30000000-0000-4000-8000-000000000002";
  const optionId = "30000000-0000-4000-8000-000000000003";
  const pathwayId = "30000000-0000-4000-8000-000000000004";
  await db.run(
    `insert or ignore into alternative_futures (id, case_id, title, description, created_by, status, highlighted)
     values (?, ?, ?, ?, ?, 'proposed', 1)`,
    futureId,
    CONNECTED_CASE_ID,
    JSON.stringify({ el: "Ανθεκτική πόλη 2040", en: "Resilient city 2040" }),
    JSON.stringify({ el: "Η πόλη διαχειρίζεται το νερό ως κοινό πόρο.", en: "The city manages water as a shared resource." }),
    adminId
  );
  const ADDITIONAL_FUTURES = [
    {
      id: "30000000-0000-4000-8000-000000000011",
      title: { el: "Συνέχιση των σημερινών τάσεων 2040", en: "Business as Usual 2040" },
      description: {
        el: "Οι κλιματικές πιέσεις εντείνονται, ενώ η προσαρμογή παραμένει αποσπασματική και αντιδραστική.",
        en: "Climate pressures intensify while adaptation remains fragmented and reactive.",
      },
      benefits: {
        el: "Χαμηλή άμεση οργανωτική επιβάρυνση και αξιοποίηση υφιστάμενων διαδικασιών.",
        en: "Low immediate organisational burden and continued use of existing processes.",
      },
      barriers: {
        el: "Αυξανόμενη έκθεση, ανισότητες, πίεση στις υποδομές και στις υπηρεσίες υγείας.",
        en: "Increasing exposure, inequality, infrastructure stress and pressure on health services.",
      },
    },
    {
      id: "30000000-0000-4000-8000-000000000012",
      title: { el: "Συντονισμένη σταδιακή προσαρμογή 2040", en: "Coordinated Incremental Adaptation 2040" },
      description: {
        el: "Τα υφιστάμενα συστήματα βελτιώνονται σταδιακά μέσα από συντονισμένα και στοχευμένα μέτρα προσαρμογής.",
        en: "Existing systems improve gradually through coordinated, targeted adaptation measures.",
      },
      benefits: {
        el: "Καλύτερη ετοιμότητα, μείωση κινδύνου σε κρίσιμες περιοχές και ρεαλιστική σταδιακή εφαρμογή.",
        en: "Improved preparedness, reduced risk in critical areas and realistic phased delivery.",
      },
      barriers: {
        el: "Παραμένουν συστημικές ευπάθειες και απαιτείται σταθερός διατομεακός συντονισμός.",
        en: "Systemic vulnerabilities remain and sustained cross-sector coordination is required.",
      },
    },
    {
      id: "30000000-0000-4000-8000-000000000013",
      title: { el: "Μετασχηματιστική ανθεκτικότητα 2040", en: "Transformative Resilience 2040" },
      description: {
        el: "Τα συστήματα της Αττικής αλλάζουν ουσιαστικά, ώστε να προλαμβάνουν τον κλιματικό κίνδυνο και να ενισχύουν τη μακροπρόθεσμη ανθεκτικότητα.",
        en: "Attica’s systems change fundamentally to anticipate climate risk and build long-term resilience.",
      },
      benefits: {
        el: "Ισχυρότερος συντονισμός, μικρότερη δομική ευπάθεια, δικαιότερη ανθεκτικότητα και υψηλότερη προσαρμοστική ικανότητα.",
        en: "Stronger coordination, lower structural vulnerability, more equitable resilience and greater adaptive capacity.",
      },
      barriers: {
        el: "Απαιτεί μακροπρόθεσμη δέσμευση, νέες συνεργασίες, επενδύσεις και αλλαγές στη διακυβέρνηση.",
        en: "Requires long-term commitment, new partnerships, investment and governance change.",
      },
    },
  ];
  for (const future of ADDITIONAL_FUTURES) {
    await db.run(
      `insert into alternative_futures
         (id, case_id, title, description, benefits, barriers, created_by, status, highlighted)
       values (?, ?, ?, ?, ?, ?, ?, 'proposed', 0)
       on conflict(id) do update set title = excluded.title, description = excluded.description,
         benefits = excluded.benefits, barriers = excluded.barriers`,
      future.id,
      CONNECTED_CASE_ID,
      JSON.stringify(future.title),
      JSON.stringify(future.description),
      JSON.stringify(future.benefits),
      JSON.stringify(future.barriers),
      adminId
    );
  }
  await db.run(
    `insert or ignore into vision_elements (id, case_id, future_id, author_id, title_el, title_en, description_el, description_en, body, include_in_synthesis, highlighted)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    visionId,
    CONNECTED_CASE_ID,
    futureId,
    adminId,
    "Πλημμυρο-ασφαλείς γειτονιές",
    "Flood-safe neighbourhoods",
    "Γειτονιές συνδεδεμένες με γαλαζοπράσινες υποδομές, ανθεκτικές σε ακραία καιρικά φαινόμενα.",
    "Flood-safe neighbourhoods connected by blue-green infrastructure",
    "Flood-safe neighbourhoods connected by blue-green infrastructure"
  );
  // Demo stakeholder discussion on the Alternative Future above. Without a
  // visible conversation the co-creation UI reads as an empty form, so these
  // seed a realistic thread: three stakeholders with different vantage
  // points, one reply building on another, and recorded agreement. They are
  // clearly demo accounts (@demo.adapttica.local, the same convention as the
  // sign-in role cards) rather than production data.
  const DEMO_STAKEHOLDERS = [
    { id: "40000000-0000-4000-8000-000000000001", email: "maria.k@demo.adapttica.local", name: "Maria K.", role: "representative", category: "public" },
    { id: "40000000-0000-4000-8000-000000000002", email: "nikos.p@demo.adapttica.local", name: "Nikos P.", role: "user", category: "private" },
    { id: "40000000-0000-4000-8000-000000000003", email: "eleni.t@demo.adapttica.local", name: "Eleni T.", role: "user", category: "civil" },
  ];
  // Same credential policy as the other demo accounts; resolved here
  // because this runs before seed()'s own demoPassword is in scope.
  const demoStakeholderPassword = await hashPassword(process.env.SEED_DEMO_PASSWORD || "Demo123!");
  for (const person of DEMO_STAKEHOLDERS) {
    await db.run(
      `insert or ignore into users (id, email, password_hash, full_name, platform_role, organisation_id, locale, stakeholder_category)
       values (?, ?, ?, ?, ?, ?, 'el', ?)`,
      person.id,
      person.email,
      demoStakeholderPassword,
      person.name,
      person.role === "representative" ? "representative" : "user",
      organisationId,
      person.category
    );
    await db.run(
      "insert or ignore into case_members (case_id, user_id, role) values (?, ?, ?)",
      CONNECTED_CASE_ID,
      person.id,
      person.role
    );
  }

  const DEMO_REPLIES = [
    {
      id: "40000000-0000-4000-8000-000000000101",
      author: DEMO_STAKEHOLDERS[0].id,
      body: "Το σενάριο μειώνει την έκθεση σε πλημμύρες, αλλά πρέπει να εξεταστεί και το κόστος συντήρησης για τις μικρότερες κοινότητες.",
      minutesAgo: 180,
    },
    {
      id: "40000000-0000-4000-8000-000000000102",
      author: DEMO_STAKEHOLDERS[1].id,
      body: "Συμφωνώ. Θα το συνδέαμε και με τα έργα αναβάθμισης αποχέτευσης που ήδη προβλέπονται στο ΠεΣΠΚΑ.",
      minutesAgo: 120,
    },
    {
      id: "40000000-0000-4000-8000-000000000103",
      author: DEMO_STAKEHOLDERS[2].id,
      body: "Μπορούμε να συμπεριλάβουμε πιο ρητά την προσβασιμότητα και τις ευάλωτες γειτονιές;",
      minutesAgo: 45,
    },
  ];
  for (const reply of DEMO_REPLIES) {
    await db.run(
      `insert or ignore into future_replies (id, future_id, author_id, body, created_at)
       values (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))`,
      reply.id,
      futureId,
      reply.author,
      reply.body,
      `-${reply.minutesAgo} minutes`
    );
  }
  // Recorded support, so the vote tallies are not all zero on first look.
  for (const person of DEMO_STAKEHOLDERS.slice(0, 2)) {
    await db.run(
      "insert or ignore into future_votes (future_id, user_id, value) values (?, ?, 'agree')",
      futureId,
      person.id
    );
  }

  // Phase 1 is read-only context, but stakeholders can flag what is missing
  // or wrong in it ("comment or flag something that should be considered").
  // Seeding that thread shows what the panel is for -- an empty box does not.
  const DEMO_BASELINE_COMMENTS = [
    {
      id: "40000000-0000-4000-8000-000000000201",
      author: DEMO_STAKEHOLDERS[0].id,
      body: "Λείπει ο επικαιροποιημένος χάρτης πλημμυρικής επικινδυνότητας του 2024 — η τρέχουσα εικόνα υποεκτιμά τη ζώνη γύρω από το ρέμα.",
      minutesAgo: 260,
    },
    {
      id: "40000000-0000-4000-8000-000000000202",
      author: DEMO_STAKEHOLDERS[1].id,
      body: "Να προστεθεί και η χωρητικότητα του δικτύου ομβρίων ανά συνοικία· χωρίς αυτό δεν μπορούμε να συγκρίνουμε ρεαλιστικά τις επιλογές στη Φάση 3.",
      minutesAgo: 150,
    },
    {
      id: "40000000-0000-4000-8000-000000000203",
      author: DEMO_STAKEHOLDERS[2].id,
      body: "Στους επηρεαζόμενους πληθυσμούς δεν φαίνονται τα σχολεία και οι μονάδες φροντίδας ηλικιωμένων, που είναι από τα πιο ευάλωτα σημεία.",
      minutesAgo: 70,
    },
  ];
  for (const comment of DEMO_BASELINE_COMMENTS) {
    await db.run(
      `insert or ignore into section_comments (id, case_id, section, author_id, body, created_at)
       values (?, ?, 'baseline', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))`,
      comment.id,
      CONNECTED_CASE_ID,
      comment.author,
      comment.body,
      `-${comment.minutesAgo} minutes`
    );
  }

  await db.run(
    `insert into shared_visions (id, case_id, summary_el, summary_en, source_element_ids, published_by)
     values ('30000000-0000-4000-8000-000000000005', ?, ?, ?, ?, ?)
     on conflict(case_id) do update set summary_el = excluded.summary_el, summary_en = excluded.summary_en,
       source_element_ids = excluded.source_element_ids, published_by = excluded.published_by`,
    CONNECTED_CASE_ID,
    "Ασφαλείς γειτονιές με γαλάζιες και πράσινες υποδομές.",
    "Flood-safe neighbourhoods supported by blue-green infrastructure.",
    JSON.stringify([visionId]),
    adminId
  );
  await db.run(
    `insert into theory_of_change_entries
       (id, case_id, current_state, desired_future, required_transformations, intermediate_outcomes, enabling_conditions, updated_by)
     values ('30000000-0000-4000-8000-000000000006', ?, ?, ?, ?, ?, ?, ?)
     on conflict(case_id) do update set current_state = excluded.current_state, desired_future = excluded.desired_future,
       required_transformations = excluded.required_transformations, intermediate_outcomes = excluded.intermediate_outcomes,
       enabling_conditions = excluded.enabling_conditions, updated_by = excluded.updated_by`,
    CONNECTED_CASE_ID,
    JSON.stringify({ el: "Υψηλή έκθεση σε αστικές πλημμύρες", en: "High exposure to urban flooding" }),
    JSON.stringify({ el: "Ασφαλείς και προετοιμασμένες γειτονιές", en: "Safe and prepared neighbourhoods" }),
    JSON.stringify({ el: "Συνδυασμός υποδομών, διακυβέρνησης και έγκαιρης προειδοποίησης", en: "Integrated infrastructure, governance and early warning" }),
    JSON.stringify({ el: "Μειωμένη έκθεση και ταχύτερη απόκριση", en: "Reduced exposure and faster response" }),
    JSON.stringify({ el: "Χρηματοδότηση, δεδομένα και διατομεακή συνεργασία", en: "Funding, data and cross-system collaboration" }),
    adminId
  );
  // Demo discussion on the Theory of Change, so its agree/disagree/reply
  // thread doesn't read as an empty, untested feature out of the box.
  const tocParticipant = await db.get("select id from users where email = ? collate nocase", "participant@demo.adapttica.local");
  const tocRepresentative = await db.get("select id from users where email = ? collate nocase", "representative@demo.adapttica.local");
  if (tocParticipant) {
    await db.run(
      "insert into toc_votes (case_id, user_id, value) values (?, ?, 'agree') on conflict(case_id, user_id) do update set value = excluded.value",
      CONNECTED_CASE_ID,
      tocParticipant.id
    );
    await db.run(
      `insert into toc_replies (id, case_id, author_id, body) values (?, ?, ?, ?)
       on conflict(id) do nothing`,
      "30000000-0000-4000-8000-000000000201",
      CONNECTED_CASE_ID,
      tocParticipant.id,
      "The early-warning piece needs a named owner, otherwise it stays a nice sentence and nothing else."
    );
  }
  if (tocRepresentative) {
    await db.run(
      "insert into toc_votes (case_id, user_id, value) values (?, ?, 'agree') on conflict(case_id, user_id) do update set value = excluded.value",
      CONNECTED_CASE_ID,
      tocRepresentative.id
    );
    await db.run(
      `insert into toc_replies (id, case_id, author_id, body) values (?, ?, ?, ?)
       on conflict(id) do nothing`,
      "30000000-0000-4000-8000-000000000202",
      CONNECTED_CASE_ID,
      tocRepresentative.id,
      "Agreed on the direction -- we should still name which existing infrastructure this connects to."
    );
  }
  await db.run(
    `insert or ignore into adaptation_options
       (id, case_id, author_id, title, description, benefits, enabling_conditions, status, ready_for_pathway)
     values (?, ?, ?, ?, ?, ?, ?, 'proposed', 1)`,
    optionId,
    CONNECTED_CASE_ID,
    adminId,
    JSON.stringify({ el: "Δίκτυο γαλάζιων-πράσινων διαδρομών", en: "Blue-green corridor network" }),
    JSON.stringify({ el: "Συνδεδεμένες παρεμβάσεις συγκράτησης και απορρόφησης ομβρίων.", en: "Connected interventions for retaining and absorbing stormwater." }),
    JSON.stringify({ el: "Μείωση πλημμυρών και θερμικής επιβάρυνσης", en: "Reduced flooding and heat exposure" }),
    JSON.stringify({ el: "Συντονισμός περιφερειακών υπηρεσιών, ύδρευσης και μεταφορών", en: "Coordination across regional services, water and transport" })
  );
  // Phase 3, Step 1 (Identify Adaptation Options): realistic PESPKA Attica
  // (2020) reference measures for Water, seeded as placeholder data until
  // the real dataset is connected. Kept read-only reference evidence,
  // distinct from stakeholder-proposed options like the one just above.
  const PESPKA_MEASURES = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      code: "M05.03",
      title: { el: "Ειδική μελέτη αντιμετώπισης πλημμυρικού κινδύνου", en: "Special study addressing flood risk" },
      description: {
        el: "Εκπόνηση εξειδικευμένης μελέτης για την αντιμετώπιση του πλημμυρικού κινδύνου σε ευάλωτες περιοχές.",
        en: "Commissioning a dedicated study to address flood risk in vulnerable areas.",
      },
      interventionType: { el: "Σχεδιασμός", en: "Planning" },
      timeHorizon: "short",
      shortlisted: 1,
      cost: { el: "Χαμηλό", en: "Low" },
      effectiveness: { el: "Μεσαία", en: "Medium" },
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      code: "M05.05",
      title: { el: "Προώθηση εξοικονόμησης νερού σε όλους τους τομείς", en: "Promotion of water conservation across sectors" },
      description: {
        el: "Δράσεις ενημέρωσης και κινήτρων για εξοικονόμηση νερού σε οικιακή, γεωργική και βιομηχανική χρήση.",
        en: "Awareness and incentive actions for water saving across household, agricultural and industrial use.",
      },
      interventionType: { el: "Συμπεριφορική / Κοινωνική παρέμβαση", en: "Behavioural / Social intervention" },
      timeHorizon: "short",
      shortlisted: 1,
      cost: { el: "Χαμηλό", en: "Low" },
      effectiveness: { el: "Μεσαία", en: "Medium" },
    },
    {
      id: "40000000-0000-4000-8000-000000000003",
      code: "M05.06",
      title: { el: "Χρήση επεξεργασμένων/ανακυκλωμένων υδάτων", en: "Use of treated/recycled water" },
      description: {
        el: "Επέκταση της χρήσης επεξεργασμένων λυμάτων για άρδευση και μη πόσιμες χρήσεις.",
        en: "Expanding the use of treated wastewater for irrigation and non-potable uses.",
      },
      interventionType: { el: "Υποδομή / Φυσικός μετασχηματισμός", en: "Infrastructure / Physical transformation" },
      timeHorizon: "long",
      shortlisted: 0,
      cost: { el: "Υψηλό", en: "High" },
      effectiveness: { el: "Υψηλή", en: "High" },
    },
    {
      id: "40000000-0000-4000-8000-000000000004",
      code: "M05.07",
      title: { el: "Βελτίωση της ικανότητας διήθησης του εδάφους", en: "Improvement of soil infiltration capacity" },
      description: {
        el: "Παρεμβάσεις που αυξάνουν τη διήθηση των όμβριων υδάτων στο έδαφος, μειώνοντας την απορροή.",
        en: "Interventions that increase stormwater infiltration into the ground, reducing runoff.",
      },
      interventionType: { el: "Παρέμβαση βασισμένη στη φύση", en: "Nature-based intervention" },
      timeHorizon: "long",
      shortlisted: 1,
      cost: { el: "Μεσαίο", en: "Medium" },
      effectiveness: { el: "Υψηλή", en: "High" },
    },
    {
      id: "40000000-0000-4000-8000-000000000005",
      code: "M05.08",
      title: { el: "Πρόληψη ρύπανσης υδάτων και βιώσιμη χρήση νερού", en: "Prevention of water pollution and sustainable water use" },
      description: {
        el: "Ενίσχυση ελέγχων και κανονιστικού πλαισίου για την πρόληψη ρύπανσης και τη βιώσιμη διαχείριση υδάτινων πόρων.",
        en: "Strengthening controls and the regulatory framework to prevent pollution and manage water resources sustainably.",
      },
      interventionType: { el: "Διακυβέρνηση", en: "Governance" },
      timeHorizon: "short",
      shortlisted: 0,
      cost: { el: "Μεσαίο", en: "Medium" },
      effectiveness: { el: "Μεσαία", en: "Medium" },
    },
  ];
  for (const measure of PESPKA_MEASURES) {
    const evidence = {
      code: measure.code,
      sector: { el: "Νερό", en: "Water" },
      interventionType: measure.interventionType,
      proposedPeriod: measure.timeHorizon === "short" ? { el: "2025–2030", en: "2025–2030" } : { el: "2030–2040", en: "2030–2040" },
      implementingAuthority: { el: "Περιφέρεια Αττικής", en: "Region of Attica" },
      estimatedCost: measure.cost,
      effectiveness: measure.effectiveness,
      costEffectiveness: { el: "Μεσαία", en: "Medium" },
      economicBenefit: { el: "Μεσαίο", en: "Medium" },
      environmentalBenefit: { el: "Υψηλό", en: "High" },
      socialBenefit: { el: "Μεσαίο", en: "Medium" },
      synergies: {
        el: "Συνέργειες με το Περιφερειακό Σχέδιο Προσαρμογής στην Κλιματική Αλλαγή (ΠΕΣΠΚΑ) Αττικής.",
        en: "Synergies with the Attica Regional Climate Change Adaptation Plan (PESPKA).",
      },
      source: { el: "ΠΕΣΠΚΑ Αττικής, 2020", en: "PESPKA Attica, 2020" },
    };
    await db.run(
      `insert into adaptation_options
         (id, case_id, author_id, title, description, source, time_horizon, pespka_evidence, shortlisted, status)
       values (?, ?, ?, ?, ?, 'pespka', ?, ?, ?, 'proposed')
       on conflict(id) do update set title = excluded.title, description = excluded.description,
         time_horizon = excluded.time_horizon, pespka_evidence = excluded.pespka_evidence, shortlisted = excluded.shortlisted`,
      measure.id,
      CONNECTED_CASE_ID,
      adminId,
      JSON.stringify(measure.title),
      JSON.stringify(measure.description),
      measure.timeHorizon,
      JSON.stringify(evidence),
      measure.shortlisted
    );
  }
  // A couple of demo assessments on the strongest shortlisted measure, so
  // Step 2's collective assessment and automatic prioritisation have
  // something real to show out of the box.
  await db.run(
    `insert into option_assessments (id, option_id, user_id, effectiveness, feasibility, co_benefits, transformative_potential, robust_across_futures, comment)
     values (?, ?, ?, 'high', 'medium', 'high', 'medium', 'most', ?)
     on conflict(option_id, user_id) do update set effectiveness = excluded.effectiveness, feasibility = excluded.feasibility,
       co_benefits = excluded.co_benefits, transformative_potential = excluded.transformative_potential,
       robust_across_futures = excluded.robust_across_futures, comment = excluded.comment`,
    "40000000-0000-4000-8000-000000000101",
    "40000000-0000-4000-8000-000000000004",
    adminId,
    "Nature-based infiltration measures pay off across most of our scenario range, not just the wettest one."
  );
  await db.run(
    `insert into option_supports (option_id, user_id) values (?, ?) on conflict(option_id, user_id) do nothing`,
    "40000000-0000-4000-8000-000000000004",
    adminId
  );

  await db.run(
    `insert or ignore into pathways
       (id, case_id, title, short_description, time_horizon, primary_system_id, relevant_hazards, relevant_impacts,
        sequence_of_interventions, enabling_conditions, decision_points, status, created_by)
     values (?, ?, ?, ?, '2040', ?, ?, ?, ?, ?, ?, 'under_discussion', ?)`,
    pathwayId,
    CONNECTED_CASE_ID,
    JSON.stringify({ el: "Διαδρομή 1", en: "Pathway 1" }),
    JSON.stringify({ el: "Σταδιακή ανάπτυξη γαλάζιων-πράσινων υποδομών.", en: "Phased delivery of blue-green infrastructure." }),
    SYSTEM_IDS.built,
    JSON.stringify(["floods"]),
    JSON.stringify(IMPACTS.flood.title),
    JSON.stringify({ el: "Πιλοτικές παρεμβάσεις, κλιμάκωση, ολοκλήρωση δικτύου", en: "Pilots, scaling and network completion" }),
    JSON.stringify({ el: "Κοινά δεδομένα και σταθερή χρηματοδότηση", en: "Shared data and stable funding" }),
    JSON.stringify({ el: "Αξιολόγηση το 2030 και το 2035", en: "Review in 2030 and 2035" }),
    adminId
  );
  await db.run("insert or ignore into pathway_options (pathway_id, option_id, sort_order) values (?, ?, 0)", pathwayId, optionId);
  for (const systemId of IMPACTS.flood.linked) await db.run("insert or ignore into pathway_linked_systems (pathway_id, system_id) values (?, ?)", pathwayId, systemId);
  for (const [index, step] of ["futures", "vision", "toc", "options", "pathways", "compare", "outcome"].entries()) {
    await db.run(
      `insert into case_step_state (case_id, step, status, opened_by, opened_at)
       values (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       on conflict(case_id, step) do update set status = excluded.status`,
      CONNECTED_CASE_ID,
      step,
      index === 0 ? "active" : "not_started",
      adminId
    );
  }
}

const DEMO_RESOURCES = [
  {
    titleEl: "Οδηγός αξιολόγησης κλιματικού κινδύνου",
    titleEn: "Climate risk assessment guide",
    descriptionEl: "Μεθοδολογία αξιολόγησης κινδύνου για τοπικούς φορείς.",
    descriptionEn: "A risk-assessment methodology for local authorities.",
    resourceType: "report",
    fileName: "climate-risk-guide.pdf",
    fileType: "application/pdf",
    // Baseline evidence — belongs to Phase 1.
    tags: ["phase1"],
  },
  {
    titleEl: "Σύνολο δεδομένων θερμικών νησίδων",
    titleEn: "Urban heat island dataset",
    descriptionEl: "Καταγραφή θερμοκρασιακών δεδομένων ανά περιοχή.",
    descriptionEn: "Recorded temperature data by area.",
    resourceType: "dataset",
    fileName: "heat-island-data.csv",
    fileType: "text/csv",
    tags: ["phase1"],
  },
  {
    titleEl: "Αποτελέσματα εργαστηρίου συνδημιουργίας",
    titleEn: "Co-creation workshop outputs",
    descriptionEl: "Συνοπτικά ευρήματα από το πρώτο εργαστήριο.",
    descriptionEn: "Summary findings from the first workshop.",
    resourceType: "workshop_output",
    fileName: "workshop-summary.pdf",
    // Co-creation output — belongs to Phase 2.
    tags: ["phase2"],
    fileType: "application/pdf",
  },
];

const DEMO_DECISIONS = [
  {
    titleEl: "Προτεραιότητα στις γειτονιές με τη μεγαλύτερη θερμική επιβάρυνση",
    titleEn: "Prioritise the neighbourhoods most affected by heat",
    descriptionEl: "Ο δείκτης τρωτότητας του Παρατηρητηρίου θα καθοδηγήσει τη σειρά των πιλοτικών παρεμβάσεων.",
    descriptionEn: "The Observatory vulnerability indicator will guide the order of pilot interventions.",
    status: "decided",
  },
  {
    titleEl: "Συνδυασμός σκίασης και διαπερατών επιφανειών",
    titleEn: "Combine shading and permeable surfaces",
    descriptionEl: "Οι δύο κατηγορίες μέτρων θα αξιολογούνται μαζί στις πιλοτικές περιοχές.",
    descriptionEn: "Both measure categories will be assessed together in the pilot areas.",
    status: "open",
  },
  {
    titleEl: "Επιλογή τριών πιλοτικών περιοχών",
    titleEn: "Select three pilot areas",
    descriptionEl: "Η επιλογή θα οριστικοποιηθεί μετά τον έλεγχο των δημογραφικών δεδομένων.",
    descriptionEn: "The selection will be confirmed after the demographic data review.",
    status: "draft",
  },
];

// Placeholder votes/comments for each DEMO_DECISIONS entry above (matched by
// index), so a fresh install doesn't show "0 votes · 0 comments" on every
// decision. Left empty for the still-draft one, since a decision that
// hasn't opened for voting shouldn't already have votes recorded against it.
const DEMO_DECISION_ACTIVITY = [
  {
    votes: [
      { as: "admin", value: "support" },
      { as: "representative", value: "support" },
      { as: "participant", value: "support" },
    ],
    comments: [
      { as: "admin", body: "Ο δείκτης τρωτότητας επιβεβαιώνει τις τρεις γειτονιές υψηλότερης προτεραιότητας. Προχωράμε με αυτή τη σειρά." },
      { as: "representative", body: "Συμφωνούμε, αλλά χρειαζόμαστε κι ένα σχέδιο επικοινωνίας προς τους κατοίκους πριν ξεκινήσουν οι παρεμβάσεις." },
      { as: "participant", body: "Ευχαριστούμε για την ενημέρωση, θα ήταν χρήσιμο ένα ανοιχτό webinar για την κοινότητα." },
    ],
  },
  {
    votes: [
      { as: "admin", value: "support" },
      { as: "representative", value: "support" },
      { as: "participant", value: "concern" },
    ],
    comments: [
      { as: "participant", body: "Η ιδέα είναι καλή, αλλά ανησυχώ για το κόστος συντήρησης των διαπερατών επιφανειών." },
      { as: "representative", body: "Μπορούμε να το συνδυάσουμε με το υπάρχον πρόγραμμα αστικού πρασίνου για μείωση κόστους." },
    ],
  },
  {
    votes: [],
    comments: [
      { as: "admin", body: "Πρόχειρη λίστα υποψήφιων περιοχών· θα την οριστικοποιήσουμε μετά τον έλεγχο των δημογραφικών δεδομένων." },
    ],
  },
];

export async function seed() {
  await migrate();
  const db = await getDb();

  const orgId = crypto.randomUUID();
  const existingOrg = await db.get("select id from organisations where name = ?", "Region of Attica");
  const organisationId = existingOrg?.id || orgId;
  if (!existingOrg) {
    await db.run("insert into organisations (id, name) values (?, ?)", organisationId, "Region of Attica");
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@adapttica.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  let admin = await db.get("select id from users where email = ? collate nocase", adminEmail);
  if (!admin) {
    const id = crypto.randomUUID();
    await db.run(
      `insert into users (id, email, password_hash, full_name, platform_role, organisation_id, locale, stakeholder_category)
       values (?, ?, ?, ?, 'admin', ?, 'el', 'public')`,
      id,
      adminEmail,
      await hashPassword(adminPassword),
      "Platform Administrator",
      organisationId
    );
    admin = { id };
    console.log(`Seeded admin account: ${adminEmail} / ${adminPassword} (change this password after first login).`);
  }

  // These least-privileged demo accounts power the role cards on the local
  // sign-in screen. They are real database users (not a client-side bypass),
  // so authentication, sessions and permissions follow the production path.
  const demoPassword = process.env.SEED_DEMO_PASSWORD || "Demo123!";
  const demoUsers = [
    {
      email: "participant@demo.adapttica.local",
      name: "Demo Participant",
      role: "user",
      category: "research",
    },
    {
      email: "representative@demo.adapttica.local",
      name: "Demo Organisation Representative",
      role: "representative",
      category: "private",
    },
  ];
  for (const demoUser of demoUsers) {
    const existing = await db.get("select id from users where email = ? collate nocase", demoUser.email);
    if (!existing) {
      await db.run(
        `insert into users (id, email, password_hash, full_name, platform_role, organisation_id, locale, stakeholder_category)
         values (?, ?, ?, ?, ?, ?, 'en', ?)`,
        crypto.randomUUID(),
        demoUser.email,
        await hashPassword(demoPassword),
        demoUser.name,
        demoUser.role,
        organisationId,
        demoUser.category
      );
    }
  }

  const existingCases = await db.get("select count(*) as count from case_studies");
  if (existingCases.count === 0) {
    for (const demo of DEMO_CASES) {
      const id = crypto.randomUUID();
      const slug = `${demo.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}-${id.slice(0, 4)}`;
      await db.run(
        `insert into case_studies (id, slug, title, description, sectors, area, organisation_id, owner_id, status)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        slug,
        JSON.stringify({ el: demo.titleEl, en: demo.titleEn }),
        JSON.stringify({ el: demo.descriptionEl, en: demo.descriptionEn }),
        JSON.stringify({ el: demo.sectorEl, en: demo.sectorEn }),
        JSON.stringify({ el: demo.areaEl, en: demo.areaEn }),
        organisationId,
        admin.id,
        demo.status
      );
      await db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'coordinator')", id, admin.id);
    }
    console.log(`Seeded ${DEMO_CASES.length} demo case studies.`);
  }

  // Backfill existing demo cases and seed one complete reference journey.
  // This is intentionally idempotent: it is also the data migration path
  // for local databases created before Systems/Impacts/Pathways existed.
  await ensureConnectedJourney(db, { adminId: admin.id, organisationId });
  for (const [phase, status] of [["phase1", "completed"], ["phase2", "current"], ["phase3", "locked"]]) {
    await db.run(
      `insert or ignore into case_phase_state (case_id, phase, status, updated_by)
       select id, ?, ?, ? from case_studies where deleted_at is null`,
      phase,
      status,
      admin.id
    );
  }

  // Keep every demonstration case useful for each role: the participant and
  // organisation representative can open it, while only the coordinator or
  // platform administrator receives management actions.
  const caseRows = await db.all("select id from case_studies order by created_at");
  const participant = await db.get("select id from users where email = ? collate nocase", "participant@demo.adapttica.local");
  const representative = await db.get("select id from users where email = ? collate nocase", "representative@demo.adapttica.local");
  for (const caseRow of caseRows) {
    if (participant) await db.run("insert or ignore into case_members (case_id, user_id, role) values (?, ?, 'user')", caseRow.id, participant.id);
    if (representative) await db.run("insert or ignore into case_members (case_id, user_id, role) values (?, ?, 'representative')", caseRow.id, representative.id);

    const decisionCount = await db.get("select count(*) as count from decisions where case_id = ?", caseRow.id);
    if (decisionCount.count === 0) {
      const asUserId = { admin: admin.id, participant: participant?.id, representative: representative?.id };
      for (const [index, decision] of DEMO_DECISIONS.entries()) {
        const decisionId = crypto.randomUUID();
        await db.run(
          `insert into decisions (id, case_id, title, description, status, created_by)
           values (?, ?, ?, ?, ?, ?)`,
          decisionId,
          caseRow.id,
          JSON.stringify({ el: decision.titleEl, en: decision.titleEn }),
          JSON.stringify({ el: decision.descriptionEl, en: decision.descriptionEn }),
          decision.status,
          admin.id
        );

        const activity = DEMO_DECISION_ACTIVITY[index];
        for (const vote of activity?.votes || []) {
          const userId = asUserId[vote.as];
          if (!userId) continue;
          await db.run(
            "insert into decision_votes (decision_id, user_id, value) values (?, ?, ?)",
            decisionId,
            userId,
            vote.value
          );
        }
        for (const comment of activity?.comments || []) {
          const authorId = asUserId[comment.as];
          if (!authorId) continue;
          await db.run(
            "insert into decision_comments (id, decision_id, author_id, body) values (?, ?, ?, ?)",
            crypto.randomUUID(),
            decisionId,
            authorId,
            comment.body
          );
        }
      }
    }
  }

  const existingResources = await db.get("select count(*) as count from resources");
  if (existingResources.count === 0) {
    for (const demo of DEMO_RESOURCES) {
      const id = crypto.randomUUID();
      await db.run(
        `insert into resources (id, title, description, resource_type, tags, author_id, file_name, storage_key, mime_type, byte_size, published_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        id,
        JSON.stringify({ el: demo.titleEl, en: demo.titleEn }),
        JSON.stringify({ el: demo.descriptionEl, en: demo.descriptionEn }),
        demo.resourceType,
        JSON.stringify(demo.tags || []),
        admin.id,
        demo.fileName,
        `seed/${demo.fileName}`,
        demo.fileType
      );
    }
    console.log(`Seeded ${DEMO_RESOURCES.length} demo resources.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("./env.js");
  seed()
    .then(() => console.log("Seed complete."))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
