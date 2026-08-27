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

const DEMO_RESOURCES = [
  {
    titleEl: "Οδηγός αξιολόγησης κλιματικού κινδύνου",
    titleEn: "Climate risk assessment guide",
    descriptionEl: "Μεθοδολογία αξιολόγησης κινδύνου για τοπικούς φορείς.",
    descriptionEn: "A risk-assessment methodology for local authorities.",
    resourceType: "report",
    fileName: "climate-risk-guide.pdf",
    fileType: "application/pdf",
  },
  {
    titleEl: "Σύνολο δεδομένων θερμικών νησίδων",
    titleEn: "Urban heat island dataset",
    descriptionEl: "Καταγραφή θερμοκρασιακών δεδομένων ανά περιοχή.",
    descriptionEn: "Recorded temperature data by area.",
    resourceType: "dataset",
    fileName: "heat-island-data.csv",
    fileType: "text/csv",
  },
  {
    titleEl: "Αποτελέσματα εργαστηρίου συνδημιουργίας",
    titleEn: "Co-creation workshop outputs",
    descriptionEl: "Συνοπτικά ευρήματα από το πρώτο εργαστήριο.",
    descriptionEn: "Summary findings from the first workshop.",
    resourceType: "workshop_output",
    fileName: "workshop-summary.pdf",
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
      `insert into users (id, email, password_hash, full_name, platform_role, organisation_id, locale)
       values (?, ?, ?, ?, 'admin', ?, 'el')`,
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
    },
    {
      email: "representative@demo.adapttica.local",
      name: "Demo Organisation Representative",
      role: "representative",
    },
  ];
  for (const demoUser of demoUsers) {
    const existing = await db.get("select id from users where email = ? collate nocase", demoUser.email);
    if (!existing) {
      await db.run(
        `insert into users (id, email, password_hash, full_name, platform_role, organisation_id, locale)
         values (?, ?, ?, ?, ?, ?, 'en')`,
        crypto.randomUUID(),
        demoUser.email,
        await hashPassword(demoPassword),
        demoUser.name,
        demoUser.role,
        organisationId
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
        `insert into resources (id, title, description, resource_type, author_id, file_name, storage_key, mime_type, byte_size, published_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        id,
        JSON.stringify({ el: demo.titleEl, en: demo.titleEn }),
        JSON.stringify({ el: demo.descriptionEl, en: demo.descriptionEn }),
        demo.resourceType,
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
