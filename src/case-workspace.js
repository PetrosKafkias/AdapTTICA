// @ts-nocheck -- generic-Element DOM patching, same rationale as the
// @ts-nocheck at the top of runtime-enhancements.js / systems-explorer.js.
//
// The P2R co-creation stepper (Baseline -> Alternative Futures -> Shared
// Vision -> Theory of Change -> Adaptation Options -> Alternative Pathways
// -> Compare & Prioritise -> Preferred/Combined Direction). Attica has one
// Regional Resilience Journey, not one journey per case study: this
// stepper renders inline inside that journey's own pages (regional-
// journey.js's Phase 2/3 views), via `renderCaseJourney()` below. The
// native per-case detail route (?view=case&id=...) and its catalogue
// (?view=cases) are retired and redirected away before they can paint
// (see guardCaseAccess() in runtime-enhancements.js) -- nothing in this
// file targets that native page any more.

import {
  T,
  api,
  getCurrentUser,
  el,
  buildEmptyState,
  buildTextField,
  showToast,
} from "./systems-explorer.js";
import fallbackFloodBaselineReportUrl from "../output/pdf/flood-resilience-phase-1-baseline.pdf?url";

const DEMO_FLOOD_CASE_ID = "20000000-0000-4000-8000-000000000001";

// The journey doc is explicit that the workspace must NOT show every tool
// at once: the user picks a P2R phase and sees only that phase's steps
// ("Ο χρήστης πατάει: Build a Shared Vision" and sees Alternative Futures,
// Shared Vision, Theory of Change and Prioritisation). Phase 1
// (Baseline) has no case_step_state of its own -- it's pre-populated
// context, not a gated activity -- so it's always "completed".
// AFFiNE hosts the live co-creation activities; AdapTTICA VISIONS structures
// what comes out of them. Exported so the phase heroes and every "go to the
// workshop" empty state point at the same place.
export const WORKSHOP_URL = "https://app.affine.pro/";

// Each CTA names the specific activity it opens -- "Open Workshop in
// AFFiNE" on every step read as the same button repeated four times.
const AFFINE_CTA_LABELS = {
  futures: { el: "Άνοιγμα εργαστηρίου Πιθανών Μελλόντων στο AFFiNE", en: "Open Possible Futures Workshop in AFFiNE" },
  vision: { el: "Άνοιγμα εργαστηρίου Κοινού Οράματος στο AFFiNE", en: "Open Shared Vision Workshop in AFFiNE" },
  toc: { el: "Άνοιγμα εργαστηρίου Θεωρίας Αλλαγής στο AFFiNE", en: "Open Theory of Change Workshop in AFFiNE" },
  pathways: { el: "Άνοιγμα εργαστηρίου Χαρτοφυλακίου Παρεμβάσεων στο AFFiNE", en: "Open Pathways Workshop in AFFiNE" },
};

// Each of the three Phase 2 steps co-creates its content live in AFFiNE, so
// every one of them needs its own way in rather than relying on the single
// CTA already sitting in the phase hero above the stepper.
function appendAffineCta(stepBody, lang, stepKey) {
  const link = document.createElement("a");
  link.className = "btn secondary case-step-affine-cta";
  link.href = WORKSHOP_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  const labels = AFFINE_CTA_LABELS[stepKey];
  link.textContent = (labels && labels[lang]) || (labels && labels.en) || (lang === "el" ? "Άνοιγμα εργαστηρίου στο AFFiNE" : "Open Workshop in AFFiNE");
  stepBody.prepend(link);
}

// Shared by every step that lets a coordinator/admin attach an image
// (Theory of Change, Possible Futures): upload through the platform's
// existing generic file endpoint and hand back the key the record stores.
async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/v1/files/upload", { method: "POST", credentials: "same-origin", body: formData });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || "Upload failed.");
  return body.data.file.key;
}

const PHASES = [
  { key: "phase1", labelKey: "p2rPhase1", steps: ["baseline"] },
  { key: "phase2", labelKey: "p2rPhase2", steps: ["futures", "vision", "toc"] },
  { key: "phase3", labelKey: "p2rPhase3", steps: ["options", "pathways", "implementation"] },
];

function phaseOfStep(step) {
  return PHASES.find((p) => p.steps.includes(step))?.key || PHASES[0].key;
}

// This module's own bilingual copy for the terms the Pentsiou-era
// dictionary in systems-explorer.js doesn't already cover (that
// dictionary is reused wholesale below for every term it does share --
// propose/reply/agree/disagree/merge, field labels, comparison criteria,
// baseline/ToC labels -- avoiding a second copy of the same strings).
const T2 = {
  el: {
    tabLabel: "Συνδημιουργία",
    goToWorkshop: "Μετάβαση στο εργαστήριο",
    visionEmptyTitle: "Το Κοινό Όραμα δεν έχει διαμορφωθεί ακόμη",
    visionEmptyDesc: "Το Κοινό Όραμα θα παρουσιαστεί εδώ μόλις συνδιαμορφωθεί στο εργαστήριο εμπλεκόμενων φορέων και υποβληθεί για επανεξέταση.",
    tocEmptyTitle: "Η Θεωρία Αλλαγής δεν έχει αναπτυχθεί ακόμη",
    tocEmptyDesc: "Ο συντονιστής/διαχειριστής θα προσθέσει μια εικόνα και μια περιγραφή εδώ.",
    tocImageLabel: "Εικόνα",
    tocImageAlt: "Διάγραμμα Θεωρίας Αλλαγής",
    tocDiscussionTitle: "Συζήτηση",
    optionsEmptyTitle: "Δεν έχουν καταγραφεί ακόμη επιλογές προσαρμογής",
    optionsEmptyDesc: "Οι επιλογές προσαρμογής εντοπίζονται συνεργατικά με βάση το επικυρωμένο Κοινό Όραμα. Μεταβείτε στο εργαστήριο για να τις καταγράψετε.",
    futuresWorkshopEmpty: "Δεν έχουν συνδιαμορφωθεί ακόμη Πιθανά Μέλλοντα. Μεταβείτε στο εργαστήριο για να τα δημιουργήσετε.",
    futuresWorkshopInProgress: "Τα Πιθανά Μέλλοντα θα εμφανιστούν εδώ μόλις ολοκληρωθεί το εργαστήριο συνδημιουργίας.",
    addFutureHere: "Προσθήκη πιθανού μέλλοντος",
    addVisionHere: "Προσθήκη κοινού οράματος",
    newVisionTitle: "Νέο κοινό όραμα",
    editVisionTitle: "Επεξεργασία κοινού οράματος",
    stepBaseline: "Κατανόηση της πρόκλησης",
    stepPrioritisation: "Ιεράρχηση",
    stepFutures: "Διερεύνηση πιθανών μελλόντων",
    stepVision: "Κοινό όραμα",
    stepToC: "Θεωρία Αλλαγής",
    stepOptions: "Επιλογές προσαρμογής",
    stepPathways: "Χαρτοφυλάκιο παρεμβάσεων",
    stepImplementation: "Υλοποίηση",
    stepCompare: "Σύγκριση & Ιεράρχηση",
    stepOutcome: "Προτιμώμενη / συνδυασμένη διαδρομή",
    p2rPhase1: "Φάση 1 · Προετοιμασία βάσης",
    p2rPhase2: "Φάση 2 · Δημιουργία κοινού οράματος",
    p2rPhase3: "Φάση 3 · Σχεδιασμός διαδρομών",
    phaseCompleted: "Ολοκληρώθηκε",
    phaseCurrent: "Τρέχουσα",
    phaseUpcoming: "Επόμενη",
    phaseLocked: "Κλειδωμένη",
    journeyTitle: "Πορεία Ανθεκτικότητας",
    journeyIntro: "Μία ενιαία πορεία για αυτή την κλιματική επίπτωση, οργανωμένη στις τρεις φάσεις P2R.",
    phase1Question: "Κατανόηση της πρόκλησης",
    phase1Summary: "Εξετάστε την κοινή βάση τεκμηρίωσης πριν ξεκινήσει η συνδημιουργία.",
    phase2Question: "Διαμόρφωση μετασχηματιστικού μέλλοντος",
    phase2Summary: "Διαμορφώστε εναλλακτικά μέλλοντα, κοινό όραμα και τις αλλαγές που απαιτούνται.",
    phase3Question: "Σχεδιασμός διαδρομών μετασχηματισμού",
    phase3Summary: "Σχεδιάστε, συγκρίνετε και συμφωνήστε τις διαδρομές προσαρμογής.",
    phaseLockedExplanation: "Ολοκληρώστε τη φάση Κοινού Οράματος πριν συνεχίσετε στον Σχεδιασμό Διαδρομών.",
    phaseStatusLabel: "Κατάσταση φάσης",
    phaseForum: (n) => `Φόρουμ Φάσης ${n}`,
    forumIntro: "Η συζήτηση παραμένει συνδεδεμένη μόνο με αυτή τη φάση.",
    forumEmpty: "Δεν υπάρχουν ακόμη σχόλια σε αυτή τη φάση.",
    forumPlaceholder: "Προσθέστε σχόλιο στη συζήτηση της φάσης...",
    forumReplyPlaceholder: "Γράψτε μια απάντηση...",
    replyAction: "Απάντηση",
    forumSubmit: "Δημοσίευση σχολίου",
    forumUpvote: "Συμφωνώ",
    forumDownvote: "Διαφωνώ",
    forumVoteUpdated: "Η ψήφος σας ενημερώθηκε.",
    prioritisationTitle: "Ιεράρχηση πιθανών μελλόντων",
    prioritisationIntro: "Σύρετε για να κατατάξετε τα πιθανά μέλλοντα με βάση τη σημασία τους για εσάς. Μετράει μόνο η τελική σειρά. Το αποτέλεσμα μεταφέρεται στο Βήμα 2 — Κοινό Όραμα.",
    prioritisationResultTitle: "Πώς ιεράρχησαν οι υπόλοιποι",
    prioritisationResultEmpty: "Κανείς δεν έχει ιεραρχήσει ακόμη. Το αποτέλεσμα θα εμφανιστεί εδώ μόλις υποβληθεί η πρώτη ιεράρχηση.",
    prioritisationParticipation: (n) => `${n} ${n === 1 ? "συμμετέχων έχει" : "συμμετέχοντες έχουν"} ιεραρχήσει · ποσοστό όσων το κατέταξαν 1ο`,
    prioritisationLeads: (title) => `Προηγείται: ${title}`,
    prioritisationFeeds: "Αυτό το αποτέλεσμα μεταφέρεται στο Βήμα 2 — Κοινό Όραμα.",
    prioritisationMoveUp: "Μετακίνηση προς τα πάνω",
    prioritisationMoveDown: "Μετακίνηση προς τα κάτω",
    interactionsTitle: "Τρεις διαφορετικές ενέργειες",
    interactionVote: "Ψήφος (συμφωνώ / διαφωνώ)",
    interactionVoteDesc: "Η αντίδρασή σας σε μια συγκεκριμένη συνεισφορά.",
    interactionPriority: "Ιεράρχηση",
    interactionPriorityDesc: "Η σχετική σας προτίμηση ανάμεσα στις εναλλακτικές — πλήρης κατάταξη.",
    interactionValidation: "Επικύρωση",
    interactionValidationDesc: "Επίσημη επιβεβαίωση από τον συντονιστή: Προσχέδιο → Σε επανεξέταση → Επικυρωμένο.",
    prioritisationSubmit: "Αποθήκευση ιεράρχησης",
    prioritisationUpdate: "Ενημέρωση ιεράρχησης",
    prioritisationSubmitted: "Η ιεράρχησή σας υποβλήθηκε.",
    prioritisationSaved: "Η ιεράρχησή σας αποθηκεύτηκε.",
    prioritisationEmpty: "Χρειάζεται τουλάχιστον ένα Πιθανό Μέλλον πριν από την ιεράρχηση.",
    noFuturesShort: "Δεν έχουν προταθεί ακόμη εναλλακτικά μέλλοντα.",
    newOption: "Νέα επιλογή προσαρμογής",
    newOptionTitle: "Νέα επιλογή προσαρμογής",
    noOptions: "Δεν έχουν προταθεί ακόμη επιλογές προσαρμογής.",
    coBenefitsLabel: "Συνοφέλη",
    maladaptationRisksLabel: "Κίνδυνοι δυσπροσαρμογής",
    timeHorizonLabel: "Χρονικός ορίζοντας (π.χ. 2050)",
    selectOptionsLabel: "Επιλογές προσαρμογής που περιλαμβάνονται",
    dependenciesLabel: "Εξαρτήσεις",
    opportunitiesLabel: "Ευκαιρίες",
    ctxPrimarySystem: "Κύριο σύστημα",
    ctxImpact: "Κλιματική επίπτωση",
    ctxPressures: "Κλιματικές πιέσεις",
    ctxLinkedSystems: "Συνδεδεμένα συστήματα",
    ctxArea: "Περιοχή",
    ctxCoordinator: "Συντονιστής",
    ctxPhase: "Τρέχουσα φάση",
    ctxStatus: "Κατάσταση",
    addEnglishTranslation: "Προσθήκη αγγλικής μετάφρασης (προαιρετικό)",
    addGreekTranslation: "Προσθήκη ελληνικής μετάφρασης (προαιρετικό)",
    justNow: "μόλις τώρα",
    minutesAgo: (n) => `πριν ${n} λεπτ${n === 1 ? "ό" : "ά"}`,
    hoursAgo: (n) => `πριν ${n} ώρ${n === 1 ? "α" : "ες"}`,
    daysAgo: (n) => `πριν ${n} μέρ${n === 1 ? "α" : "ες"}`,
    memberRole: { user: "Συμμετέχων", representative: "Εκπρόσωπος φορέα", coordinator: "Συντονιστής" },
    caseStatus: {
      draft: "Προσχέδιο",
      in_progress: "Σε εξέλιξη",
      under_review: "Υπό αξιολόγηση",
      approved: "Εγκεκριμένο",
      completed: "Ολοκληρωμένο",
    },
    sequenceLabel: "Ακολουθία παρεμβάσεων",
    synergiesHint: "Συνέργειες, εξαρτήσεις, συμβιβασμοί, ζητήματα ακολουθίας…",
    editPathway: "Επεξεργασία",
    editPathwayTitle: "Επεξεργασία διαδρομής",
    moveUp: "Πάνω",
    moveDown: "Κάτω",
    sequenceHint: "Η σειρά ορίζει την ακολουθία υλοποίησης.",
    noOptionsSelected: "Δεν έχει επιλεγεί κανένα μέτρο ακόμη.",
    noPathwaysShort: "Δεν έχουν προταθεί ακόμη διαδρομές.",
    pathwayOptionsIncluded: "Περιλαμβάνει",
    curatorOnlyNote: "Μόνο ο συντονιστής της μελέτης ή διαχειριστές μπορούν να το κάνουν αυτό.",
    close: "Κλείσιμο",
    stepNotStarted: "Δεν έχει ξεκινήσει",
    stepActive: "Ενεργό",
    stepClosed: "Έκλεισε",
    openActivity: "Άνοιγμα δραστηριότητας",
    closeActivity: "Κλείσιμο συνεισφορών",
    buildOn: "Χτίστε πάνω σε αυτό",
    buildOnTitle: "Χτίστε πάνω σε μια πρόταση",
    suggestAlternative: "Προτείνετε εναλλακτική",
    suggestAlternativeTitle: "Προτείνετε μια εναλλακτική",
    buildingOnPrefix: "Πάνω στην πρόταση",
    alternativeToPrefix: "Εναλλακτική στην πρόταση",
    edit: "Επεξεργασία",
    delete: "Διαγραφή",
    deleteConfirm: "Διαγραφή αυτής της συνεισφοράς; Η ενέργεια δεν αναιρείται.",
    deleted: "Η συνεισφορά διαγράφηκε.",
    groupAction: "Ομαδοποίηση",
    groupPrompt: "Ετικέτα ομάδας (κενό για αφαίρεση):",
    readyForPathway: "Έτοιμο για σχεδιασμό διαδρομής",
    notReadyForPathway: "Αφαίρεση ετοιμότητας",
    moreActions: "Περισσότερες ενέργειες",
    contributionAdded: "Η συνεισφορά προστέθηκε με επιτυχία",
    contributionUpdated: "Η συνεισφορά ενημερώθηκε.",
    editFutureTitle: "Επεξεργασία πιθανού μέλλοντος",
    commentPosted: "Το σχόλιο δημοσιεύτηκε",
    youAgree: "✓ Συμφωνείτε",
    youDisagree: "✓ Διαφωνείτε",
    mergedSummary: (n) => `Συνδυάστηκε με ${n} άλλη πρόταση`,
    measureAssessment: "Αξιολόγηση μέτρου",
    baselineImpactLabel: "Κλιματική επίπτωση",
    baselineContextLabel: "Πλαίσιο",
    baselineVulnerabilities: "Τρωτότητες",
    baselineAffectedAssets: "Επηρεαζόμενος πληθυσμός & υποδομές",
    baselineRccapMeasures: "Σχετικά μέτρα ΠεΣΠΚΑ",
    baselineReadOnlyNote:
      "Η Φάση 1 συγκεντρώνει όσα ήδη γνωρίζουμε από το ΠεΣΠΚΑ — δεν χρειάζεται νέα αξιολόγηση κινδύνου εδώ. Σχολιάστε παρακάτω ό,τι λείπει.",
    baselinePurpose: "Κατανοήστε πού βρισκόμαστε σήμερα και διαμορφώστε μια κοινή, τεκμηριωμένη βάση για την πρόκληση.",
    downloadBaselinePdf: "Λήψη αναφοράς Φάσης 1 (PDF)",
    baselineCommentsTitle: "Σχόλια & παρατηρήσεις",
    baselineCommentPlaceholder: "Προσθέστε ένα σχόλιο ή σημειώστε κάτι που λείπει...",
    tocCommentsTitle: "Σχόλια & προτάσεις για τη Θεωρία Αλλαγής",
    tocCommentPlaceholder: "Σχολιάστε ή προτείνετε μια αλλαγή στη Θεωρία Αλλαγής...",
    markAsSuggestion: "Αυτό είναι πρόταση προσθήκης",
    accept: "Αποδοχή",
    reject: "Απόρριψη",
    suggestionAccepted: "Αποδεκτό",
    suggestionRejected: "Απορρίφθηκε",
  },
  en: {
    tabLabel: "Co-creation",
    goToWorkshop: "Go to Workshop",
    visionEmptyTitle: "The Shared Vision has not been co-created yet",
    visionEmptyDesc: "The Shared Vision will be presented here once it has been co-created through the stakeholder workshop and submitted for review.",
    tocEmptyTitle: "The Theory of Change has not been developed yet",
    tocEmptyDesc: "The coordinator/admin will add an image and a description here.",
    tocImageLabel: "Image",
    tocImageAlt: "Theory of Change diagram",
    tocDiscussionTitle: "Discussion",
    optionsEmptyTitle: "No adaptation options have been identified yet",
    optionsEmptyDesc: "Adaptation options are identified collaboratively from the validated Shared Vision. Go to the workshop to capture them.",
    futuresWorkshopEmpty: "There are no Possible Futures co-created yet. Please go to the workshop to create them.",
    futuresWorkshopInProgress: "Possible Futures will appear here once the co-creation workshop is complete.",
    addFutureHere: "Add possible future",
    addVisionHere: "Add a shared vision",
    newVisionTitle: "New shared vision",
    editVisionTitle: "Edit shared vision",
    stepBaseline: "Understand the Challenge",
    stepPrioritisation: "Prioritisation",
    stepFutures: "Explore Possible Futures",
    stepVision: "Shared Vision",
    stepToC: "Theory of Change",
    stepOptions: "Adaptation Options",
    stepPathways: "Design Portfolio of Interventions",
    stepImplementation: "Implementation",
    stepCompare: "Compare & prioritise",
    stepOutcome: "Preferred / combined pathway",
    p2rPhase1: "Phase 1 · Prepare the Ground",
    p2rPhase2: "Phase 2 · Build a Shared Vision",
    p2rPhase3: "Phase 3 · Design Pathways",
    phaseCompleted: "Completed",
    phaseCurrent: "Current",
    phaseUpcoming: "Upcoming",
    phaseLocked: "Locked",
    journeyTitle: "Resilience Journey",
    journeyIntro: "One journey for this Climate Impact, organised through the three P2R phases.",
    phase1Question: "Understand the challenge",
    phase1Summary: "Review the shared evidence baseline before co-creation begins.",
    phase2Question: "Shape a transformative future",
    phase2Summary: "Shape alternative futures, a shared vision and the changes needed to reach it.",
    phase3Question: "Design pathways for transformation",
    phase3Summary: "Design, compare and agree the adaptation pathways.",
    phaseLockedExplanation: "Complete the Shared Vision phase before continuing to Pathway Design.",
    phaseStatusLabel: "Phase status",
    phaseForum: (n) => `Phase ${n} Forum`,
    forumIntro: "This discussion remains associated only with this phase.",
    forumEmpty: "There are no comments in this phase yet.",
    forumPlaceholder: "Add a comment to this phase discussion...",
    forumReplyPlaceholder: "Write a reply...",
    replyAction: "Reply",
    forumSubmit: "Post comment",
    forumUpvote: "Agree",
    forumDownvote: "Disagree",
    forumVoteUpdated: "Your vote was updated.",
    prioritisationTitle: "Rank the possible futures",
    prioritisationIntro: "Drag to rank the possible futures by how important they are to you. Only the final order counts. The result carries into Step 2 — Shared Vision.",
    prioritisationResultTitle: "How others ranked it",
    prioritisationResultEmpty: "Nobody has ranked yet. The result will appear here as soon as the first ranking is submitted.",
    prioritisationParticipation: (n) => `${n} participant${n === 1 ? "" : "s"} have ranked · share who placed it #1`,
    prioritisationLeads: (title) => `Leading: ${title}`,
    prioritisationFeeds: "This result carries into Step 2 — Shared Vision.",
    prioritisationMoveUp: "Move up",
    prioritisationMoveDown: "Move down",
    interactionsTitle: "Three different actions",
    interactionVote: "Vote (agree / disagree)",
    interactionVoteDesc: "Your reaction to one specific contribution.",
    interactionPriority: "Prioritisation",
    interactionPriorityDesc: "Your relative preference among the alternatives — a full ranking.",
    interactionValidation: "Validation",
    interactionValidationDesc: "Formal confirmation by the coordinator: Draft → In Review → Validated.",
    prioritisationSubmit: "Save ranking",
    prioritisationUpdate: "Update ranking",
    prioritisationSubmitted: "Your ranking was submitted.",
    prioritisationSaved: "Your ranking has been saved.",
    prioritisationEmpty: "At least one Possible Future is needed before prioritisation.",
    noFuturesShort: "No alternative futures proposed yet.",
    newOption: "New adaptation option",
    newOptionTitle: "New adaptation option",
    noOptions: "No adaptation options proposed yet.",
    coBenefitsLabel: "Co-benefits",
    maladaptationRisksLabel: "Maladaptation risks",
    timeHorizonLabel: "Time horizon (e.g. 2050)",
    selectOptionsLabel: "Adaptation options included",
    dependenciesLabel: "Dependencies",
    opportunitiesLabel: "Opportunities",
    ctxPrimarySystem: "Primary system",
    ctxImpact: "Climate impact",
    ctxPressures: "Climate pressures",
    ctxLinkedSystems: "Linked systems",
    ctxArea: "Area",
    ctxCoordinator: "Coordinator",
    ctxPhase: "Current phase",
    ctxStatus: "Status",
    addEnglishTranslation: "Add English translation (optional)",
    addGreekTranslation: "Add Greek translation (optional)",
    justNow: "just now",
    minutesAgo: (n) => `${n} min ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
    memberRole: { user: "Participant", representative: "Organisation representative", coordinator: "Coordinator" },
    caseStatus: {
      draft: "Draft",
      in_progress: "In progress",
      under_review: "Under review",
      approved: "Approved",
      completed: "Completed",
    },
    sequenceLabel: "Sequence of interventions",
    synergiesHint: "Synergies, dependencies, trade-offs, sequencing issues…",
    editPathway: "Edit",
    editPathwayTitle: "Edit pathway",
    moveUp: "Up",
    moveDown: "Down",
    sequenceHint: "The order defines the implementation sequence.",
    noOptionsSelected: "No measures selected yet.",
    noPathwaysShort: "No pathways proposed yet.",
    pathwayOptionsIncluded: "Includes",
    curatorOnlyNote: "Only the case's coordinator or an admin can do this.",
    close: "Close",
    stepNotStarted: "Not started",
    stepActive: "Active",
    stepClosed: "Closed",
    openActivity: "Open this activity",
    closeActivity: "Close contribution period",
    buildOn: "Build on this",
    buildOnTitle: "Build on a proposal",
    suggestAlternative: "Suggest alternative",
    suggestAlternativeTitle: "Suggest an alternative",
    buildingOnPrefix: "Building on",
    alternativeToPrefix: "Alternative to",
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: "Delete this contribution? This cannot be undone.",
    deleted: "The contribution was deleted.",
    groupAction: "Group",
    groupPrompt: "Group label (leave empty to remove):",
    readyForPathway: "Ready for pathway design",
    notReadyForPathway: "Remove readiness",
    moreActions: "More actions",
    contributionAdded: "Contribution added successfully",
    contributionUpdated: "Contribution updated.",
    editFutureTitle: "Edit possible future",
    commentPosted: "Comment posted",
    youAgree: "✓ You agree",
    youDisagree: "✓ You disagree",
    mergedSummary: (n) => `Combined with ${n} other contribution${n === 1 ? "" : "s"}`,
    measureAssessment: "Measure assessment",
    baselineImpactLabel: "Climate impact",
    baselineContextLabel: "Context",
    baselineVulnerabilities: "Vulnerabilities",
    baselineAffectedAssets: "Affected population & assets",
    baselineRccapMeasures: "Relevant RCCAP measures",
    baselineReadOnlyNote:
      "Phase 1 gathers what the RCCAP already tells us — no new risk assessment is needed here. Comment below on anything missing.",
    baselinePurpose: "Understand where we are now and establish a common, evidence-based baseline for the challenge.",
    downloadBaselinePdf: "Download Phase 1 Report (PDF)",
    baselineCommentsTitle: "Comments & observations",
    baselineCommentPlaceholder: "Add a comment, or flag something that should be considered...",
    tocCommentsTitle: "Comments & suggestions on the Theory of Change",
    tocCommentPlaceholder: "Comment on, or suggest a change to, the Theory of Change...",
    markAsSuggestion: "This is a suggested addition",
    accept: "Accept",
    reject: "Reject",
    suggestionAccepted: "Accepted",
    suggestionRejected: "Rejected",
  },
};

// Phase 3, Tab 1's own copy — kept separate from T2 since it's a large,
// self-contained vocabulary (Identify vs Assess, PESPKA evidence fields,
// the four assessment criteria) that nothing else in this file shares.
const P3 = {
  el: {
    identifyStep: "Εντοπισμός",
    assessStep: "Αξιολόγηση",
    coreQuestion: "Τι θα μπορούσαμε πραγματικά να κάνουμε για να πετύχουμε τις αλλαγές που εντοπίστηκαν στη Θεωρία Αλλαγής;",
    identifyQuestion: "Για τις αλλαγές που εντοπίστηκαν στη Θεωρία Αλλαγής, ποιες παρεμβάσεις θα μπορούσαν να βοηθήσουν;",
    assessQuestion: "Πόσο ισχυρή είναι αυτή η επιλογή;",
    sourcePespka: "Υφιστάμενο μέτρο (ΠΕΣΠΚΑ)",
    sourceStakeholder: "Πρόταση εμπλεκόμενου φορέα",
    timeHorizonShort: "Βραχυπρόθεσμο",
    timeHorizonLong: "Μακροπρόθεσμο",
    timeHorizonFieldLabel: "Χρονικός ορίζοντας",
    moreInformation: "Περισσότερες πληροφορίες",
    addNewOption: "Προσθήκη νέας επιλογής προσαρμογής",
    newOptionModalTitle: "Νέα επιλογή προσαρμογής",
    identifyEmptyTitle: "Δεν έχουν εντοπιστεί ακόμη επιλογές προσαρμογής",
    identifyEmptyDesc: "Καταγράψτε υφιστάμενα μέτρα ή προτείνετε νέα για να ξεκινήσει ο εντοπισμός.",
    assessEmptyTitle: "Δεν έχουν προστεθεί ακόμη επιλογές προσαρμογής",
    assessEmptyDesc: "Προσθέστε επιλογές στο βήμα Εντοπισμού για να ξεκινήσει η δομημένη αξιολόγησή τους.",
    evidenceFromPespka: "Στοιχεία από το ΠΕΣΠΚΑ",
    referenceEvidenceNote: "Τα στοιχεία αναφοράς είναι μόνο για ανάγνωση.",
    pespkaCode: "Κωδικός ΠΕΣΠΚΑ",
    pespkaSector: "Τομέας",
    pespkaInterventionType: "Τύπος παρέμβασης",
    pespkaProposedPeriod: "Προτεινόμενη περίοδος υλοποίησης",
    pespkaImplementingAuthority: "Φορέας υλοποίησης",
    pespkaEstimatedCost: "Εκτιμώμενο κόστος",
    pespkaEffectiveness: "Αξιολόγηση αποτελεσματικότητας (ΠΕΣΠΚΑ)",
    pespkaCostEffectiveness: "Σχέση κόστους-αποτελεσματικότητας",
    pespkaEconomicBenefit: "Οικονομικό όφελος",
    pespkaEnvironmentalBenefit: "Περιβαλλοντικό όφελος",
    pespkaSocialBenefit: "Κοινωνικό όφελος",
    pespkaSynergies: "Συνέργειες με άλλες περιφερειακές πολιτικές",
    pespkaSourceLabel: "Πηγή",
    stakeholderAssessmentTitle: "Αξιολόγηση εμπλεκόμενων φορέων",
    noAssessmentYet: "Δεν υπάρχει ακόμη αξιολόγηση από εμπλεκόμενους φορείς.",
    yourAssessment: "Η δική σας αξιολόγηση",
    collectiveAssessment: "Συλλογική αξιολόγηση",
    assessmentCount: (n) => `${n} ${n === 1 ? "αξιολόγηση" : "αξιολογήσεις"}`,
    effectivenessLabel: "Αποτελεσματικότητα",
    effectivenessQuestion: "Πόσο ισχυρά θα μπορούσε αυτή η παρέμβαση να συμβάλει στην επιθυμητή αλλαγή;",
    feasibilityLabel: "Εφικτότητα",
    feasibilityQuestion: "Πόσο ρεαλιστική είναι η υλοποίηση με βάση τις τρέχουσες θεσμικές, τεχνικές και οικονομικές συνθήκες;",
    coBenefitsLabel: "Συνοφέλη",
    coBenefitsQuestion: "Θα μπορούσε αυτή η παρέμβαση να παράξει επιπλέον περιβαλλοντικά, κοινωνικά ή οικονομικά οφέλη;",
    transformativeLabel: "Μετασχηματιστικό δυναμικό",
    transformativeQuestion: "Θα μπορούσε αυτή η παρέμβαση να συμβάλει σε βαθύτερη, συστημική αλλαγή και όχι μόνο στη μείωση του σημερινού κινδύνου;",
    robustLabel: "Ανθεκτική σε διαφορετικά μέλλοντα;",
    robustQuestion: "Θα παρέμενε χρήσιμη αυτή η επιλογή κάτω από διαφορετικά πιθανά μέλλοντα;",
    robustMost: "Ναι, στα περισσότερα μέλλοντα",
    robustSome: "Μόνο σε ορισμένα μέλλοντα",
    robustDependent: "Εξαρτάται σε μεγάλο βαθμό από το μέλλον",
    levelLow: "Χαμηλή",
    levelMedium: "Μεσαία",
    levelHigh: "Υψηλή",
    assessmentCommentLabel: "Γιατί δώσατε αυτή την αξιολόγηση;",
    submitAssessment: "Υποβολή αξιολόγησης",
    assessmentSaved: "Η αξιολόγησή σας αποθηκεύτηκε.",
    prioritisedTitle: "Αυτόματη ιεράρχηση",
    prioritisedIntro: "Οι αξιολογημένες επιλογές κατατάσσονται αυτόματα με βάση τη συλλογική αξιολόγηση των εμπλεκόμενων φορέων.",
    priorityRank: (n) => `Προτεραιότητα #${n}`,
    overallAssessment: "Συνολική αξιολόγηση",
    strongestAreas: "Ισχυρότερα σημεία",
    noAssessedYet: "Καμία επιλογή δεν έχει αξιολογηθεί ακόμη.",
    portfolioQuestion: "Ποιος συνδυασμός παρεμβάσεων θα μπορούσε να λειτουργήσει μαζί για να επιφέρει τις επιθυμητές αλλαγές;",
    categoryLabel: "Κατηγορία παρέμβασης",
    categories: {
      knowledge: "Γνώση & Τεκμηρίωση",
      planning: "Σχεδιασμός",
      capacity: "Ανάπτυξη ικανοτήτων",
      governance: "Διακυβέρνηση",
      nature_based: "Παρέμβαση βασισμένη στη φύση",
      infrastructure: "Υποδομή / Φυσικός μετασχηματισμός",
      behavioural: "Συμπεριφορική / Κοινωνική παρέμβαση",
    },
    formulateStep: "Διαμόρφωση διαδρομών",
    evaluateStep: "Αξιολόγηση διαδρομών",
    evaluateMatrixTitle: "Πίνακας σύγκρισης",
    rankingStep: "Κατάταξη διαδρομών",
    formulateQuestion: "Ποιος συνδυασμός παρεμβάσεων θα μπορούσε να λειτουργήσει μαζί για να επιφέρει τις επιθυμητές αλλαγές;",
    evaluateQuestion: "Πόσο ισχυρή είναι κάθε διαδρομή σε σύγκριση με τις υπόλοιπες;",
    riskReductionLabel: "Μείωση κινδύνου",
    costLabel: "Κόστος",
    flexibilityLabel: "Ευελιξία",
    pathwayEvaluationCount: (n) => `${n} ${n === 1 ? "αξιολόγηση" : "αξιολογήσεις"}`,
    submitEvaluation: "Υποβολή αξιολόγησης",
    evaluationSaved: "Η αξιολόγησή σας αποθηκεύτηκε.",
    pathwayRankingTitle: "Αυτόματη κατάταξη διαδρομών",
    noEvaluatedYet: "Καμία διαδρομή δεν έχει αξιολογηθεί ακόμη.",
    rankingIntro: "Αυτόματη κατάταξη με βάση τις βαθμολογίες από το βήμα «Αξιολόγηση διαδρομών». Ενημερώνεται αυτόματα όταν αλλάζουν οι αξιολογήσεις.",
    rankingScoreLabel: "Συνολική βαθμολογία",
    rankingStrengths: "Ισχυρά σημεία",
    rankingWeaknesses: "Αδυναμίες",
    rankingTopBadge: "Κορυφαία επιλογή",
    timeHorizonMedium: "Μεσοπρόθεσμο",
    pathwayTimelineLabel: "Χρονική διάταξη μέτρων",
    noPathwaysYetForEvaluation: "Δημιουργήστε πρώτα μια διαδρομή στο βήμα «Διαμόρφωση διαδρομών».",
    noPrioritisedOptionsYet: "Δεν υπάρχουν ακόμη ιεραρχημένες επιλογές προσαρμογής — ολοκληρώστε πρώτα το βήμα Αξιολόγησης στο Tab 1.",
  },
  en: {
    identifyStep: "Identify",
    assessStep: "Assess",
    coreQuestion: "What could we actually do to achieve the changes identified in the Theory of Change?",
    identifyQuestion: "For the changes identified in the Theory of Change, what interventions could help?",
    assessQuestion: "How strong is this option?",
    sourcePespka: "Existing measure (PESPKA)",
    sourceStakeholder: "Stakeholder-proposed",
    timeHorizonShort: "Short-term",
    timeHorizonLong: "Long-term",
    timeHorizonFieldLabel: "Time horizon",
    moreInformation: "More information",
    addNewOption: "Add a new adaptation option",
    newOptionModalTitle: "New adaptation option",
    identifyEmptyTitle: "No adaptation options identified yet",
    identifyEmptyDesc: "Record existing measures or propose new ones to start identifying options.",
    assessEmptyTitle: "No adaptation options have been added yet",
    assessEmptyDesc: "Add options in the Identify step to start their structured assessment.",
    evidenceFromPespka: "Evidence from PESPKA",
    referenceEvidenceNote: "Reference evidence is read-only.",
    pespkaCode: "PESPKA code",
    pespkaSector: "Sector",
    pespkaInterventionType: "Intervention type",
    pespkaProposedPeriod: "Proposed implementation period",
    pespkaImplementingAuthority: "Implementing authority",
    pespkaEstimatedCost: "Estimated cost",
    pespkaEffectiveness: "PESPKA effectiveness assessment",
    pespkaCostEffectiveness: "Cost-effectiveness",
    pespkaEconomicBenefit: "Economic benefit",
    pespkaEnvironmentalBenefit: "Environmental benefit",
    pespkaSocialBenefit: "Social benefit",
    pespkaSynergies: "Synergies with other regional policies",
    pespkaSourceLabel: "Source",
    stakeholderAssessmentTitle: "Stakeholder Assessment",
    noAssessmentYet: "No stakeholder assessment yet.",
    yourAssessment: "Your assessment",
    collectiveAssessment: "Collective stakeholder assessment",
    assessmentCount: (n) => `${n} assessment${n === 1 ? "" : "s"}`,
    effectivenessLabel: "Effectiveness",
    effectivenessQuestion: "How strongly could this intervention contribute to the desired change?",
    feasibilityLabel: "Feasibility",
    feasibilityQuestion: "How realistic is implementation given current institutional, technical and financial conditions?",
    coBenefitsLabel: "Co-benefits",
    coBenefitsQuestion: "Could this intervention generate additional environmental, social or economic benefits?",
    transformativeLabel: "Transformative Potential",
    transformativeQuestion: "Could this intervention contribute to deeper, systemic change rather than only reducing today's risk?",
    robustLabel: "Robust across futures?",
    robustQuestion: "Would this option remain useful under different possible futures?",
    robustMost: "Yes, across most futures",
    robustSome: "Only under some futures",
    robustDependent: "Highly future-dependent",
    levelLow: "Low",
    levelMedium: "Medium",
    levelHigh: "High",
    assessmentCommentLabel: "Why did you give this assessment?",
    submitAssessment: "Submit assessment",
    assessmentSaved: "Your assessment was saved.",
    prioritisedTitle: "Automatic prioritisation",
    prioritisedIntro: "Assessed options are ranked automatically from the collective stakeholder assessment.",
    priorityRank: (n) => `Priority #${n}`,
    overallAssessment: "Overall assessment",
    strongestAreas: "Strongest areas",
    noAssessedYet: "No option has been assessed yet.",
    portfolioQuestion: "Which combination of interventions could work together to deliver the desired changes?",
    categoryLabel: "Intervention category",
    categories: {
      knowledge: "Knowledge & Evidence",
      planning: "Planning",
      capacity: "Capacity Building",
      governance: "Governance",
      nature_based: "Nature-based Intervention",
      infrastructure: "Infrastructure / Physical Transformation",
      behavioural: "Behavioural / Social Intervention",
    },
    formulateStep: "Formulate Adaptation Pathways",
    evaluateStep: "Evaluate Pathways",
    evaluateMatrixTitle: "Comparison matrix",
    rankingStep: "Pathway Ranking",
    formulateQuestion: "Which combination of interventions could work together to deliver the desired changes?",
    evaluateQuestion: "How strong is each pathway compared to the others?",
    riskReductionLabel: "Risk reduction",
    costLabel: "Cost",
    flexibilityLabel: "Flexibility",
    pathwayEvaluationCount: (n) => `${n} evaluation${n === 1 ? "" : "s"}`,
    submitEvaluation: "Submit evaluation",
    evaluationSaved: "Your evaluation was saved.",
    pathwayRankingTitle: "Automatic pathway ranking",
    noEvaluatedYet: "No pathway has been evaluated yet.",
    rankingIntro: "Automatic ranking based on the scores from the Evaluate Pathways step. Updates automatically whenever the evaluations change.",
    rankingScoreLabel: "Overall score",
    rankingStrengths: "Strengths",
    rankingWeaknesses: "Weaknesses",
    rankingTopBadge: "Top-ranked",
    timeHorizonMedium: "Medium-term",
    pathwayTimelineLabel: "Timeline of measures",
    noPathwaysYetForEvaluation: "Create a pathway in the Formulate Adaptation Pathways step first.",
    noPrioritisedOptionsYet: "No prioritised adaptation options yet — complete the Assess step in Tab 1 first.",
  },
};

let activeStep = "baseline";
let activePhase = "phase1";
let cachedCuratorFor = null;
let cachedIsCurator = false;

async function isCaseCurator(caseId, user) {
  if (!user) return false;
  if (user.platformRole === "admin") return true;
  if (cachedCuratorFor === caseId) return cachedIsCurator;
  try {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/members`);
    const self = data.items.find((m) => m.user_id === user.id);
    cachedCuratorFor = caseId;
    cachedIsCurator = self?.role === "coordinator" || self?.role === "representative";
    return cachedIsCurator;
  } catch {
    return false;
  }
}


// The P2R journey's single entry point, called from systems-explorer.js's
// Impact detail panel with a plain container it owns -- no native-bundle
// DOM patching needed here at all, since that page is already ours.
let lastJourneyKey = null;
export async function renderCaseJourney(container, caseId, lang, options = {}) {
  const requestedPhase = options.phase || null;
  const key = `${caseId}:${lang}:${requestedPhase || "default"}:${options.compact ? "compact" : "full"}`;
  if (key !== lastJourneyKey) {
    lastJourneyKey = key;
    activePhase = requestedPhase || "phase1";
    activeStep = PHASES.find((phase) => phase.key === activePhase)?.steps[0] || "baseline";
    cachedCuratorFor = null;
  }
  container.classList.add("case-workspace-pane");
  container.classList.toggle("case-workspace-compact", Boolean(options.compact));
  await renderWorkspace(caseId, container, lang, options);
}

// The Coordinator "opens"/"closes" each step as a live activity;
// Participants see what's currently active rather than every step being
// equally "on" (spec: "Understand that Alternative Futures is currently
// active"). Baseline is never gated -- it's read/comment-only, not a
// step that gets activated.
// Lucide "plus", matching the stroke style of the bundle's own icons.
const PLUS_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>`;

// Prefixes a create button with the plus glyph without disturbing its
// text node, so language switches keep working.
function withPlusIcon(button) {
  button.classList.add("btn-with-icon");
  button.insertAdjacentHTML("afterbegin", PLUS_SVG);
  return button;
}
function buildPhaseBadge(t2, status) {
  const labelByStatus = { completed: t2.phaseCompleted, current: t2.phaseCurrent, upcoming: t2.phaseUpcoming, locked: t2.phaseLocked };
  const iconByStatus = { completed: "✓", current: "●", upcoming: "○", locked: "🔒" };
  const badge = el("span", `case-phase-badge case-phase-badge-${status}`, `${iconByStatus[status]} ${labelByStatus[status]}`);
  return badge;
}

// The journey doc's core UI rule: never show every P2R tool at once. The
// user picks a phase from this strip ("P2R Journey": Phase 1 done, Phase 2
// current, Phase 3 upcoming) and the sub-tab row below it is filtered down
// to just that phase's own steps.
async function renderWorkspace(caseId, pane, lang, options = {}) {
  const t2 = T2[lang];
  pane.innerHTML =
    `<section class="case-journey-header"><h2></h2><p></p><div class="case-workspace-phases"></div></section>` +
    `<div class="case-tabs case-workspace-steps"></div><div class="case-workspace-step-content"></div>`;
  pane.querySelector(".case-journey-header h2").textContent = t2.journeyTitle;
  pane.querySelector(".case-journey-header p").textContent = t2.journeyIntro;
  const phasesBar = pane.querySelector(".case-workspace-phases");
  const stepsBar = pane.querySelector(".case-workspace-steps");
  const content = pane.querySelector(".case-workspace-step-content");
  const labels = {
    baseline: t2.stepBaseline,
    futures: t2.stepFutures,
    vision: t2.stepVision,
    toc: t2.stepToC,
    prioritisation: t2.stepPrioritisation,
    options: t2.stepOptions,
    pathways: t2.stepPathways,
    compare: t2.stepCompare,
    outcome: t2.stepOutcome,
    implementation: t2.stepImplementation,
  };
  const t = T[lang];
  const user = await getCurrentUser();
  const curator = await isCaseCurator(caseId, user);
  const phaseData = await api(`/cases/${encodeURIComponent(caseId)}/phases`);
  let workflowStepData = { items: [] };
  try {
    workflowStepData = await api(`/cases/${encodeURIComponent(caseId)}/steps`);
  } catch {
    // Older/offline API adapters may not expose step state. The journey still
    // works, while the real backend remains the source of truth when present.
  }
  const statusByPhase = Object.fromEntries(phaseData.items.map((item) => [item.phase, item.status]));
  const statusByStep = Object.fromEntries((workflowStepData.items || []).map((item) => [item.step, item.status]));
  activePhase = phaseOfStep(activeStep);
  if (statusByPhase[activePhase] === "locked") {
    activePhase = phaseData.items.find((item) => item.status === "current")?.phase || "phase1";
    activeStep = PHASES.find((phase) => phase.key === activePhase)?.steps[0] || "baseline";
  }

  pane.querySelector(".case-journey-header").hidden = Boolean(options.compact);
  PHASES.forEach((phase) => {
    const state = statusByPhase[phase.key] || (phase.key === "phase3" ? "locked" : "upcoming");
    const card = el("article", `case-journey-phase-card case-journey-phase-${state}`);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "case-journey-phase-open";
    const phaseNumber = PHASES.indexOf(phase) + 1;
    const head = el("span", "case-journey-phase-head");
    head.append(el("span", "case-journey-phase-number", String(phaseNumber)));
    head.append(el("span", "case-journey-phase-label", t2[phase.labelKey]));
    head.append(buildPhaseBadge(t2, state));
    const question = el("strong", "case-journey-phase-question", t2[`${phase.key}Question`]);
    const summary = el("span", "case-journey-phase-summary", t2[`${phase.key}Summary`]);
    btn.append(head, question, summary);
    if (state === "locked") btn.append(el("span", "case-phase-lock-note", t2.phaseLockedExplanation));
    btn.classList.toggle("active", phase.key === activePhase);
    btn.disabled = state === "locked";
    if (state === "locked") btn.title = t2.phaseLockedExplanation;
    btn.addEventListener("click", () => {
      activePhase = phase.key;
      activeStep = phase.steps[0];
      renderWorkspace(caseId, pane, lang, options);
    });
    card.append(btn);
    if (phaseData.canManage) {
      const label = el("label", "case-phase-status-control");
      label.append(el("span", null, t2.phaseStatusLabel));
      const select = document.createElement("select");
      [
        ["locked", t2.phaseLocked],
        ["upcoming", t2.phaseUpcoming],
        ["current", t2.phaseCurrent],
        ["completed", t2.phaseCompleted],
      ].forEach(([value, copy]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = copy;
        option.selected = value === state;
        select.append(option);
      });
      select.addEventListener("change", async () => {
        try {
          await api(`/cases/${encodeURIComponent(caseId)}/phases/${phase.key}`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value }),
          });
          showToast({ type: "success", title: t2.phaseStatusLabel });
          await renderWorkspace(caseId, pane, lang, options);
        } catch (error) {
          select.value = state;
          showToast({ type: "error", title: t.createdError, message: error.message });
        }
      });
      label.append(select);
      card.append(label);
    }
    phasesBar.append(card);
  });

  const visibleSteps = PHASES.find((p) => p.key === activePhase).steps;
  // Phase 1 contains a single baseline view, so a second strip with one
  // "Understand the Challenge" tab adds no choice. Keep step tabs for Phases
  // 2 and 3, where they are still needed to navigate multiple activities.
  stepsBar.hidden = activePhase === "phase1";
  stepsBar.setAttribute("role", "tablist");
  const stepButtons = [];
  visibleSteps.forEach((step) => {
    const state = statusByStep[step] || (step === visibleSteps[0] ? "active" : "not_started");
    const stepCard = el("div", `case-step-card${curator ? " case-step-card-manage" : ""}`);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.dataset.step = step;
    const group = el("span", "case-step-group");
    group.append(
      el("span", "case-step-sequence", String(visibleSteps.indexOf(step) + 1)),
      el("span", "case-step-label", labels[step])
    );
    btn.append(group);
    // "Active" would only repeat what the selected tab already shows. A step
    // that is finished, or not yet open, is different information, so those
    // two keep their badge.
    if (state !== "active") {
      const stateLabel = state === "closed"
        ? (lang === "el" ? "Ολοκληρώθηκε" : "Completed")
        : (lang === "el" ? "Επόμενο" : "Upcoming");
      btn.append(el("span", `case-step-state case-step-state-${state}`, stateLabel));
    }
    btn.classList.toggle("active", step === activeStep);
    btn.setAttribute("aria-selected", step === activeStep ? "true" : "false");
    btn.disabled = !curator && state === "not_started";
    if (btn.disabled) btn.title = lang === "el" ? "Το προηγούμενο βήμα πρέπει πρώτα να ολοκληρωθεί." : "Complete the previous step first.";
    // Only the selected tab is in the tab order; the arrow keys move between
    // them, which is what a tablist is expected to do.
    btn.tabIndex = step === activeStep ? 0 : -1;
    btn.addEventListener("click", () => selectStep(step));
    btn.addEventListener("keydown", (event) => {
      const usable = stepButtons.filter((candidate) => !candidate.disabled);
      const index = usable.indexOf(btn);
      if (index < 0) return;
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = usable[(index + 1) % usable.length];
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = usable[(index - 1 + usable.length) % usable.length];
      else if (event.key === "Home") next = usable[0];
      else if (event.key === "End") next = usable[usable.length - 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
      selectStep(next.dataset.step);
    });
    stepButtons.push(btn);
    stepCard.append(btn);

    if (curator) {
      const control = el("label", "case-step-status-control");
      const controlText = lang === "el" ? `Κατάσταση: ${labels[step]}` : `Status: ${labels[step]}`;
      const select = document.createElement("select");
      select.setAttribute("aria-label", controlText);
      [
        ["not_started", lang === "el" ? "Επόμενο" : "Upcoming"],
        ["active", lang === "el" ? "Ενεργό" : "Active"],
        ["closed", lang === "el" ? "Ολοκληρώθηκε" : "Completed"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === state;
        select.append(option);
      });
      select.addEventListener("click", (event) => event.stopPropagation());
      select.addEventListener("change", async () => {
        select.disabled = true;
        try {
          await api(`/cases/${encodeURIComponent(caseId)}/steps/${step}`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value }),
          });
          showToast({ type: "success", title: lang === "el" ? "Η κατάσταση ενημερώθηκε" : "Status updated" });
          await renderWorkspace(caseId, pane, lang, options);
        } catch (error) {
          select.value = state;
          select.disabled = false;
          showToast({ type: "error", title: t.createdError, message: error.message });
        }
      });
      control.append(select);
      stepCard.append(control);
    }
    stepsBar.append(stepCard);
  });

  // Switching step used to re-render the entire workspace -- phase cards,
  // tab strip and all -- which threw the content away, showed a spinner and
  // let the pane collapse to nothing before the new panel arrived. Only the
  // panel actually changes, so only the panel is rebuilt, and the pane holds
  // its previous height until the new content is in place so the page does
  // not jump under the pointer.
  function selectStep(step) {
    if (step === activeStep) return;
    activeStep = step;
    stepButtons.forEach((button) => {
      const selected = button.dataset.step === step;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
    const previousHeight = content.getBoundingClientRect().height;
    content.style.minHeight = `${Math.round(previousHeight)}px`;
    content.classList.add("case-step-switching");
    renderStepBody().finally(() => {
      content.classList.remove("case-step-switching");
      // Release the reservation on the next frame, after the new panel has
      // been laid out, so the height animates instead of snapping.
      requestAnimationFrame(() => {
        content.style.minHeight = "";
      });
    });
  }

  async function renderStepBody() {
  content.innerHTML = "";
  const stepBody = el("div", "case-step-body");
  stepBody.setAttribute("role", "tabpanel");
  stepBody.innerHTML = `<p class="systems-explorer-loading">…</p>`;
  content.append(stepBody);

  try {
    if (activeStep === "baseline") await renderBaseline(stepBody, lang, t, t2, caseId);
    else if (activeStep === "futures") {
      await renderFutures(stepBody, lang, t, t2, caseId, user, curator);
      await renderPrioritisation(stepBody, lang, t, t2, caseId, { append: true });
      appendAffineCta(stepBody, lang, "futures");
    }
    else if (activeStep === "vision") {
      await renderVision(stepBody, lang, t, t2, caseId, user, curator);
      appendAffineCta(stepBody, lang, "vision");
    }
    else if (activeStep === "toc") {
      await renderToC(stepBody, lang, t, t2, caseId, curator);
      appendAffineCta(stepBody, lang, "toc");
    }
    else if (activeStep === "options") await renderOptions(stepBody, lang, t, t2, caseId, user, curator);
    // Design Portfolio of Interventions is exactly the 3 tabs (Formulate /
    // Evaluate / Ranking) -- the older Compare & Prioritise and Preferred/
    // Combined Direction sections used to be appended below them
    // unconditionally, so they showed under all 3 tabs alike. Dropped per
    // spec; nothing else renders on this step now.
    else if (activeStep === "pathways") {
      await renderPortfolioTab(stepBody, lang, t, t2, caseId, user, curator);
      appendAffineCta(stepBody, lang, "pathways");
    }
    else if (activeStep === "implementation") renderImplementationPlaceholder(stepBody, lang);
    // Phase 2 keeps the focus on the three co-creation activities and their
    // contribution-level discussions. Its separate generic forum was a
    // second, disconnected discussion surface, so it is intentionally not
    // rendered here. Phase 3's forum is hidden for now, per request -- it
    // duplicated the per-option/per-step discussions being built out there.
    // Only Phase 1 currently shows its own phase forum.
    if (activePhase === "phase1") {
      stepBody.append(await renderPhaseForum(caseId, activePhase, lang, t, t2));
    }
  } catch (error) {
    stepBody.innerHTML = `<p class="systems-explorer-error"></p>`;
    stepBody.querySelector("p").textContent = error.message;
  }
  }

  await renderStepBody();
}

// ---------------------------------------------------------------------------
// Step 1: Baseline
// ---------------------------------------------------------------------------

async function renderBaseline(content, lang, t, t2, caseId) {
  content.innerHTML = "";
  const data = await api(`/cases/${encodeURIComponent(caseId)}/baseline`);
  const baseline = data.baseline;
  const section = el("section", "systems-explorer-panel");
  const header = el("div", "case-baseline-header");
  header.append(el("h3", null, t.baselineTitle));
  const downloadable = (baseline.key_evidence || []).find(
    (item) => item.file_url && (/\.pdf$/i.test(item.file_name || "") || item.type === "report")
  );
  const reportUrl = downloadable?.file_url || (caseId === DEMO_FLOOD_CASE_ID ? fallbackFloodBaselineReportUrl : "");
  if (reportUrl) {
    const report = el("a", "btn secondary small case-baseline-download", t2.downloadBaselinePdf);
    report.href = reportUrl;
    report.download = downloadable?.file_name || "flood-resilience-phase-1-baseline.pdf";
    report.setAttribute("aria-label", t2.downloadBaselinePdf);
    report.insertAdjacentHTML(
      "afterbegin",
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>`
    );
    header.append(report);
  }
  section.append(header);
  section.append(el("p", "case-baseline-purpose", t2.baselinePurpose));
  const grid = el("div", "systems-explorer-baseline-grid");
  const addRow = (label, values) => {
    const row = el("div", "systems-explorer-baseline-row");
    row.append(el("b", null, label));
    const list = el("div", "systems-explorer-baseline-tags");
    if (!values.length) list.append(el("span", "systems-explorer-empty-inline", t.baselineEmpty));
    values.forEach((v) => list.append(el("span", "decision-status-pill status-draft", v)));
    row.append(list);
    grid.append(row);
  };
  // Free-text context rows read as prose, not as tag pills.
  const addTextRow = (label, value) => {
    if (!value) return;
    const row = el("div", "systems-explorer-baseline-row");
    row.append(el("b", null, label));
    row.append(el("p", "baseline-context-text", value));
    grid.append(row);
  };
  const pickLang = (elValue, enValue) => (lang === "el" ? elValue : enValue);

  // Ordered exactly as Phase 1 "Prepare the Ground" lists it in the journey
  // doc: impact -> hazards -> vulnerabilities -> affected assets -> primary
  // system -> linked systems -> stakeholders -> RCCAP measures -> evidence.
  if (baseline.climate_impact) {
    addRow(t2.baselineImpactLabel, [pickLang(baseline.climate_impact.title_el, baseline.climate_impact.title_en)]);
  }
  addTextRow(t2.baselineContextLabel, pickLang(baseline.context_el, baseline.context_en));
  addRow(t.baselineHazards, baseline.climate_hazards.map((h) => pickLang(h.name_el, h.name_en)));
  addTextRow(t2.baselineVulnerabilities, pickLang(baseline.vulnerabilities_el, baseline.vulnerabilities_en));
  addTextRow(t2.baselineAffectedAssets, pickLang(baseline.affected_assets_el, baseline.affected_assets_en));
  if (baseline.primary_system) {
    addRow(t.linkedSystemsLabel, [pickLang(baseline.primary_system.name_el, baseline.primary_system.name_en)]);
  }
  addRow(t.baselineAffectedSystems, baseline.linked_systems.map((s) => pickLang(s.name_el, s.name_en)));
  addRow(t.baselineStakeholders, baseline.relevant_stakeholders.map((s) => s.full_name));
  addTextRow(t2.baselineRccapMeasures, pickLang(baseline.rccap_measures_el, baseline.rccap_measures_en));
  section.append(grid);
  // Phase 1 is read-only context, not a new assessment (journey doc).
  section.append(el("p", "systems-explorer-empty-inline", t2.baselineReadOnlyNote));
  content.append(section);

}

// ---------------------------------------------------------------------------
// Step 2: Alternative Futures
// ---------------------------------------------------------------------------

// The only form a coordinator/admin needs for a Possible Future: a title, a
// description and an optional image -- no benefits/barriers/translation
// fields cluttering what should be a quick contribution.
function buildFutureForm(t, t2, { title, values = {}, existingImageUrl, onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const card = document.createElement("form");
  card.className = "modal-card";
  card.append(el("h2", null, title));

  const titleField = buildTextField(t.titleLabel, "title", { required: true, value: values.title || "" });
  card.append(titleField.wrapper);
  const descField = buildTextField(t.descriptionLabel, "description", { textarea: true, value: values.description || "" });
  card.append(descField.wrapper);

  if (existingImageUrl) {
    const preview = document.createElement("img");
    preview.className = "case-toc-image-preview";
    preview.src = existingImageUrl;
    preview.alt = "";
    card.append(preview);
  }
  const fileLabel = document.createElement("label");
  fileLabel.className = "systems-explorer-field";
  fileLabel.append(t2.tocImageLabel);
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileLabel.append(fileInput);
  card.append(fileLabel);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = el("button", "btn secondary", t.cancel);
  cancelBtn.type = "button";
  const submitBtn = el("button", "btn primary", t.save);
  submitBtn.type = "submit";
  actions.append(cancelBtn, submitBtn);
  card.append(actions);

  const close = () => overlay.remove();
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    try {
      const imageKey = fileInput.files[0] ? await uploadImageFile(fileInput.files[0]) : undefined;
      await onSubmit({ title: titleField.input.value.trim(), description: descField.input.value.trim(), imageKey });
      close();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
      submitBtn.disabled = false;
    }
  });

  overlay.append(card);
  document.body.append(overlay);
}

async function renderFutures(content, lang, t, t2, caseId, user, curator) {
  content.innerHTML = "";

  // The workshop is where Possible Futures actually get co-created; the
  // list here only reveals them once that activity is closed, rather than
  // exposing whatever the coordinator/admin has drafted so far.
  const stepStatusData = await api(`/cases/${encodeURIComponent(caseId)}/steps`).catch(() => ({ items: [] }));
  const workshopClosed = (stepStatusData.items || []).find((s) => s.step === "futures")?.status === "closed";

  const list = el("div", "alternative-futures-list");
  content.append(list);

  const langKey = (base) => `${base}${lang === "el" ? "El" : "En"}`;

  const openForm = () => {
    buildFutureForm(t, t2, {
      title: t.newFutureTitle,
      onSubmit: async ({ title, description, imageKey }) => {
        const payload = { titleEl: title, titleEn: title, descriptionEl: description, descriptionEn: description };
        if (imageKey) payload.imageKey = imageKey;
        await api(`/cases/${encodeURIComponent(caseId)}/futures`, { method: "POST", body: JSON.stringify(payload) });
        showToast({ type: "success", title: t2.contributionAdded });
        await reload();
      },
    });
  };

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/futures`);
    list.innerHTML = "";
    if (!workshopClosed || !data.items.length) {
      list.append(
        buildEmptyState(t, {
          icon: "sparkles",
          title: t.futuresEmptyTitle,
          description: workshopClosed ? t2.futuresWorkshopEmpty : t2.futuresWorkshopInProgress,
          ctaLabel: t2.goToWorkshop,
          onCta: () => window.open(WORKSHOP_URL, "_blank", "noopener"),
          secondaryLabel: curator ? t2.addFutureHere : null,
          onSecondary: curator ? openForm : null,
        })
      );
      return;
    }
    data.items.forEach((f) =>
      list.append(
        buildContributionCard(f, lang, t, t2, user, curator, {
          showEditorialMeta: false,
          getTitle: (i, l) => (l === "el" ? i.title_el : i.title_en),
          getBody: (i, l) => (l === "el" ? i.description_el : i.description_en),
          allItems: data.items,
          onChanged: reload,
          onVote: (id, value) =>
            api(`/cases/${encodeURIComponent(caseId)}/futures/${encodeURIComponent(id)}/vote`, {
              method: "POST",
              body: JSON.stringify({ value }),
            }),
          onReply: (id, body) =>
            api(`/cases/${encodeURIComponent(caseId)}/futures/${encodeURIComponent(id)}/replies`, { method: "POST", body: JSON.stringify({ body }) }),
          getReplies: (id) => api(`/cases/${encodeURIComponent(caseId)}/futures/${encodeURIComponent(id)}/replies`),
          // A coordinator/admin's only actions on a Possible Future are
          // editing or deleting it -- no merge/group/highlight clutter.
          onEdit: (item) => {
            buildFutureForm(t, t2, {
              title: t2.editFutureTitle,
              values: { title: lang === "el" ? item.title_el : item.title_en, description: lang === "el" ? item.description_el : item.description_en },
              existingImageUrl: item.image_url,
              onSubmit: async ({ title, description, imageKey }) => {
                const payload = { [langKey("title")]: title, [langKey("description")]: description };
                if (imageKey) payload.imageKey = imageKey;
                await api(`/cases/${encodeURIComponent(caseId)}/futures/${encodeURIComponent(item.id)}`, {
                  method: "PATCH",
                  body: JSON.stringify(payload),
                });
                showToast({ type: "success", title: t2.contributionUpdated });
                await reload();
              },
            });
          },
          onDelete: (id) => api(`/cases/${encodeURIComponent(caseId)}/futures/${encodeURIComponent(id)}`, { method: "DELETE" }),
        })
      )
    );
  };

  await reload();
}

// ---------------------------------------------------------------------------
// Step 3: Shared Vision, built from Vision Elements
// ---------------------------------------------------------------------------

// One reusable card for every co-creation content type that supports the
// propose/discuss/build-on/prioritise pattern (Alternative Futures, Vision
// Elements, Adaptation Options) -- config-driven per spec's "one reusable
// Contribution Card" instruction, so the interaction model is learned once
// and just the fields change per section. Secondary actions (build on,
// suggest alternative, and every Coordinator-only action) live in a
// contextual "more" menu rather than a wall of buttons, but every action
// the spec asks for is present and one click away.
// A contribution needs an attributable voice: who, in what capacity, and
// when. Roles come from the contributor's membership in this case study.
function relativeTime(iso, t2) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return t2.justNow;
  if (mins < 60) return t2.minutesAgo(mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t2.hoursAgo(hours);
  return t2.daysAgo(Math.round(hours / 24));
}

function buildReplyRow(reply, t2) {
  const row = el("div", "contribution-reply");
  const head = el("div", "contribution-reply-head");
  head.append(el("span", "contribution-reply-author", reply.author_name));
  const roleLabel = t2.memberRole?.[reply.author_role];
  if (roleLabel) head.append(el("span", "contribution-reply-role", roleLabel));
  if (reply.author_org) head.append(el("span", "contribution-reply-org", reply.author_org));
  if (reply.created_at) head.append(el("span", "contribution-reply-time", relativeTime(reply.created_at, t2)));
  row.append(head, el("p", "contribution-reply-body", reply.body));
  return row;
}
function buildContributionCard(item, lang, t, t2, user, curator, config) {
  // Same comment-card look as the Phase 1 Forum (renderPhaseForum) --
  // author name + role pill + relative time, so every forum/comment/post
  // surface in the app reads consistently.
  const card = el("article", "case-phase-forum-comment");
  const showEditorialMeta = config.showEditorialMeta !== false;
  if (item.status === "merged") card.classList.add("vision-element-merged");
  const head = el("div", "contribution-reply-head");
  if (config.showAuthor !== false) {
    if (item.author_name) head.append(el("strong", null, item.author_name));
    if (item.author_role) head.append(el("span", "contribution-reply-role", t2.memberRole[item.author_role] || item.author_role));
    if (item.created_at) head.append(el("span", "contribution-reply-time", relativeTime(item.created_at, t2)));
  }
  if (showEditorialMeta && item.group_label) head.append(el("span", "decision-status-pill status-draft", item.group_label));
  if (item.status === "merged") head.append(el("span", "decision-status-pill status-draft", t.mergedInto));
  card.append(head);
  if (config.getTitle) card.append(el("h4", null, config.getTitle(item, lang)));
  if (item.image_url) {
    const image = document.createElement("img");
    image.className = "vision-element-image";
    image.src = item.image_url;
    image.alt = "";
    image.loading = "lazy";
    card.append(image);
  }
  const bodyText = config.getBody(item, lang);
  if (bodyText) card.append(el("p", "vision-element-body", bodyText));
  if (config.getExtraRows) {
    config.getExtraRows(item, lang).forEach(([label, value]) => {
      if (!value) return;
      const row = el("p", "systems-explorer-empty-inline");
      row.innerHTML = `<b></b> `;
      row.querySelector("b").textContent = `${label}: `;
      row.append(document.createTextNode(value));
      card.append(row);
    });
  }

  const actions = el("div", "case-phase-forum-actions");
  const replyBtn = el("button", "btn secondary small", `${t.reply} (${item.reply_count})`);
  replyBtn.type = "button";
  if (config.onVote) {
    const votes = el("div", "case-phase-forum-votes");
    const buildVoteButton = (value, label, countValue, symbol) => {
      const button = el("button", `case-phase-forum-vote${item.my_vote === value ? " active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-label", `${label} (${countValue})`);
      button.append(el("span", "case-phase-forum-vote-icon", symbol));
      button.append(el("span", "case-phase-forum-vote-label", label));
      button.append(el("strong", null, String(countValue)));
      button.addEventListener("click", () => {
        config.onVote(item.id, value).then(() => {
          showToast({ type: "success", title: t2.forumVoteUpdated });
          config.onChanged();
        });
      });
      return button;
    };
    votes.append(
      buildVoteButton("agree", t2.forumUpvote, item.agree_count, "↑"),
      buildVoteButton("disagree", t2.forumDownvote, item.disagree_count, "↓")
    );
    actions.append(votes);
  }
  // Reply always sits to the right of Disagree, in every action row that
  // has both -- matching the phase-forum's action row.
  actions.append(replyBtn);

  if (config.onBuildOn) {
    const buildOnBtn = el("button", "btn secondary small", t2.buildOn);
    buildOnBtn.type = "button";
    buildOnBtn.addEventListener("click", () => config.onBuildOn(item));
    actions.append(buildOnBtn);
  }
  if (config.onSuggestAlternative) {
    const altBtn = el("button", "btn secondary small", t2.suggestAlternative);
    altBtn.type = "button";
    altBtn.addEventListener("click", () => config.onSuggestAlternative(item));
    actions.append(altBtn);
  }

  if (curator) {
    const moreBtn = el("button", "btn secondary small", `⋯ ${t2.moreActions}`);
    moreBtn.type = "button";
    const menu = el("div", "vision-element-curator-menu");
    menu.style.display = "none";
    const menuAction = (label, onClick) => {
      const btn = el("button", "btn secondary small", label);
      btn.type = "button";
      btn.addEventListener("click", async () => {
        menu.style.display = "none";
        try {
          await onClick();
        } catch (error) {
          showToast({ type: "error", title: t.createdError, message: error.message });
        }
      });
      menu.append(btn);
    };
    if (config.onEdit) {
      menuAction(t2.edit, () => config.onEdit(item));
    }
    if (config.onDelete) {
      menuAction(t2.delete, async () => {
        if (!window.confirm(t2.deleteConfirm)) return;
        await config.onDelete(item.id);
        showToast({ type: "success", title: t2.deleted });
        config.onChanged();
      });
    }
    if (config.onMerge && item.status !== "merged") {
      menuAction(t.merge, async () => {
        const options = config.allItems.filter((i) => i.id !== item.id);
        const targetId = window.prompt(`${t.mergeSelectTarget}:\n` + options.map((o, i) => `${i + 1}. ${config.getBody(o, lang).slice(0, 60)}`).join("\n"));
        const index = Number(targetId) - 1;
        const target = options[index];
        if (!target) return;
        await config.onMerge(item.id, target.id);
        showToast({ type: "success", title: t2.mergedSummary(1) });
        config.onChanged();
      });
    }
    if (config.onGroup) {
      menuAction(t2.groupAction, async () => {
        const label = window.prompt(t2.groupPrompt, item.group_label || "");
        if (label === null) return;
        await config.onGroup(item.id, label.trim());
        config.onChanged();
      });
    }
    if (config.curatorToggle) {
      const isOn = config.curatorToggle.isOn(item);
      menuAction(isOn ? config.curatorToggle.offLabel : config.curatorToggle.onLabel, async () => {
        await config.curatorToggle.onToggle(item.id, !isOn);
        config.onChanged();
      });
    }
    moreBtn.addEventListener("click", () => {
      menu.style.display = menu.style.display === "none" ? "" : "none";
    });
    actions.append(moreBtn);
    card.append(actions, menu);
  } else {
    card.append(actions);
  }

  // Existing replies are always visible, exactly like the Phase 1 Forum's
  // comment threads -- only the compose form is toggled by Reply, not the
  // replies that are already there.
  const repliesBox = el("div", "case-phase-forum-replies");
  const replyForm = document.createElement("form");
  replyForm.className = "vision-element-reply-form";
  replyForm.hidden = true;
  const replyInput = document.createElement("input");
  replyInput.placeholder = t.replyPlaceholder;
  const sendBtn = el("button", "btn primary small", t.send);
  sendBtn.type = "submit";
  replyForm.append(replyInput, sendBtn);
  card.append(repliesBox, replyForm);

  const loadReplies = async () => {
    const data = await config.getReplies(item.id);
    repliesBox.innerHTML = "";
    data.items.forEach((r) => repliesBox.append(buildReplyRow(r, t2)));
    replyBtn.textContent = `${t.reply} (${data.items.length})`;
    return data.items.length;
  };
  loadReplies();

  replyBtn.addEventListener("click", () => {
    replyForm.hidden = !replyForm.hidden;
    card.classList.toggle("contribution-thread-open", !replyForm.hidden);
    if (!replyForm.hidden) replyInput.focus();
  });
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = replyInput.value.trim();
    if (!body) return;
    try {
      await config.onReply(item.id, body);
      replyInput.value = "";
      await loadReplies();
      showToast({ type: "success", title: t2.commentPosted });
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });

  return card;
}

async function renderVision(content, lang, t, t2, caseId, user, curator) {
  content.innerHTML = "";

  // Only a Coordinator/Admin publishes a Shared Vision idea here (Title +
  // Description + optional image, same shape as Possible Futures) --
  // everyone else in the case can only agree/disagree and reply. Shown
  // whenever there's already at least one, not just via the empty state's
  // CTA below -- a curator adding a second/third vision idea shouldn't have
  // no way to do it once the list isn't empty.
  const openForm = () => {
    buildFutureForm(t, t2, {
      title: t2.newVisionTitle,
      onSubmit: async ({ title, description, imageKey }) => {
        const payload = { titleEl: title, titleEn: title, descriptionEl: description, descriptionEn: description };
        if (imageKey) payload.imageKey = imageKey;
        await api(`/cases/${encodeURIComponent(caseId)}/vision-elements`, { method: "POST", body: JSON.stringify(payload) });
        showToast({ type: "success", title: t2.contributionAdded });
        await reload();
      },
    });
  };
  if (curator) {
    const addBtn = withPlusIcon(el("button", "btn secondary", t2.addVisionHere));
    addBtn.type = "button";
    addBtn.addEventListener("click", openForm);
    content.append(addBtn);
  }

  const list = el("div", "vision-elements-container");
  content.append(list);

  const langKey = (base) => `${base}${lang === "el" ? "El" : "En"}`;

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/vision-elements`);
    list.innerHTML = "";
    if (!data.items.length) {
      list.append(
        buildStepEmptyState(t, t2, {
          icon: "target",
          title: t2.visionEmptyTitle,
          description: t2.visionEmptyDesc,
        })
      );
      return;
    }
    data.items.forEach((ve) =>
      list.append(
        buildContributionCard(ve, lang, t, t2, user, curator, {
          showEditorialMeta: false,
          getTitle: (i, l) => (l === "el" ? i.title_el : i.title_en) || null,
          getBody: (i, l) => (l === "el" ? i.description_el : i.description_en) || i.body,
          allItems: data.items,
          onChanged: reload,
          onVote: (id, value) =>
            api(`/cases/${encodeURIComponent(caseId)}/vision-elements/${encodeURIComponent(id)}/vote`, {
              method: "POST",
              body: JSON.stringify({ value }),
            }),
          onReply: (id, body) =>
            api(`/cases/${encodeURIComponent(caseId)}/vision-elements/${encodeURIComponent(id)}/replies`, {
              method: "POST",
              body: JSON.stringify({ body }),
            }),
          getReplies: (id) => api(`/cases/${encodeURIComponent(caseId)}/vision-elements/${encodeURIComponent(id)}/replies`),
          onEdit: (item) => {
            buildFutureForm(t, t2, {
              title: t2.editVisionTitle,
              values: { title: lang === "el" ? item.title_el : item.title_en, description: lang === "el" ? item.description_el : item.description_en },
              existingImageUrl: item.image_url,
              onSubmit: async ({ title, description, imageKey }) => {
                const payload = { [langKey("title")]: title, [langKey("description")]: description };
                if (imageKey) payload.imageKey = imageKey;
                await api(`/cases/${encodeURIComponent(caseId)}/vision-elements/${encodeURIComponent(item.id)}`, {
                  method: "PATCH",
                  body: JSON.stringify(payload),
                });
                showToast({ type: "success", title: t2.contributionUpdated });
                await reload();
              },
            });
          },
          onDelete: (id) => api(`/cases/${encodeURIComponent(caseId)}/vision-elements/${encodeURIComponent(id)}`, { method: "DELETE" }),
        })
      )
    );
  };

  await reload();
}

// ---------------------------------------------------------------------------
// Step 4: Theory of Change
// ---------------------------------------------------------------------------

// Simplified to what a coordinator/admin actually authors here: one image
// attachment and one description, not an auto-populated Current State /
// Desired Future bridge nobody edited directly.
function openTocEditForm(lang, t, t2, caseId, existing, onSaved) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const card = document.createElement("form");
  card.className = "modal-card";
  card.append(el("h2", null, t.tocTitle));

  if (existing.image_url) {
    const preview = document.createElement("img");
    preview.className = "case-toc-image-preview";
    preview.src = existing.image_url;
    preview.alt = "";
    card.append(preview);
  }
  const fileLabel = document.createElement("label");
  fileLabel.className = "systems-explorer-field";
  fileLabel.append(t2.tocImageLabel);
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileLabel.append(fileInput);
  card.append(fileLabel);

  const descLabel = document.createElement("label");
  descLabel.className = "systems-explorer-field";
  descLabel.append(t.descriptionLabel);
  const descInput = document.createElement("textarea");
  descInput.value = (lang === "el" ? existing.required_transformations_el : existing.required_transformations_en) || "";
  descLabel.append(descInput);
  card.append(descLabel);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = el("button", "btn secondary", t.cancel);
  cancelBtn.type = "button";
  const submitBtn = el("button", "btn primary", t.save);
  submitBtn.type = "submit";
  actions.append(cancelBtn, submitBtn);
  card.append(actions);

  const close = () => overlay.remove();
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    try {
      const payload = { [lang === "el" ? "requiredTransformationsEl" : "requiredTransformationsEn"]: descInput.value.trim() };
      if (fileInput.files[0]) payload.imageKey = await uploadImageFile(fileInput.files[0]);
      await api(`/cases/${encodeURIComponent(caseId)}/theory-of-change`, { method: "PUT", body: JSON.stringify(payload) });
      close();
      await onSaved();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
      submitBtn.disabled = false;
    }
  });

  overlay.append(card);
  document.body.append(overlay);
}

// The Theory of Change is a single record, not a list, so it doesn't go
// through buildContributionCard -- but participants still need to
// agree/disagree and reply to it, the same as any other contribution.
function buildTocDiscussion(toc, lang, t, t2, caseId, onChanged) {
  const wrap = el("section", "systems-explorer-panel");
  const head = el("div", "systems-explorer-section-head");
  head.append(el("h3", null, t2.tocDiscussionTitle));
  wrap.append(head);

  // Same vote/reply action-row markup as the Phase 1 Forum
  // (renderPhaseForum) -- icon/label/count pill buttons, Reply to the
  // right of Disagree.
  const actions = el("div", "case-phase-forum-actions");
  const votes = el("div", "case-phase-forum-votes");
  const vote = async (value) => {
    try {
      await api(`/cases/${encodeURIComponent(caseId)}/theory-of-change/vote`, { method: "POST", body: JSON.stringify({ value }) });
      showToast({ type: "success", title: t2.forumVoteUpdated });
      await onChanged();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  };
  const buildVoteButton = (value, label, countValue, symbol) => {
    const button = el("button", `case-phase-forum-vote${toc.my_vote === value ? " active" : ""}`);
    button.type = "button";
    button.setAttribute("aria-label", `${label} (${countValue})`);
    button.append(el("span", "case-phase-forum-vote-icon", symbol));
    button.append(el("span", "case-phase-forum-vote-label", label));
    button.append(el("strong", null, String(countValue)));
    button.addEventListener("click", () => vote(value));
    return button;
  };
  votes.append(
    buildVoteButton("agree", t2.forumUpvote, toc.agree_count, "↑"),
    buildVoteButton("disagree", t2.forumDownvote, toc.disagree_count, "↓")
  );
  const replyBtn = el("button", "btn secondary small", `${t.reply} (${toc.reply_count})`);
  replyBtn.type = "button";
  actions.append(votes, replyBtn);
  wrap.append(actions);

  // Existing replies are always visible, exactly like the Phase 1 Forum's
  // comment threads -- only the compose form is toggled by Reply, not the
  // replies that are already there.
  const repliesBox = el("div", "case-phase-forum-replies");
  const replyForm = document.createElement("form");
  replyForm.className = "vision-element-reply-form";
  replyForm.hidden = true;
  const replyInput = document.createElement("input");
  replyInput.placeholder = t2.forumReplyPlaceholder;
  const replySubmit = el("button", "btn primary small", t.send);
  replySubmit.type = "submit";
  replyForm.append(replyInput, replySubmit);

  const loadReplies = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/theory-of-change/replies`);
    repliesBox.innerHTML = "";
    data.items.forEach((reply) => repliesBox.append(buildReplyRow(reply, t2)));
  };
  replyBtn.addEventListener("click", () => {
    replyForm.hidden = !replyForm.hidden;
    if (!replyForm.hidden) replyInput.focus();
  });
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = replyInput.value.trim();
    if (!body) return;
    try {
      await api(`/cases/${encodeURIComponent(caseId)}/theory-of-change/replies`, { method: "POST", body: JSON.stringify({ body }) });
      replyInput.value = "";
      showToast({ type: "success", title: t2.commentPosted });
      await loadReplies();
      await onChanged();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });

  wrap.append(repliesBox, replyForm);
  loadReplies();
  return wrap;
}

async function renderToC(content, lang, t, t2, caseId, curator) {
  content.innerHTML = "";
  const data = await api(`/cases/${encodeURIComponent(caseId)}/theory-of-change`);
  const toc = data.theoryOfChange;
  const section = el("section", "systems-explorer-panel");
  const head = el("div", "systems-explorer-section-head");
  head.append(el("h3", null, t2.stepToC));
  const openEdit = () => openTocEditForm(lang, t, t2, caseId, toc, () => renderToC(content, lang, t, t2, caseId, curator));
  if (curator) {
    const editBtn = el("button", "btn secondary", t.tocEdit);
    editBtn.type = "button";
    editBtn.addEventListener("click", openEdit);
    head.append(editBtn);
  }
  section.append(head);
  const description = (lang === "el" ? toc.required_transformations_el : toc.required_transformations_en) || "";
  if (toc.image_url || description) {
    if (toc.image_url) {
      const figure = document.createElement("figure");
      figure.className = "case-toc-image";
      const img = document.createElement("img");
      img.src = toc.image_url;
      img.alt = t2.tocImageAlt;
      img.loading = "lazy";
      figure.append(img);
      section.append(figure);
    }
    if (description) section.append(el("p", "case-toc-summary", description));
  } else {
    section.append(
      buildStepEmptyState(t, t2, {
        icon: "compass",
        title: t2.tocEmptyTitle,
        description: t2.tocEmptyDesc,
        curator,
        curatorLabel: t.tocEdit,
        onCurator: openEdit,
      })
    );
  }
  content.append(section);
  content.append(buildTocDiscussion(toc, lang, t, t2, caseId, () => renderToC(content, lang, t, t2, caseId, curator)));
}

// Every step needs to answer the same three questions when it has no output
// yet: what is this, why is it empty, what do I do next. Dummy content in
// place of a real answer would read as a validated project result, which the
// journey document explicitly forbids.
function buildStepEmptyState(t, t2, { icon, title, description, curatorLabel, onCurator, curator }) {
  return buildEmptyState(t, {
    icon,
    title,
    description,
    ctaLabel: t2.goToWorkshop,
    onCta: () => window.open(WORKSHOP_URL, "_blank", "noopener"),
    secondaryLabel: curator ? curatorLabel : null,
    onSecondary: curator ? onCurator : null,
  });
}

// The Prioritisation feature: drag-and-drop rank the actual Alternative
// Futures a coordinator/admin created for this case -- a full ordering, not
// a single pick. Kept deliberately minimal: no per-item classification, just
// a position. Up/down buttons sit alongside the drag handle since native
// HTML5 drag-and-drop has no touch or keyboard path.
async function renderPrioritisation(content, lang, t, t2, caseId, { append = false } = {}) {
  if (!append) content.innerHTML = "";
  const section = el("section", "systems-explorer-panel case-prioritisation");
  const head = el("div", "case-prioritisation-head");
  head.append(el("h3", null, t2.prioritisationTitle), el("p", null, t2.prioritisationIntro));
  section.append(head);

  // Ranking reveals the same Possible Futures the list above only shows
  // once the co-creation workshop is closed -- keep both gated together.
  const stepStatusData = await api(`/cases/${encodeURIComponent(caseId)}/steps`).catch(() => ({ items: [] }));
  const workshopClosed = (stepStatusData.items || []).find((s) => s.step === "futures")?.status === "closed";
  if (!workshopClosed) {
    section.append(el("p", "systems-explorer-empty", t2.futuresWorkshopInProgress));
    content.append(section);
    return;
  }

  const list = el("ol", "case-prioritisation-rank-list");
  const footer = el("div", "case-prioritisation-footer");
  const status = el("p", "case-prioritisation-status");
  const submit = el("button", "btn primary case-prioritisation-submit", t2.prioritisationSubmit);
  submit.type = "button";
  footer.append(status, submit);
  section.append(list, footer);
  content.append(section);

  let order = [];
  let itemsById = {};
  let hasSubmitted = false;
  let savedOrderKey = "";

  function renderList() {
    list.innerHTML = "";
    if (!order.length) {
      list.append(el("p", "systems-explorer-empty", t2.prioritisationEmpty));
      return;
    }
    order.forEach((futureId, index) => {
      const item = itemsById[futureId];
      if (!item) return;
      const row = el("li", "case-prioritisation-rank-row");
      row.draggable = true;
      row.dataset.futureId = futureId;
      row.innerHTML = `<span class="case-prioritisation-rank-position"></span><span class="case-prioritisation-rank-copy"><strong></strong><span></span></span><span class="case-prioritisation-rank-move"><button type="button" class="case-prioritisation-rank-up" aria-label="${t2.prioritisationMoveUp}">↑</button><button type="button" class="case-prioritisation-rank-down" aria-label="${t2.prioritisationMoveDown}">↓</button></span>`;
      row.querySelector(".case-prioritisation-rank-position").textContent = String(index + 1);
      row.querySelector(".case-prioritisation-rank-copy strong").textContent = lang === "el" ? item.title_el : item.title_en;
      const description = lang === "el" ? item.description_el : item.description_en;
      if (description) row.querySelector(".case-prioritisation-rank-copy span").textContent = description;
      row.querySelector(".case-prioritisation-rank-up").disabled = index === 0;
      row.querySelector(".case-prioritisation-rank-down").disabled = index === order.length - 1;
      row.querySelector(".case-prioritisation-rank-up").addEventListener("click", () => moveItem(index, index - 1));
      row.querySelector(".case-prioritisation-rank-down").addEventListener("click", () => moveItem(index, index + 1));
      list.append(row);
    });
  }

  function moveItem(from, to) {
    if (to < 0 || to >= order.length) return;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    renderList();
    updateSubmitState();
  }

  let dragFutureId = null;
  list.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".case-prioritisation-rank-row");
    dragFutureId = row?.dataset.futureId || null;
  });
  list.addEventListener("dragover", (event) => {
    event.preventDefault();
    const row = event.target.closest(".case-prioritisation-rank-row");
    if (!row || !dragFutureId || row.dataset.futureId === dragFutureId) return;
    const from = order.indexOf(dragFutureId);
    const to = order.indexOf(row.dataset.futureId);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, dragFutureId);
    renderList();
    updateSubmitState();
  });

  function updateSubmitState() {
    const currentKey = order.join(",");
    submit.disabled = !order.length || currentKey === savedOrderKey;
    submit.textContent = hasSubmitted ? t2.prioritisationUpdate : t2.prioritisationSubmit;
  }

  try {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/prioritisation`);
    itemsById = Object.fromEntries(data.items.map((item) => [item.id, item]));
    hasSubmitted = data.myRanking.length > 0;
    order = hasSubmitted ? [...data.myRanking] : data.items.map((item) => item.id);
    savedOrderKey = hasSubmitted ? order.join(",") : "";
    renderList();
    updateSubmitState();
  } catch (error) {
    list.replaceWith(el("p", "systems-explorer-error", error.message || t.createdError));
    return;
  }

  submit.addEventListener("click", async () => {
    submit.disabled = true;
    try {
      const data = await api(`/cases/${encodeURIComponent(caseId)}/prioritisation`, {
        method: "POST",
        body: JSON.stringify({ order }),
      });
      hasSubmitted = true;
      savedOrderKey = data.myRanking.join(",");
      status.textContent = `✓ ${t2.prioritisationSaved}`;
      showToast({ type: "success", title: t2.prioritisationSubmitted });
      updateSubmitState();
    } catch (error) {
      submit.disabled = false;
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });
}

function renderImplementationPlaceholder(content, lang) {
  content.innerHTML = "";
  const panel = el("section", "systems-explorer-panel case-implementation-placeholder");
  panel.innerHTML = `<span class="case-implementation-index">03</span><div><h3></h3><p></p></div>`;
  panel.querySelector("h3").textContent = lang === "el" ? "Υλοποίηση" : "Implementation";
  panel.querySelector("p").textContent = lang === "el"
    ? "Η λειτουργικότητα υλοποίησης θα αναπτυχθεί σε επόμενο στάδιο. Δεν δημιουργείται πρόσθετη ροή σε αυτή τη φάση."
    : "Implementation functionality will be developed at a later stage. No additional workflow is created at this point.";
  content.append(panel);
}

export async function renderPhaseForum(caseId, phase, lang, t = T[lang], t2 = T2[lang]) {
  const phaseNumber = PHASES.findIndex((item) => item.key === phase) + 1;
  const panel = el("section", "systems-explorer-panel case-phase-forum");
  const head = el("div", "systems-explorer-section-head");
  const title = el("h3", null, t2.phaseForum(phaseNumber));
  const count = el("button", "case-phase-forum-count", "0");
  count.type = "button";
  head.append(title, count);
  panel.append(head, el("p", "systems-explorer-empty-inline", t2.forumIntro));
  const list = el("div", "case-phase-forum-list");
  panel.append(list);

  const form = document.createElement("form");
  form.className = "vision-element-propose-form case-phase-forum-form";
  const input = document.createElement("textarea");
  input.placeholder = t2.forumPlaceholder;
  const submit = el("button", "btn primary small", t2.forumSubmit);
  submit.type = "submit";
  submit.disabled = true;
  input.addEventListener("input", () => {
    submit.disabled = !input.value.trim();
  });
  form.append(input, submit);
  panel.append(form);

  const buildVoteControls = (comment) => {
    const controls = el("div", "case-phase-forum-votes");
    const buildButton = (value, label, countValue, symbol) => {
      const button = el("button", `case-phase-forum-vote${comment.my_vote === value ? " active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-label", `${label} (${countValue})`);
      button.setAttribute("aria-pressed", String(comment.my_vote === value));
      button.append(el("span", "case-phase-forum-vote-icon", symbol));
      button.append(el("span", "case-phase-forum-vote-label", label));
      button.append(el("strong", null, String(countValue)));
      button.addEventListener("click", async () => {
        const nextValue = comment.my_vote === value ? 0 : value;
        try {
          await api(
            `/cases/${encodeURIComponent(caseId)}/phases/${phase}/forum/${encodeURIComponent(comment.id)}/vote`,
            { method: "POST", body: JSON.stringify({ value: nextValue }) }
          );
          showToast({ type: "success", title: t2.forumVoteUpdated });
          await reload();
        } catch (error) {
          showToast({ type: "error", title: t.createdError, message: error.message });
        }
      });
      return button;
    };
    controls.append(
      buildButton(1, t2.forumUpvote, comment.upvote_count, "↑"),
      buildButton(-1, t2.forumDownvote, comment.downvote_count, "↓")
    );
    return controls;
  };

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/phases/${phase}/forum`);
    list.innerHTML = "";
    count.textContent = String(data.commentCount);
    const roots = data.items.filter((item) => !item.parent_id);
    if (!roots.length) list.append(el("p", "systems-explorer-empty", t2.forumEmpty));
    roots.forEach((comment) => {
      const card = el("article", "case-phase-forum-comment");
      const meta = el("div", "contribution-reply-head");
      meta.append(el("strong", null, comment.author_name));
      if (comment.author_role) meta.append(el("span", "contribution-reply-role", t2.memberRole[comment.author_role] || comment.author_role));
      if (comment.created_at) meta.append(el("span", "contribution-reply-time", relativeTime(comment.created_at, t2)));
      card.append(meta, el("p", null, comment.body));
      const replies = data.items.filter((item) => item.parent_id === comment.id);
      const repliesBox = el("div", "case-phase-forum-replies");
      replies.forEach((reply) => {
        const replyRow = buildReplyRow(reply, t2);
        replyRow.append(buildVoteControls(reply));
        repliesBox.append(replyRow);
      });
      card.append(repliesBox);
      const replyButton = el("button", "btn secondary small", `${t2.replyAction} (${replies.length})`);
      replyButton.type = "button";
      const replyForm = document.createElement("form");
      replyForm.className = "vision-element-reply-form";
      replyForm.hidden = true;
      const replyInput = document.createElement("input");
      replyInput.placeholder = t2.forumReplyPlaceholder;
      const replySubmit = el("button", "btn primary small", t.send);
      replySubmit.type = "submit";
      replyForm.append(replyInput, replySubmit);
      replyButton.addEventListener("click", () => {
        replyForm.hidden = !replyForm.hidden;
        if (!replyForm.hidden) replyInput.focus();
      });
      replyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = replyInput.value.trim();
        if (!body) return;
        await api(`/cases/${encodeURIComponent(caseId)}/phases/${phase}/forum`, {
          method: "POST",
          body: JSON.stringify({ body, parentId: comment.id }),
        });
        showToast({ type: "success", title: t2.commentPosted });
        await reload();
      });
      const actions = el("div", "case-phase-forum-actions");
      actions.append(buildVoteControls(comment), replyButton);
      card.append(actions, replyForm);
      list.append(card);
    });
  };
  count.addEventListener("click", () => list.scrollIntoView({ behavior: "smooth", block: "start" }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    try {
      await api(`/cases/${encodeURIComponent(caseId)}/phases/${phase}/forum`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      input.value = "";
      submit.disabled = true;
      showToast({ type: "success", title: t2.commentPosted });
      await reload();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });
  await reload();
  return panel;
}

// ---------------------------------------------------------------------------
// Step 5: Adaptation Options
// ---------------------------------------------------------------------------

function levelLabel(p3, level) {
  return { low: p3.levelLow, medium: p3.levelMedium, high: p3.levelHigh }[level] || level;
}

function robustLabel(p3, value) {
  return { most: p3.robustMost, some: p3.robustSome, dependent: p3.robustDependent }[value] || value;
}

// The reference/evidence vs stakeholder-opinion split has to be visually
// obvious (spec), so a PESPKA measure's evidence renders in its own
// read-only block -- never merged into the same list as what a stakeholder
// contributed.
function buildOptionInfoModal(option, lang, t, t2, p3) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const card = document.createElement("div");
  card.className = "modal-card option-info-modal";
  card.append(el("h2", null, lang === "el" ? option.title_el : option.title_en));
  const desc = lang === "el" ? option.description_el : option.description_en;
  if (desc) card.append(el("p", null, desc));

  if (option.source === "pespka" && option.pespka_evidence) {
    const evidence = option.pespka_evidence;
    const pick = (field) => field?.[lang] || "";
    const section = el("section", "option-evidence-section");
    section.append(el("h3", null, p3.evidenceFromPespka));
    section.append(el("p", "systems-explorer-empty-inline", p3.referenceEvidenceNote));
    const rows = [
      [p3.pespkaCode, evidence.code],
      [p3.pespkaSector, pick(evidence.sector)],
      [p3.pespkaInterventionType, pick(evidence.interventionType)],
      [p3.pespkaProposedPeriod, pick(evidence.proposedPeriod)],
      [p3.pespkaImplementingAuthority, pick(evidence.implementingAuthority)],
      [p3.pespkaEstimatedCost, pick(evidence.estimatedCost)],
      [p3.pespkaEffectiveness, pick(evidence.effectiveness)],
      [p3.pespkaCostEffectiveness, pick(evidence.costEffectiveness)],
      [p3.pespkaEconomicBenefit, pick(evidence.economicBenefit)],
      [p3.pespkaEnvironmentalBenefit, pick(evidence.environmentalBenefit)],
      [p3.pespkaSocialBenefit, pick(evidence.socialBenefit)],
      [p3.pespkaSynergies, pick(evidence.synergies)],
    ];
    const table = document.createElement("table");
    table.className = "regional-mapping-table";
    table.innerHTML = "<tbody></tbody>";
    rows.forEach(([label, value]) => {
      if (!value) return;
      const row = table.tBodies[0].insertRow();
      row.insertCell().textContent = label;
      row.insertCell().textContent = value;
    });
    section.append(table);
    section.append(el("p", "option-evidence-source", `${p3.pespkaSourceLabel}: ${pick(evidence.source) || "PESPKA Attica, 2020"}`));
    card.append(section);
  }

  const assessSection = el("section", "option-evidence-section");
  assessSection.append(el("h3", null, p3.stakeholderAssessmentTitle));
  if (option.assessment_count > 0 && option.collective_assessment) {
    const c = option.collective_assessment;
    const table = document.createElement("table");
    table.className = "regional-mapping-table";
    table.innerHTML = "<tbody></tbody>";
    [
      [p3.effectivenessLabel, levelLabel(p3, c.effectiveness)],
      [p3.feasibilityLabel, levelLabel(p3, c.feasibility)],
      [p3.coBenefitsLabel, levelLabel(p3, c.co_benefits)],
      [p3.transformativeLabel, levelLabel(p3, c.transformative_potential)],
      [p3.robustLabel, robustLabel(p3, c.robust_across_futures)],
    ].forEach(([label, value]) => {
      const row = table.tBodies[0].insertRow();
      row.insertCell().textContent = label;
      row.insertCell().textContent = value;
    });
    assessSection.append(table, el("p", "systems-explorer-empty-inline", p3.assessmentCount(option.assessment_count)));
  } else {
    assessSection.append(el("p", "systems-explorer-empty-inline", p3.noAssessmentYet));
  }
  card.append(assessSection);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const closeBtn = el("button", "btn primary", t2.close);
  closeBtn.type = "button";
  closeBtn.addEventListener("click", () => overlay.remove());
  actions.append(closeBtn);
  card.append(actions);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.append(card);
  return overlay;
}

function buildNewOptionForm(t, t2, p3, { onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const card = document.createElement("form");
  card.className = "modal-card";
  card.append(el("h2", null, p3.newOptionModalTitle));
  const titleElField = buildTextField(`${t.titleLabel} (EL)`, "titleEl", { required: true });
  const titleEnField = buildTextField(`${t.titleLabel} (EN)`, "titleEn", { required: true });
  const descElField = buildTextField(`${t.descriptionLabel} (EL)`, "descriptionEl", { textarea: true });
  const descEnField = buildTextField(`${t.descriptionLabel} (EN)`, "descriptionEn", { textarea: true });
  const horizonWrap = document.createElement("label");
  horizonWrap.className = "systems-explorer-field";
  horizonWrap.append(p3.timeHorizonFieldLabel);
  const horizonSelect = document.createElement("select");
  [["short", p3.timeHorizonShort], ["long", p3.timeHorizonLong]].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    horizonSelect.append(opt);
  });
  horizonWrap.append(horizonSelect);
  card.append(titleElField.wrapper, titleEnField.wrapper, descElField.wrapper, descEnField.wrapper, horizonWrap);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const cancelBtn = el("button", "btn secondary", t.cancel);
  cancelBtn.type = "button";
  const submitBtn = el("button", "btn primary", t.save);
  submitBtn.type = "submit";
  actions.append(cancelBtn, submitBtn);
  card.append(actions);
  const close = () => overlay.remove();
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    try {
      await onSubmit({
        titleEl: titleElField.input.value.trim(),
        titleEn: titleEnField.input.value.trim(),
        descriptionEl: descElField.input.value.trim(),
        descriptionEn: descEnField.input.value.trim(),
        timeHorizon: horizonSelect.value,
      });
      close();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
      submitBtn.disabled = false;
    }
  });
  overlay.append(card);
  document.body.append(overlay);
}

// Step 1's card: relevance/support only -- no agree/disagree "vote" and no
// structured criteria, both of which belong to Step 2 instead.
function buildIdentifyOptionCard(option, lang, t, t2, p3, caseId, curator, onChanged) {
  const card = el("article", "vision-element-card option-card");
  const head = el("div", "vision-element-head");
  head.append(
    el(
      "span",
      `decision-status-pill ${option.source === "pespka" ? "status-draft" : "status-review"}`,
      option.source === "pespka" ? p3.sourcePespka : p3.sourceStakeholder
    )
  );
  if (option.time_horizon) {
    head.append(el("span", "decision-status-pill status-draft", option.time_horizon === "short" ? p3.timeHorizonShort : p3.timeHorizonLong));
  }
  card.append(head);
  card.append(el("h4", null, lang === "el" ? option.title_el : option.title_en));
  const body = lang === "el" ? option.description_el : option.description_en;
  if (body) card.append(el("p", "vision-element-body", body));
  if (option.source === "pespka" && option.pespka_evidence?.code) {
    card.append(el("p", "systems-explorer-empty-inline", `${p3.pespkaCode}: ${option.pespka_evidence.code}`));
  }

  const actions = el("div", "vision-element-actions");
  const agreeBtn = el("button", "btn secondary small contribution-vote contribution-vote-up", `↑ ${t2.forumUpvote} (${option.agree_count})`);
  agreeBtn.type = "button";
  agreeBtn.setAttribute("aria-label", `${t2.forumUpvote} (${option.agree_count})`);
  const disagreeBtn = el("button", "btn secondary small contribution-vote contribution-vote-down", `↓ ${t2.forumDownvote} (${option.disagree_count})`);
  disagreeBtn.type = "button";
  disagreeBtn.setAttribute("aria-label", `${t2.forumDownvote} (${option.disagree_count})`);
  const vote = (value) => {
    api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/vote`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }).then(() => {
      showToast({ type: "success", title: t2.forumVoteUpdated });
      onChanged();
    });
  };
  agreeBtn.addEventListener("click", () => vote("agree"));
  disagreeBtn.addEventListener("click", () => vote("disagree"));
  const replyBtn = el("button", "btn secondary small", `${t.reply} (${option.reply_count})`);
  replyBtn.type = "button";
  actions.append(agreeBtn, disagreeBtn, replyBtn);
  card.append(actions);

  // Reply always sits to the right of the other actions here, same as
  // elsewhere -- a lightweight discussion thread, not the structured
  // assessment.
  let repliesLoaded = false;
  const repliesBox = el("div", "vision-element-replies");
  repliesBox.style.display = "none";
  const replyForm = document.createElement("form");
  replyForm.className = "vision-element-reply-form";
  replyForm.style.display = "none";
  const replyInput = document.createElement("input");
  replyInput.placeholder = t2.forumReplyPlaceholder;
  const replySubmit = el("button", "btn primary small", t.send);
  replySubmit.type = "submit";
  replyForm.append(replyInput, replySubmit);
  const loadReplies = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/replies`);
    repliesBox.innerHTML = "";
    data.items.forEach((reply) => repliesBox.append(buildReplyRow(reply, t2)));
  };
  replyBtn.addEventListener("click", async () => {
    const show = repliesBox.style.display === "none";
    repliesBox.style.display = show ? "" : "none";
    replyForm.style.display = show ? "" : "none";
    if (show && !repliesLoaded) {
      await loadReplies();
      repliesLoaded = true;
    }
  });
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body2 = replyInput.value.trim();
    if (!body2) return;
    try {
      await api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/replies`, {
        method: "POST",
        body: JSON.stringify({ body: body2 }),
      });
      replyInput.value = "";
      showToast({ type: "success", title: t2.commentPosted });
      await loadReplies();
      onChanged();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });
  card.append(repliesBox, replyForm);
  return card;
}

async function renderIdentifyOptions(content, lang, t, t2, p3, caseId, user, curator) {
  content.innerHTML = "";
  content.append(el("p", "regional-tab-intro", p3.identifyQuestion));
  const addBtn = withPlusIcon(el("button", "btn secondary", p3.addNewOption));
  addBtn.type = "button";
  content.append(addBtn);
  const list = el("div", "vision-elements-container");
  content.append(list);

  const openForm = () => {
    buildNewOptionForm(t, t2, p3, {
      onSubmit: async (values) => {
        await api(`/cases/${encodeURIComponent(caseId)}/options`, { method: "POST", body: JSON.stringify(values) });
        showToast({ type: "success", title: t2.contributionAdded });
        await reload();
      },
    });
  };
  addBtn.addEventListener("click", openForm);

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/options`);
    list.innerHTML = "";
    if (!data.items.length) {
      list.append(buildEmptyState(t, { icon: "layers", title: p3.identifyEmptyTitle, description: p3.identifyEmptyDesc }));
      return;
    }
    data.items.forEach((option) => list.append(buildIdentifyOptionCard(option, lang, t, t2, p3, caseId, curator, reload)));
  };
  await reload();
}

// Structured-assessment/evaluation forms open in a popup, same modal shell
// as every other create/edit form in the app -- an inline expansion here
// pushed the card's own discussion thread further down the page every time.
function openFormModal(title, buildForm) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const card = document.createElement("div");
  card.className = "modal-card option-assessment-modal";
  card.append(el("h2", null, title));
  const close = () => overlay.remove();
  card.append(buildForm(close));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.append(card);
  document.body.append(overlay);
  return close;
}

function buildAssessmentForm(option, lang, t, t2, p3, onSubmit, onCancel) {
  const form = document.createElement("form");
  form.className = "option-assessment-form";
  const criteria = [
    ["effectiveness", p3.effectivenessLabel, p3.effectivenessQuestion],
    ["feasibility", p3.feasibilityLabel, p3.feasibilityQuestion],
    ["coBenefits", p3.coBenefitsLabel, p3.coBenefitsQuestion],
    ["transformativePotential", p3.transformativeLabel, p3.transformativeQuestion],
  ];
  const selects = {};
  criteria.forEach(([key, label, question]) => {
    const wrap = el("label", "systems-explorer-field option-assessment-criterion");
    const strong = el("strong", null, label);
    wrap.append(strong, el("span", "systems-explorer-empty-inline", question));
    const select = document.createElement("select");
    select.required = true;
    [["low", p3.levelLow], ["medium", p3.levelMedium], ["high", p3.levelHigh]].forEach(([value, text]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      if (option.my_assessment?.[key === "coBenefits" ? "co_benefits" : key === "transformativePotential" ? "transformative_potential" : key] === value) opt.selected = true;
      select.append(opt);
    });
    wrap.append(select);
    form.append(wrap);
    selects[key] = select;
  });

  const robustWrap = el("label", "systems-explorer-field option-assessment-criterion");
  robustWrap.append(el("strong", null, p3.robustLabel), el("span", "systems-explorer-empty-inline", p3.robustQuestion));
  const robustSelect = document.createElement("select");
  robustSelect.required = true;
  [["most", p3.robustMost], ["some", p3.robustSome], ["dependent", p3.robustDependent]].forEach(([value, text]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (option.my_assessment?.robust_across_futures === value) opt.selected = true;
    robustSelect.append(opt);
  });
  robustWrap.append(robustSelect);
  form.append(robustWrap);

  const commentWrap = el("label", "systems-explorer-field");
  commentWrap.append(p3.assessmentCommentLabel);
  const commentInput = document.createElement("textarea");
  commentInput.value = option.my_assessment?.comment || "";
  commentWrap.append(commentInput);
  form.append(commentWrap);

  const actions = el("div", "modal-actions");
  const cancelBtn = el("button", "btn secondary", t.cancel);
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => onCancel?.());
  const submitBtn = el("button", "btn primary", p3.submitAssessment);
  submitBtn.type = "submit";
  actions.append(cancelBtn, submitBtn);
  form.append(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    try {
      await onSubmit({
        effectiveness: selects.effectiveness.value,
        feasibility: selects.feasibility.value,
        coBenefits: selects.coBenefits.value,
        transformativePotential: selects.transformativePotential.value,
        robustAcrossFutures: robustSelect.value,
        comment: commentInput.value.trim(),
      });
      showToast({ type: "success", title: p3.assessmentSaved });
    } catch (error) {
      showToast({ type: "error", title: p3.assessmentSaved, message: error.message });
    } finally {
      submitBtn.disabled = false;
    }
  });
  return form;
}

function buildAssessOptionCard(option, lang, t, t2, p3, caseId, onChanged) {
  const card = el("article", "vision-element-card option-card");
  if (option.time_horizon) {
    const head = el("div", "vision-element-head");
    head.append(el("span", "decision-status-pill status-draft", option.time_horizon === "short" ? p3.timeHorizonShort : p3.timeHorizonLong));
    card.append(head);
  }
  card.append(el("h4", null, lang === "el" ? option.title_el : option.title_en));

  const infoBtn = el("button", "btn secondary small", p3.moreInformation);
  infoBtn.type = "button";
  infoBtn.addEventListener("click", () => document.body.append(buildOptionInfoModal(option, lang, t, t2, p3)));
  card.append(infoBtn);

  if (option.assessment_count > 0 && option.collective_assessment) {
    const c = option.collective_assessment;
    const table = document.createElement("table");
    table.className = "regional-mapping-table option-collective-table";
    table.innerHTML = "<tbody></tbody>";
    [
      [p3.effectivenessLabel, levelLabel(p3, c.effectiveness)],
      [p3.feasibilityLabel, levelLabel(p3, c.feasibility)],
      [p3.coBenefitsLabel, levelLabel(p3, c.co_benefits)],
      [p3.transformativeLabel, levelLabel(p3, c.transformative_potential)],
      [p3.robustLabel, robustLabel(p3, c.robust_across_futures)],
    ].forEach(([label, value]) => {
      const row = table.tBodies[0].insertRow();
      row.insertCell().textContent = label;
      row.insertCell().textContent = value;
    });
    const wrap = el("div", "option-collective-wrap");
    wrap.append(el("p", "systems-explorer-empty-inline", `${p3.collectiveAssessment} (${p3.assessmentCount(option.assessment_count)})`), table);
    card.append(wrap);
  }

  const toggleBtn = el("button", `btn ${option.my_assessment ? "secondary" : "primary"} small option-assessment-toggle`, option.my_assessment ? p3.yourAssessment : p3.submitAssessment);
  toggleBtn.type = "button";
  toggleBtn.addEventListener("click", () => {
    openFormModal(option.my_assessment ? p3.yourAssessment : p3.submitAssessment, (close) =>
      buildAssessmentForm(
        option,
        lang,
        t,
        t2,
        p3,
        async (payload) => {
          await api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/assessments`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          close();
          onChanged();
        },
        close
      )
    );
  });
  card.append(toggleBtn);

  // Same lightweight discussion thread as the Identify card -- agree/
  // disagree plus replies, kept separate from the structured assessment.
  const actions = el("div", "vision-element-actions");
  const agreeBtn = el("button", "btn secondary small contribution-vote contribution-vote-up", `↑ ${t2.forumUpvote} (${option.agree_count})`);
  agreeBtn.type = "button";
  agreeBtn.setAttribute("aria-label", `${t2.forumUpvote} (${option.agree_count})`);
  const disagreeBtn = el("button", "btn secondary small contribution-vote contribution-vote-down", `↓ ${t2.forumDownvote} (${option.disagree_count})`);
  disagreeBtn.type = "button";
  disagreeBtn.setAttribute("aria-label", `${t2.forumDownvote} (${option.disagree_count})`);
  const vote = (value) => {
    api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/vote`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }).then(() => {
      showToast({ type: "success", title: t2.forumVoteUpdated });
      onChanged();
    });
  };
  agreeBtn.addEventListener("click", () => vote("agree"));
  disagreeBtn.addEventListener("click", () => vote("disagree"));
  const replyBtn = el("button", "btn secondary small", `${t.reply} (${option.reply_count})`);
  replyBtn.type = "button";
  actions.append(agreeBtn, disagreeBtn, replyBtn);
  card.append(actions);

  const repliesBox = el("div", "case-phase-forum-replies");
  const replyForm = document.createElement("form");
  replyForm.className = "vision-element-reply-form";
  replyForm.hidden = true;
  const replyInput = document.createElement("input");
  replyInput.placeholder = t2.forumReplyPlaceholder;
  const replySubmit = el("button", "btn primary small", t.send);
  replySubmit.type = "submit";
  replyForm.append(replyInput, replySubmit);
  const loadReplies = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/replies`);
    repliesBox.innerHTML = "";
    data.items.forEach((reply) => repliesBox.append(buildReplyRow(reply, t2)));
  };
  loadReplies();
  replyBtn.addEventListener("click", () => {
    replyForm.hidden = !replyForm.hidden;
    if (!replyForm.hidden) replyInput.focus();
  });
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = replyInput.value.trim();
    if (!body) return;
    try {
      await api(`/cases/${encodeURIComponent(caseId)}/options/${encodeURIComponent(option.id)}/replies`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      replyInput.value = "";
      showToast({ type: "success", title: t2.commentPosted });
      await loadReplies();
      onChanged();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });
  card.append(repliesBox, replyForm);

  return card;
}

function buildPriorityExplanation(option, lang, p3, rank) {
  const wrap = el("div", "option-priority-explanation");
  wrap.append(el("h5", null, p3.priorityRank(rank)));
  const c = option.collective_assessment;
  const overall = c ? levelLabel(p3, [c.effectiveness, c.feasibility, c.co_benefits, c.transformative_potential].sort()[1] || c.effectiveness) : "";
  wrap.append(el("p", null, `${p3.overallAssessment}: ${overall}`));
  const strengths = c
    ? [
        ["effectiveness", p3.effectivenessLabel],
        ["co_benefits", p3.coBenefitsLabel],
        ["transformative_potential", p3.transformativeLabel],
        ["feasibility", p3.feasibilityLabel],
      ]
        .filter(([key]) => c[key] === "high")
        .map(([, label]) => label)
    : [];
  if (strengths.length) {
    wrap.append(el("p", "systems-explorer-empty-inline", `${p3.strongestAreas}: ${strengths.join(", ")}`));
  }
  if (option.time_horizon) {
    wrap.append(
      el(
        "p",
        "systems-explorer-empty-inline",
        `${lang === "el" ? "Χρονικός ορίζοντας" : "Time horizon"}: ${option.time_horizon === "short" ? p3.timeHorizonShort : p3.timeHorizonLong}`
      )
    );
  }
  if (c?.robust_across_futures) {
    wrap.append(el("p", "systems-explorer-empty-inline", `${p3.robustLabel}: ${robustLabel(p3, c.robust_across_futures)}`));
  }
  return wrap;
}

async function renderAssessOptions(content, lang, t, t2, p3, caseId) {
  content.innerHTML = "";
  content.append(el("p", "regional-tab-intro", p3.assessQuestion));
  const list = el("div", "vision-elements-container");
  content.append(list);
  const prioritySection = el("section", "systems-explorer-panel");
  prioritySection.append(el("h3", null, p3.prioritisedTitle), el("p", "systems-explorer-empty-inline", p3.prioritisedIntro));
  const priorityList = el("div", "option-priority-list");
  prioritySection.append(priorityList);
  content.append(prioritySection);

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/options`);
    const items = data.items;
    list.innerHTML = "";
    if (!items.length) {
      list.append(buildEmptyState(t, { icon: "layers", title: p3.assessEmptyTitle, description: p3.assessEmptyDesc }));
    } else {
      items.forEach((option) => list.append(buildAssessOptionCard(option, lang, t, t2, p3, caseId, reload)));
    }

    const assessed = items.filter((option) => option.assessment_count > 0).sort((a, b) => b.priority_score - a.priority_score);
    priorityList.innerHTML = "";
    if (!assessed.length) {
      priorityList.append(el("p", "systems-explorer-empty", p3.noAssessedYet));
    } else {
      assessed.forEach((option, index) => {
        const row = el("div", "option-priority-row");
        row.append(el("strong", null, lang === "el" ? option.title_el : option.title_en));
        row.append(buildPriorityExplanation(option, lang, p3, index + 1));
        priorityList.append(row);
      });
    }
  };
  await reload();
}

async function renderOptions(content, lang, t, t2, caseId, user, curator) {
  const p3 = P3[lang];
  content.innerHTML = "";
  content.append(el("p", "regional-tab-intro", p3.coreQuestion));

  const tabs = el("div", "regional-tabs case-options-tabs");
  const body = el("div", "case-options-tab-body");
  let activeTab = "identify";
  const renderBody = () => {
    tabs.querySelectorAll("button").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === activeTab));
    if (activeTab === "identify") renderIdentifyOptions(body, lang, t, t2, p3, caseId, user, curator);
    else renderAssessOptions(body, lang, t, t2, p3, caseId);
  };
  [["identify", p3.identifyStep], ["assess", p3.assessStep]].forEach(([key, label]) => {
    const button = el("button", key === activeTab ? "active" : "", label);
    button.type = "button";
    button.dataset.tab = key;
    button.addEventListener("click", () => {
      activeTab = key;
      renderBody();
    });
    tabs.append(button);
  });
  content.append(tabs, body);
  renderBody();
}

// ---------------------------------------------------------------------------
// Step 6: Alternative Pathways, assembled from Adaptation Options
// ---------------------------------------------------------------------------

// A Short -> Medium -> Long-term read of a pathway's included measures.
// Bucketing is derived from each measure's own time_horizon (set back in
// Identify), not stored on the pathway itself.
function buildPathwayTimeline(options, lang, t2) {
  const p3 = P3[lang];
  const columns = [
    ["short", t2.timeHorizonShort],
    ["medium", t2.timeHorizonMedium],
    ["long", t2.timeHorizonLong],
  ];
  const bucketOf = (o) => (o.time_horizon === "short" ? "short" : o.time_horizon === "long" ? "long" : "medium");
  const timeline = el("div", "pathway-timeline");
  columns.forEach(([bucket, label]) => {
    const col = el("div", "pathway-timeline-column");
    col.append(el("span", "pathway-timeline-label", label));
    const chips = el("div", "pathway-timeline-chips");
    const inBucket = options.filter((o) => bucketOf(o) === bucket);
    if (!inBucket.length) {
      chips.append(el("span", "pathway-timeline-empty", "–"));
    } else {
      inBucket.forEach((o) => {
        const chip = el("span", "pathway-timeline-chip");
        if (o.category) chip.append(el("span", "pathway-timeline-chip-category", p3.categories[o.category] || o.category));
        chip.append(document.createTextNode(lang === "el" ? o.title_el : o.title_en));
        chips.append(chip);
      });
    }
    col.append(chips);
    timeline.append(col);
  });
  return timeline;
}

// Formulate Adaptation Pathways (Design Portfolio of Interventions, sub-tab
// 1): the methodology doc's ask for this card is deliberately small --
// title, the prioritised measures it's built from, an optional image. The
// old Pathway model's extra free-text fields (sequence-of-interventions,
// dependencies, trade-offs, transformative potential, decision points) and
// its "preferred direction" status belong to the later Compare/Outcome
// steps that read this same data, not to this card -- shown there instead
// of duplicated here.
function buildPathwayCard(p, lang, t, t2, caseId, curator, { onChanged, onEdit }) {
  const card = el("article", "feature-card pathway-card");
  const head = el("div", "systems-explorer-section-head");
  head.append(el("h4", null, lang === "el" ? p.title_el : p.title_en));
  card.append(head);
  const desc = lang === "el" ? p.short_description_el : p.short_description_en;
  if (desc) card.append(el("p", "challenge-card-desc", desc));
  if (p.time_horizon) card.append(el("p", "systems-explorer-empty-inline", `${t2.timeHorizonLabel}: ${p.time_horizon}`));
  // A pathway is a SEQUENCE of measures, but the methodology asks for a
  // visual read of WHEN each one lands, not just a numbered list -- so the
  // included measures are laid out on a Short/Medium/Long-term timeline.
  // Each measure carries its own short/long time_horizon from the Identify
  // step; one with neither tag falls into the medium-term middle column
  // (the model has no explicit "medium" tag of its own). The Portfolio
  // category (if any) still shows on each chip.
  if (p.options.length) {
    card.append(el("p", "pathway-section-label", t2.pathwayOptionsIncluded));
    card.append(buildPathwayTimeline(p.options, lang, t2));
  }

  if (p.image_url) {
    const figure = document.createElement("figure");
    figure.className = "case-toc-image";
    const img = document.createElement("img");
    img.src = p.image_url;
    img.alt = "";
    img.loading = "lazy";
    figure.append(img);
    card.append(figure);
  }

  // One compact action row -- Edit, preferred-direction, Comments -- instead
  // of each button stacking full-width down the card.
  const actions = el("div", "vision-element-actions");
  if (onEdit) {
    const editBtn = el("button", "btn secondary small", t2.editPathway);
    editBtn.type = "button";
    editBtn.addEventListener("click", () => onEdit(p));
    actions.append(editBtn);
  }
  if (curator && p.status !== "preferred" && p.status !== "combined") {
    const markBtn = el("button", "btn secondary small", t.markPreferred);
    markBtn.type = "button";
    markBtn.addEventListener("click", async () => {
      try {
        await api(`/pathways/${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ status: "preferred" }) });
        onChanged();
      } catch (error) {
        showToast({ type: "error", title: t.createdError, message: error.message });
      }
    });
    actions.append(markBtn);
  }
  if (p.status === "preferred" || p.status === "combined") actions.append(el("span", "decision-status-pill status-draft", t.preferredBadge));

  // Stakeholder discussion per pathway -- "comment on individual
  // interventions, comment on the overall pathway" (spec).
  const commentsToggle = el("button", "btn secondary small", t.comments);
  commentsToggle.type = "button";
  actions.append(commentsToggle);
  card.append(actions);
  const commentsBox = el("div", "vision-element-replies");
  commentsBox.style.display = "none";
  const commentForm = document.createElement("form");
  commentForm.className = "vision-element-reply-form";
  commentForm.style.display = "none";
  const commentInput = document.createElement("input");
  commentInput.placeholder = t.commentPlaceholder;
  const commentSendBtn = el("button", "btn primary small", t.send);
  commentSendBtn.type = "submit";
  commentForm.append(commentInput, commentSendBtn);
  card.append(commentsBox, commentForm);

  let commentsLoaded = false;
  const loadComments = async () => {
    const data = await api(`/pathways/${encodeURIComponent(p.id)}/comments`);
    commentsBox.innerHTML = "";
    data.items.forEach((c) => {
      const line = el("p", "vision-element-reply");
      line.innerHTML = `<b></b> `;
      line.querySelector("b").textContent = `${c.author_name}:`;
      line.append(document.createTextNode(c.body));
      commentsBox.append(line);
    });
    commentsToggle.textContent = `${t.comments} (${data.items.length})`;
    commentsLoaded = true;
  };
  commentsToggle.addEventListener("click", async () => {
    const show = commentsBox.style.display === "none";
    commentsBox.style.display = show ? "" : "none";
    commentForm.style.display = show ? "" : "none";
    if (show && !commentsLoaded) await loadComments();
  });
  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = commentInput.value.trim();
    if (!body) return;
    try {
      await api(`/pathways/${encodeURIComponent(p.id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      commentInput.value = "";
      showToast({ type: "success", title: t2.commentPosted });
      await loadComments();
    } catch (error) {
      showToast({ type: "error", title: t.createdError, message: error.message });
    }
  });
  loadComments();

  return card;
}

async function renderPathways(content, lang, t, t2, caseId, curator) {
  content.innerHTML = "";
  content.append(el("p", "regional-tab-intro", P3[lang].formulateQuestion));
  const newBtn = withPlusIcon(el("button", "btn secondary", t.newPathway));
  newBtn.type = "button";
  content.append(newBtn);
  const list = el("div", "pathways-grid");
  content.append(list);

  // "The tool takes the prioritised options from Tab 1 -- also based on the
  // earlier prioritisation feature." Two things can mark an option
  // prioritised: it went through the current Identify/Assess flow (assessed,
  // ranked by score), or it carries the earlier "ready for pathway" flag from
  // before that flow existed. Either way, the picker offers only prioritised
  // options -- never every identified one -- so nothing here needs the
  // measure re-typed.
  const [optionsData] = await Promise.all([api(`/cases/${encodeURIComponent(caseId)}/options`)]);
  const assessedOptions = optionsData.items
    .filter((o) => o.assessment_count > 0)
    .sort((a, b) => b.priority_score - a.priority_score);
  const legacyReadyOptions = optionsData.items.filter(
    (o) => o.ready_for_pathway && !assessedOptions.some((a) => a.id === o.id)
  );
  const prioritisedOptions = [...assessedOptions, ...legacyReadyOptions];

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/pathways`);
    list.innerHTML = "";
    if (!data.items.length) {
      list.append(
        buildStepEmptyState(t, t2, {
          icon: "route",
          title: t.pathwaysEmptyTitle,
          description: t.pathwaysEmptyDesc,
          curator: true,
          curatorLabel: t.newPathway,
          onCurator: () => openForm(),
        })
      );
      return;
    }
    data.items.forEach((p) => list.append(buildPathwayCard(p, lang, t, t2, caseId, curator, { onChanged: reload, onEdit: (pathway) => openForm(pathway) })));
  };

  // A Pathway is "a combination AND SEQUENCE of measures/actions and decision
  // points" (journey doc), and it must stay editable as stakeholders discuss
  // it -- so this same form serves both create and edit, and the selected
  // measures are ordered by the author rather than by creation order.
  const openForm = (existing) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
    overlay.setAttribute("data-no-localize", "true");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const card = document.createElement("form");
    card.className = "modal-card";
    card.append(el("h2", null, existing ? t2.editPathwayTitle : t.newPathwayTitle));

    const field = (label, name, opts, value) => buildTextField(label, name, { ...opts, value: value || "" });
    const titleElField = field(`${t.titleLabel} (EL)`, "titleEl", { required: true }, existing?.title_el);
    const titleEnField = field(`${t.titleLabel} (EN)`, "titleEn", { required: true }, existing?.title_en);
    const descElField = field(`${t.shortDescriptionLabel} (EL)`, "shortDescriptionEl", { textarea: true }, existing?.short_description_el);
    const descEnField = field(`${t.shortDescriptionLabel} (EN)`, "shortDescriptionEn", { textarea: true }, existing?.short_description_en);
    const horizonField = field(t2.timeHorizonLabel, "timeHorizon", {}, existing?.time_horizon);
    card.append(titleElField.wrapper, titleEnField.wrapper, descElField.wrapper, descEnField.wrapper, horizonField.wrapper);

    // Measure picker + live ordered sequence. Ticking a measure appends it to
    // the sequence; the arrows set the real implementation order that is
    // persisted as pathway_options.sort_order.
    const optLabel = document.createElement("div");
    optLabel.className = "systems-explorer-field";
    optLabel.append(t2.selectOptionsLabel);
    const optPicker = document.createElement("div");
    optPicker.className = "systems-explorer-checkbox-group";
    const titleOf = (id) => {
      const o = optionsData.items.find((x) => x.id === id);
      return o ? (lang === "el" ? o.title_el : o.title_en) : id;
    };
    let sequence = existing ? existing.options.map((o) => o.id) : [];
    const categories = {};
    (existing?.options || []).forEach((o) => {
      if (o.category) categories[o.id] = o.category;
    });
    const p3 = P3[lang];

    const seqLabel = document.createElement("div");
    seqLabel.className = "systems-explorer-field";
    seqLabel.append(t2.sequenceLabel);
    const seqList = el("ol", "pathway-sequence-list");
    seqLabel.append(seqList, el("p", "systems-explorer-empty-inline", t2.sequenceHint));

    // A Portfolio groups complementary interventions by type -- tagging
    // each selected measure here is what buildPathwayCard later renders
    // grouped by category, rather than as one flat sequence.
    const buildCategorySelect = (optionId) => {
      const select = document.createElement("select");
      select.className = "pathway-sequence-category";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = p3.categoryLabel;
      select.append(placeholder);
      Object.entries(p3.categories).forEach(([value, label]) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        if (categories[optionId] === value) opt.selected = true;
        select.append(opt);
      });
      select.addEventListener("change", () => {
        if (select.value) categories[optionId] = select.value;
        else delete categories[optionId];
      });
      return select;
    };

    const renderSequence = () => {
      seqList.innerHTML = "";
      if (!sequence.length) {
        seqList.append(el("li", "systems-explorer-empty-inline", t2.noOptionsSelected));
        return;
      }
      sequence.forEach((id, index) => {
        const li = el("li", "pathway-sequence-item");
        li.append(el("span", "pathway-sequence-title", titleOf(id)), buildCategorySelect(id));
        const controls = el("span", "pathway-sequence-controls");
        const move = (delta) => {
          const to = index + delta;
          if (to < 0 || to >= sequence.length) return;
          const tmp = sequence[index];
          sequence[index] = sequence[to];
          sequence[to] = tmp;
          renderSequence();
        };
        const up = el("button", "btn secondary small", "\u25B2");
        up.type = "button";
        up.title = t2.moveUp;
        up.disabled = index === 0;
        up.addEventListener("click", () => move(-1));
        const down = el("button", "btn secondary small", "\u25BC");
        down.type = "button";
        down.title = t2.moveDown;
        down.disabled = index === sequence.length - 1;
        down.addEventListener("click", () => move(1));
        controls.append(up, down);
        li.append(controls);
        seqList.append(li);
      });
    };

    // Editing a pathway whose measure later dropped off the prioritised
    // list must still show it as already selected, rather than silently
    // vanish from the picker.
    const pickerOptions = [
      ...prioritisedOptions,
      ...optionsData.items.filter((o) => sequence.includes(o.id) && !prioritisedOptions.some((p) => p.id === o.id)),
    ];
    if (!pickerOptions.length) {
      optPicker.append(el("p", "systems-explorer-empty-inline", p3.noPrioritisedOptionsYet));
    }
    pickerOptions.forEach((o) => {
      const chk = document.createElement("label");
      chk.className = "systems-explorer-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = o.id;
      input.checked = sequence.includes(o.id);
      input.addEventListener("change", () => {
        if (input.checked) {
          if (!sequence.includes(o.id)) sequence.push(o.id);
        } else {
          sequence = sequence.filter((id) => id !== o.id);
        }
        renderSequence();
      });
      const assessedRank = assessedOptions.indexOf(o);
      const rankPrefix = assessedRank !== -1 ? `#${assessedRank + 1} · ` : "";
      const scoreSuffix = assessedRank !== -1 ? ` (${p3.overallAssessment}: ${o.priority_score})` : o.ready_for_pathway ? ` (${t2.readyForPathway})` : "";
      chk.append(input, document.createTextNode(`${rankPrefix}${lang === "el" ? o.title_el : o.title_en}${scoreSuffix}`));
      optPicker.append(chk);
    });
    optLabel.append(optPicker);
    card.append(optLabel, seqLabel);
    renderSequence();

    // "Formulate Adaptation Pathways": an optional workshop diagram image.
    // The old Pathway model's extra free-text fields (sequence-of-
    // interventions, dependencies, trade-offs, transformative potential,
    // decision points) are deliberately not collected here any more -- they
    // amounted to re-describing in prose what the selected measures above
    // already convey, which is exactly the re-typing this form should not
    // require. Existing pathways that still carry that legacy text keep it
    // (the PATCH below only touches fields actually present in this form).
    if (existing?.image_url) {
      const preview = document.createElement("img");
      preview.className = "case-toc-image-preview";
      preview.src = existing.image_url;
      preview.alt = "";
      card.append(preview);
    }
    const imageFileLabel = document.createElement("label");
    imageFileLabel.className = "systems-explorer-field";
    imageFileLabel.append(t2.tocImageLabel);
    const imageFileInput = document.createElement("input");
    imageFileInput.type = "file";
    imageFileInput.accept = "image/*";
    imageFileLabel.append(imageFileInput);
    card.append(imageFileLabel);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancelBtn = el("button", "btn secondary", t.cancel);
    cancelBtn.type = "button";
    const submitBtn = el("button", "btn primary", t.save);
    submitBtn.type = "submit";
    actions.append(cancelBtn, submitBtn);
    card.append(actions);
    const close = () => overlay.remove();
    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    card.addEventListener("submit", async (event) => {
      event.preventDefault();
      submitBtn.disabled = true;
      try {
        const body = {
          titleEl: titleElField.input.value.trim(),
          titleEn: titleEnField.input.value.trim(),
          shortDescriptionEl: descElField.input.value.trim(),
          shortDescriptionEn: descEnField.input.value.trim(),
          timeHorizon: horizonField.input.value.trim(),
          optionIds: sequence,
          optionCategories: categories,
        };
        if (imageFileInput.files[0]) body.imageKey = await uploadImageFile(imageFileInput.files[0]);
        if (existing) {
          await api(`/pathways/${encodeURIComponent(existing.id)}`, { method: "PATCH", body: JSON.stringify(body) });
        } else {
          await api(`/cases/${encodeURIComponent(caseId)}/pathways`, { method: "POST", body: JSON.stringify(body) });
        }
        showToast({ type: "success", title: t.createdTitle });
        close();
        await reload();
      } catch (error) {
        showToast({ type: "error", title: t.createdError, message: error.message });
        submitBtn.disabled = false;
      }
    });
    overlay.append(card);
    document.body.append(overlay);
  };

  newBtn.addEventListener("click", () => openForm());
  await reload();
}

// "Evaluate Pathways" -- Design Portfolio of Interventions, sub-tab 2. Its
// own six-criterion High/Medium/Low table, distinct from the existing
// 1-5 "Compare & Prioritise" step (kept, appended after this tab, since
// nothing here was asked to replace it).
const PATHWAY_EVALUATION_ROWS = [
  ["riskReduction", "risk_reduction", (p3) => p3.riskReductionLabel],
  ["feasibility", "feasibility", (p3) => p3.feasibilityLabel],
  ["cost", "cost", (p3) => p3.costLabel],
  ["coBenefits", "co_benefits", (p3) => p3.coBenefitsLabel],
  ["transformativePotential", "transformative_potential", (p3) => p3.transformativeLabel],
  ["flexibility", "flexibility", (p3) => p3.flexibilityLabel],
];

function buildPathwayEvaluationForm(pathway, t, p3, onSubmit, onCancel) {
  const form = document.createElement("form");
  form.className = "option-assessment-form";
  const selects = {};
  PATHWAY_EVALUATION_ROWS.forEach(([key, col, labelFn]) => {
    const wrap = el("label", "systems-explorer-field option-assessment-criterion");
    wrap.append(el("strong", null, labelFn(p3)));
    const select = document.createElement("select");
    select.required = true;
    [["low", p3.levelLow], ["medium", p3.levelMedium], ["high", p3.levelHigh]].forEach(([value, text]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      if (pathway.my_evaluation?.[col] === value) opt.selected = true;
      select.append(opt);
    });
    wrap.append(select);
    form.append(wrap);
    selects[key] = select;
  });
  const actions = el("div", "modal-actions");
  const cancelBtn = el("button", "btn secondary", t.cancel);
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => onCancel?.());
  const submitBtn = el("button", "btn primary", p3.submitEvaluation);
  submitBtn.type = "submit";
  actions.append(cancelBtn, submitBtn);
  form.append(actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    try {
      await onSubmit(Object.fromEntries(Object.entries(selects).map(([key, select]) => [key, select.value])));
      showToast({ type: "success", title: p3.evaluationSaved });
    } catch (error) {
      showToast({ type: "error", title: p3.evaluationSaved, message: error.message });
    } finally {
      submitBtn.disabled = false;
    }
  });
  return form;
}

async function renderEvaluatePathways(content, lang, t, t2, caseId) {
  const p3 = P3[lang];
  content.innerHTML = "";
  content.append(el("p", "regional-tab-intro", p3.evaluateQuestion));

  const reload = async () => {
    const data = await api(`/cases/${encodeURIComponent(caseId)}/pathways`);
    const pathways = data.items.filter((p) => p.status !== "archived");
    content.querySelectorAll(".evaluate-pathways-body").forEach((node) => node.remove());
    const body = el("div", "evaluate-pathways-body");
    content.append(body);
    if (!pathways.length) {
      body.append(buildEmptyState(t, { icon: "route", title: p3.noPathwaysYetForEvaluation, description: "" }));
      return;
    }

    const matrixSection = el("section", "systems-explorer-panel evaluate-matrix-panel");
    matrixSection.append(el("h3", null, p3.evaluateMatrixTitle));
    const wrapper = document.createElement("div");
    wrapper.className = "systems-explorer-table-wrapper";
    const table = document.createElement("table");
    table.className = "systems-explorer-comparison-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(document.createElement("th"));
    pathways.forEach((p) => {
      const th = document.createElement("th");
      th.textContent = lang === "el" ? p.title_el : p.title_en;
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);
    const tbody = document.createElement("tbody");
    PATHWAY_EVALUATION_ROWS.forEach(([, col, labelFn]) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = labelFn(p3);
      tr.append(th);
      pathways.forEach((p) => {
        const td = document.createElement("td");
        const value = p.collective_evaluation?.[col];
        td.append(el("span", `evaluate-matrix-value${value ? ` evaluate-matrix-value-${value}` : ""}`, value ? levelLabel(p3, value) : "–"));
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(tbody);
    wrapper.append(table);
    matrixSection.append(wrapper);
    body.append(matrixSection);

    // The automatic ranking itself now lives in its own tab (Pathway
    // Ranking), which reads this same evaluation data -- this tab stays
    // focused on entering and reading the matrix.
    const formsSection = el("section", "systems-explorer-panel");
    formsSection.append(el("h3", null, p3.evaluateStep));
    pathways.forEach((p) => {
      const card = el("article", "vision-element-card option-card");
      card.append(el("h4", null, lang === "el" ? p.title_el : p.title_en));
      const toggleBtn = el("button", `btn ${p.my_evaluation ? "secondary" : "primary"} small option-assessment-toggle`, p.my_evaluation ? p3.yourAssessment : p3.submitEvaluation);
      toggleBtn.type = "button";
      toggleBtn.addEventListener("click", () => {
        openFormModal(p.my_evaluation ? p3.yourAssessment : p3.submitEvaluation, (close) =>
          buildPathwayEvaluationForm(
            p,
            t,
            p3,
            async (payload) => {
              await api(`/pathways/${encodeURIComponent(p.id)}/evaluations`, { method: "POST", body: JSON.stringify(payload) });
              close();
              await reload();
            },
            close
          )
        );
      });
      card.append(toggleBtn);
      formsSection.append(card);
    });
    body.append(formsSection);
  };
  await reload();
}

// "Pathway Ranking" -- Design Portfolio of Interventions, sub-tab 3. Reads
// the same evaluation data as the Evaluate Pathways matrix and turns each
// pathway's transparent score (High=3/Medium=2/Low=1, summed across the six
// criteria, max 18) into a percentage, an ordered ranking, and a
// strengths/weaknesses read-out -- refreshed every time this tab renders, so
// it always reflects the latest evaluations.
const PATHWAY_EVALUATION_MAX_SCORE = PATHWAY_EVALUATION_ROWS.length * 3;

function buildPathwayRankingRow(p, lang, p3, rank, isTop) {
  const percentage = Math.round((p.evaluation_score / PATHWAY_EVALUATION_MAX_SCORE) * 100);
  const row = el("article", `option-priority-row pathway-ranking-row${isTop ? " pathway-ranking-row-top" : ""}`);
  const head = el("div", "pathway-ranking-head");
  head.append(el("strong", null, `${rank}. ${lang === "el" ? p.title_el : p.title_en}`));
  if (isTop) head.append(el("span", "decision-status-pill status-validated", p3.rankingTopBadge));
  head.append(el("span", "pathway-ranking-score", `${percentage}%`));
  row.append(head);

  const barTrack = el("div", "pathway-ranking-bar-track");
  const bar = el("div", "pathway-ranking-bar");
  bar.style.width = `${percentage}%`;
  barTrack.append(bar);
  row.append(barTrack);

  const c = p.collective_evaluation;
  if (c) {
    const strengths = PATHWAY_EVALUATION_ROWS.filter(([, col]) => c[col] === "high").map(([, , labelFn]) => labelFn(p3));
    const weaknesses = PATHWAY_EVALUATION_ROWS.filter(([, col]) => c[col] === "low").map(([, , labelFn]) => labelFn(p3));
    if (strengths.length) {
      const line = el("p", "systems-explorer-empty-inline pathway-ranking-strengths");
      line.innerHTML = `<b></b> `;
      line.querySelector("b").textContent = `${p3.rankingStrengths}: `;
      line.append(document.createTextNode(strengths.join(", ")));
      row.append(line);
    }
    if (weaknesses.length) {
      const line = el("p", "systems-explorer-empty-inline pathway-ranking-weaknesses");
      line.innerHTML = `<b></b> `;
      line.querySelector("b").textContent = `${p3.rankingWeaknesses}: `;
      line.append(document.createTextNode(weaknesses.join(", ")));
      row.append(line);
    }
  }
  return row;
}

async function renderPathwayRanking(content, lang, t, t2, caseId) {
  const p3 = P3[lang];
  content.innerHTML = "";
  content.append(el("p", "regional-tab-intro", p3.rankingIntro));

  const rankingSection = el("section", "systems-explorer-panel");
  rankingSection.append(el("h3", null, p3.pathwayRankingTitle));
  const data = await api(`/cases/${encodeURIComponent(caseId)}/pathways`);
  const pathways = data.items.filter((p) => p.status !== "archived");
  const evaluated = pathways.filter((p) => p.evaluation_count > 0).sort((a, b) => b.evaluation_score - a.evaluation_score);
  if (!evaluated.length) {
    rankingSection.append(el("p", "systems-explorer-empty", pathways.length ? p3.noEvaluatedYet : p3.noPathwaysYetForEvaluation));
  } else {
    const list = el("div", "pathway-ranking-list");
    evaluated.forEach((p, index) => list.append(buildPathwayRankingRow(p, lang, p3, index + 1, index === 0)));
    rankingSection.append(list);
  }
  content.append(rankingSection);
}

async function renderPortfolioTab(content, lang, t, t2, caseId, user, curator) {
  const p3 = P3[lang];
  content.innerHTML = "";
  const tabs = el("div", "regional-tabs case-options-tabs");
  const body = el("div", "case-options-tab-body");
  let activeTab = "formulate";
  const renderBody = () => {
    tabs.querySelectorAll("button").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === activeTab));
    if (activeTab === "formulate") renderPathways(body, lang, t, t2, caseId, curator);
    else if (activeTab === "evaluate") renderEvaluatePathways(body, lang, t, t2, caseId);
    else renderPathwayRanking(body, lang, t, t2, caseId);
  };
  [
    ["formulate", p3.formulateStep],
    ["evaluate", p3.evaluateStep],
    ["ranking", p3.rankingStep],
  ].forEach(([key, label]) => {
    const button = el("button", key === activeTab ? "active" : "", label);
    button.type = "button";
    button.dataset.tab = key;
    button.addEventListener("click", () => {
      activeTab = key;
      renderBody();
    });
    tabs.append(button);
  });
  content.append(tabs, body);
  renderBody();
}

