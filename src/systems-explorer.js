// @ts-nocheck -- generic-Element DOM patching, same rationale as the
// @ts-nocheck at the top of runtime-enhancements.js.
// Priority Systems — the platform's journey entry point. It deliberately
// stays an orientation-and-routing surface: System -> relevant Climate
// Impact -> Case Study. Reference RCCAP context is shown once, the selected
// impact reveals only its own evidence and cases, and the full co-creation
// tools remain in the Case Study workspace where roles and permissions are
// enforced. This avoids the earlier "dashboard of everything" experience.
// It does NOT rely on the vendored bundle recognising ?view=systems/
// ?view=system — confirmed live that its router doesn't just fall back
// gracefully on an unrecognised `view`, it actively redirects to home AND
// strips any extra query params it doesn't know about (so even riding on a
// whitelisted host view plus custom params, e.g. ?view=cases&explorer=
// systems, gets silently cleaned back down to ?view=cases within one
// render pass). Explorer navigation therefore uses module state mirrored to
// sessionStorage: transitions are immediate and the selected system/impact
// survives a refresh in the same tab, although it cannot be a shareable URL
// until the vendored router itself supports the route. Reuses the bundle's
// own visual tokens rather than inventing a parallel design system.

function currentLanguage() {
  const value = document.querySelector(".language")?.textContent || "";
  return /EN/i.test(value) ? "en" : "el";
}

let explorerState = null; // { view: "systems"|"system", id?: string, impactId?: string }
const PENDING_EXPLORER_KEY = "adapttica:pending-systems-explorer";
const ACTIVE_EXPLORER_KEY = "adapttica:active-systems-explorer";
const NATIVE_ACTIVE_SUPPRESSED = "systems-explorer-suppressed-active";

function currentExplorerView() {
  return explorerState?.view || "";
}

function currentExplorerId() {
  return explorerState?.id || "";
}

function navigateToExplorer(subview, id, impactId) {
  explorerState = { view: subview, id, impactId };
  sessionStorage.setItem(ACTIVE_EXPLORER_KEY, JSON.stringify(explorerState));
  syncSystemsExplorer();
}

function consumePendingExplorerNavigation() {
  if (explorerState) return;
  const nativeView = new URLSearchParams(location.search).get("view") || "home";
  if (nativeView !== "home") return;
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_EXPLORER_KEY) || "null");
    const active = JSON.parse(sessionStorage.getItem(ACTIVE_EXPLORER_KEY) || "null");
    if (pending?.view === "system" && pending.id) explorerState = pending;
    else if (pending?.view === "systems") explorerState = { view: "systems" };
    else if (["systems", "system"].includes(active?.view)) explorerState = active;
    if (explorerState) sessionStorage.setItem(ACTIVE_EXPLORER_KEY, JSON.stringify(explorerState));
  } catch {
    // A malformed value must never block normal navigation.
  } finally {
    sessionStorage.removeItem(PENDING_EXPLORER_KEY);
  }
}

// Exits the explorer entirely and opens a real native page (e.g. a linked
// case study) — clears explorerState first so a stray re-render doesn't
// resurrect the overlay mid-navigation.
function navigateToNative(view, id, { rememberExplorer = false } = {}) {
  // The in-memory state is always cleared so a stray re-render can't
  // resurrect the overlay mid-navigation. The stored state is kept when the
  // user is stepping *into* a Case Study, so the browser Back button returns
  // them to the System/Impact they came from rather than a bare homepage.
  explorerState = null;
  if (!rememberExplorer) sessionStorage.removeItem(ACTIVE_EXPLORER_KEY);
  const params = new URLSearchParams();
  params.set("view", view);
  if (id) params.set("id", id);
  window.location.href = `${location.pathname}?${params.toString()}`;
}

function explorerToastStack() {
  let stack = document.querySelector(".runtime-toast-stack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.className = "runtime-toast-stack";
  stack.setAttribute("aria-live", "polite");
  stack.setAttribute("data-no-localize", "true");
  document.body.append(stack);
  return stack;
}

function showToast({ type = "info", title, message = "" }) {
  const stack = explorerToastStack();
  const toast = document.createElement("div");
  toast.className = `runtime-toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span class="runtime-toast-mark" aria-hidden="true">${type === "success" ? "✓" : type === "error" ? "×" : "i"}</span>
    <span class="runtime-toast-copy"><strong></strong><span></span></span>
    <button type="button" class="runtime-toast-close">×</button>`;
  toast.querySelector("strong").textContent = title || "";
  toast.querySelector(".runtime-toast-copy > span").textContent = message;
  const dismiss = () => {
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 180);
  };
  toast.querySelector(".runtime-toast-close").addEventListener("click", dismiss);
  stack.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(dismiss, type === "error" ? 7000 : 5000);
}

// This module's own bilingual copy — kept local rather than spread across
// src/i18n.js given the sheer volume of feature-specific labels (systems,
// challenges, futures, vision elements, theory of change, pathways,
// comparison criteria), the same approach the (now-removed) custom guide
// content module used for its own large bilingual block.
const T = {
  el: {
    navLabel: "Συστήματα προτεραιότητας",
    closeExplorer: "Κλείσιμο",
    homeCardTitle: "Συστήματα προτεραιότητας",
    homeCardDescription: "Επιλέξτε το σύστημα που επηρεάζεται και εξερευνήστε τις σχετικές κλιματικές επιπτώσεις και μελέτες ανθεκτικότητας.",
    homeCardCta: "Εξερευνήστε τα συστήματα",
    systemsTitle: "Συστήματα προτεραιότητας",
    systemsSubtitle: "Ξεκινήστε επιλέγοντας το σύστημα που επηρεάζεται από την πρόκληση ανθεκτικότητας. Στη συνέχεια θα δείτε τις σχετικές κλιματικές επιπτώσεις και μελέτες περίπτωσης.",
    challengesCount: (n) => `${n} ${n === 1 ? "πρόκληση" : "προκλήσεις"}`,
    impactCountLabel: (n) => `${n} ${n === 1 ? "επίπτωση" : "επιπτώσεις"}`,
    caseStudyCountLabel: (n) => `${n} ${n === 1 ? "μελέτη περίπτωσης" : "μελέτες περίπτωσης"}`,
    pathwayCountLabel: (n) => `${n} ${n === 1 ? "διαδρομή" : "διαδρομές"}`,
    horizontalBadge: "Οριζόντιο σύστημα",
    challengesTitle: "Κλιματικές προκλήσεις",
    exploreSystem: "Εξερεύνηση συστήματος",
    linkedSystemsLabel: "Συνδεδεμένα συστήματα",
    newCaseStudy: "Νέα μελέτη περίπτωσης",
    newCaseStudyTitle: "Νέα μελέτη περίπτωσης",
    primarySystemLabel: "Κύριο σύστημα *",
    primaryImpactLabel: "Κύρια κλιματική επίπτωση *",
    selectSystemFirst: "Επιλέξτε πρώτα ένα σύστημα",
    noImpactsForSystem: "Δεν υπάρχουν ακόμη επιπτώσεις για αυτό το σύστημα. Ζητήστε από έναν διαχειριστή να προσθέσει μία.",
    areaLabel: "Γεωγραφική περιοχή",
    startDateLabel: "Ημερομηνία έναρξης",
    targetDateLabel: "Στόχος ολοκλήρωσης",
    saveAsDraftLabel: "Αποθήκευση ως πρόχειρο",
    hazardsLabel: "Κλιματικές πιέσεις",
    noChallenges: "Δεν υπάρχουν ακόμη προκλήσεις για αυτό το σύστημα.",
    challengesEmptyTitle: "Ας ξεκινήσουμε τον χάρτη ανθεκτικότητας",
    challengesEmptyDesc:
      "Καταγράψτε μια κλιματική πρόκληση αυτού του συστήματος — π.χ. πλημμύρες σε υποδομές ή λειψυδρία — για να ξεκινήσει η συνδημιουργία κοινού οράματος και διαδρομών προσαρμογής.",
    challengesEmptyNote:
      "Μόνο εκπρόσωποι, συντονιστές και διαχειριστές μπορούν να προσθέσουν μια πρόκληση. Επικοινωνήστε με την ομάδα συντονισμού αν θέλετε να προτείνετε μία.",
    impactsTitle: "Κλιματικές επιπτώσεις / Προκλήσεις ανθεκτικότητας",
    impactsEmptyTitle: "Δεν έχουν οριστεί ακόμη επιπτώσεις",
    impactsEmptyDesc: "Οι κλιματικές επιπτώσεις είναι μια σταθερή ταξινομία που διαχειρίζονται οι διαχειριστές της πλατφόρμας.",
    impactsEmptyNote: "Επικοινωνήστε με έναν διαχειριστή αν χρειάζεται να προστεθεί μια νέα επίπτωση για αυτό το σύστημα.",
    selectImpactPrompt: "Επιλέξτε μια επίπτωση παραπάνω για να δείτε τα συνδεδεμένα συστήματα, τις μελέτες περίπτωσης και τις διαδρομές προσαρμογής της.",
    primarySystemCaseStudies: "Κύριο σύστημα",
    linkedSystemCaseStudies: "Συνδεδεμένο σύστημα",
    noCaseStudiesForImpact: "Δεν έχουν συνδεθεί ακόμη μελέτες περίπτωσης με αυτή την επίπτωση.",
    relatedPathwaysTitle: "Αποτελέσματα Φάσης 3",
    noPathwaysForImpact: "Δεν έχουν αναπτυχθεί ακόμη διαδρομές προσαρμογής για αυτή την επίπτωση.",
    pathwayDevelopedIn: "Αναπτύχθηκε στη μελέτη περίπτωσης",
    p2rJourneyTitle: "Περιφερειακή Πορεία Ανθεκτικότητας",
    selectCaseStudyPrompt: "Επιλέξτε μελέτη περίπτωσης:",
    noPrimaryCaseStudyYet: "Δεν έχει δημιουργηθεί ακόμη μελέτη περίπτωσης για αυτή την επίπτωση.",
    whereAreWeNow: "Πού βρισκόμαστε τώρα;",
    systemVulnerabilities: "Βασικές τρωτότητες",
    systemRccapPriorities: "Προτεραιότητες ΠεΣΠΚΑ",
    noContextYet: "Δεν έχει καταγραφεί ακόμη περιγραφή.",
    systemStepEyebrow: "Σύστημα προτεραιότητας",
    systemHeroDescription: "Εξερευνήστε τις κύριες κλιματικές επιπτώσεις που επηρεάζουν αυτό το σύστημα και επιλέξτε μία πρόκληση για να ξεκινήσετε την πορεία ανθεκτικότητάς της.",
    journeyRouteTitle: "Η πορεία σας",
    routeSystem: "Επιλογή συστήματος",
    routeImpact: "Επιλογή πρόκλησης",
    routeCase: "Άνοιγμα μελέτης",
    routeComplete: "Ολοκληρώθηκε",
    routeCurrent: "Τώρα",
    routeNext: "Επόμενο",
    relevantImpactCount: (n) => `${n} ${n === 1 ? "σχετική πρόκληση" : "σχετικές προκλήσεις"}`,
    activeCaseCount: (n) => `${n} ${n === 1 ? "σχετική μελέτη" : "σχετικές μελέτες"}`,
    chooseImpactTitle: "Επιλέξτε μια κλιματική επίπτωση για να συνεχίσετε",
    chooseImpactDescription: "Τίποτα δεν είναι προεπιλεγμένο. Η επίπτωση που θα επιλέξετε ανοίγει τη δική της Πορεία Ανθεκτικότητας.",
    impactPrimaryRelationship: "Κύρια επίπτωση για το σύστημα",
    impactConnectedRelationship: "Διατομεακή επίπτωση",
    impactCaseCount: (n) => `${n} ${n === 1 ? "ενεργή μελέτη" : "ενεργές μελέτες"}`,
    inspectImpact: "Προβολή πορείας",
    impactFocusLabel: "Επιλεγμένη κλιματική πρόκληση",
    affectedSystems: "Συνδεδεμένα συστήματα",
    casesForImpactTitle: "Συνεχίστε την πορεία ανθεκτικότητας",
    casesForImpactDescription:
      "Επιλέξτε μια μελέτη ανθεκτικότητας για να δείτε την τρέχουσα φάση P2R, τα ολοκληρωμένα αποτελέσματα και το επόμενο βήμα συμμετοχής.",
    noCasesTitle: "Δεν υπάρχει ακόμη ενεργή μελέτη",
    noCasesDescription: "Η πρόκληση έχει οριστεί, αλλά δεν έχει ξεκινήσει ακόμη χώρος συνεργασίας. Η δημιουργία μελέτης περίπτωσης είναι διαθέσιμη μόνο σε διαχειριστές.",
    openJourney: "Άνοιγμα πορείας ανθεκτικότητας",
    backToImpact: "Πίσω στην επίπτωση",
    startJourney: "Ξεκινήστε την πορεία",
    startJourneyAdminOnly: "Μόνο διαχειριστές μπορούν να ξεκινήσουν νέα πορεία για αυτή την επίπτωση.",
    startJourneyNeedsHazard:
      "Προσθέστε πρώτα τουλάχιστον έναν κλιματικό κίνδυνο σε αυτή την πρόκληση, ώστε να μπορεί να ξεκινήσει πορεία.",
    journeyStarted: "Η πορεία ξεκίνησε",
    membersLabel: (n) => `${n} ${n === 1 ? "μέλος" : "μέλη"}`,
    casePhase1: "Προετοιμασία βάσης",
    casePhase2: "Κοινό όραμα",
    casePhase3: "Σχεδιασμός διαδρομών",
    phase3Output: "Αποτέλεσμα Φάσης 3",
    pathwaysAvailable: (n) => `${n} ${n === 1 ? "διαδρομή προσαρμογής" : "διαδρομές προσαρμογής"}`,
    phaseComplete: "Ολοκληρώθηκε",
    phaseCurrent: "Σε εξέλιξη",
    phaseUpcoming: "Επόμενη",
    caseStatusDraft: "Πρόχειρο",
    caseStatusInProgress: "Σε εξέλιξη",
    caseStatusUnderReview: "Σε ανασκόπηση",
    caseStatusApproved: "Εγκεκριμένη",
    caseStatusCompleted: "Ολοκληρωμένη",
    methodTitle: "Η δική σας πορεία ανθεκτικότητας",
    methodDescription:
      "Ακολουθήστε τις τρεις φάσεις P2R, από την επικυρωμένη κοινή βάση έως τη συμφωνημένη διαδρομή προσαρμογής.",
    methodStage1: "Κατανόηση της πρόκλησης",
    methodStage2: "Διαμόρφωση μετασχηματιστικού μέλλοντος",
    methodStage3: "Σχεδιασμός διαδρομών μετασχηματισμού",
    methodQuestion1: "Πού βρισκόμαστε τώρα;",
    methodQuestion2: "Πού θέλουμε να φτάσουμε;",
    methodQuestion3: "Πώς θα φτάσουμε εκεί;",
    methodPhase1Description:
      "Εξερευνήστε όσα είναι ήδη γνωστά για την πρόκληση: κλιματικούς κινδύνους, τρωτότητες, επηρεαζόμενα συστήματα, εμπλεκομένους, υφιστάμενα μέτρα, αλληλεξαρτήσεις συστημάτων και διαθέσιμη τεκμηρίωση.",
    methodPhase1Outcome: "Έξοδος: επικυρωμένη κοινή βάση",
    methodPhase2Description:
      "Διερευνήστε εναλλακτικά μέλλοντα, συμφωνήστε σε ένα κοινό όραμα και ορίστε τη Θεωρία Αλλαγής που απαιτείται για την επίτευξή του.",
    methodPhase2Outcome: "Έξοδος: κοινή κατεύθυνση αλλαγής",
    methodPhase3Description:
      "Αναπτύξτε και αξιολογήστε μέτρα προσαρμογής, συγκρίνετε εναλλακτικές διαδρομές και συμφωνήστε στην προτιμώμενη ή συνδυασμένη διαδρομή.",
    methodPhase3Outcome: "Έξοδος: τεκμηριωμένη απόφαση",
    methodStatus: "Κατάσταση",
    methodStatusComplete: "Ολοκληρώθηκε",
    methodPhasePrefix: "P2R Φάση",
    methodAction1: "Εξερευνήστε την τρέχουσα κατάσταση",
    methodAction2: "Διαμορφώστε το κοινό όραμα",
    methodAction3: "Εξερευνήστε τις διαδρομές προσαρμογής",
    methodBaselineReport: "Προβολή / Λήψη Αναφοράς Βάσης",
    newChallenge: "Νέα πρόκληση",
    newChallengeTitle: "Νέα πρόκληση (impact / resilience challenge)",
    titleLabel: "Τίτλος *",
    descriptionLabel: "Περιγραφή",
    cancel: "Ακύρωση",
    save: "Αποθήκευση",
    saving: "Αποθήκευση...",
    createdTitle: "Δημιουργήθηκε",
    createdError: "Κάτι πήγε στραβά",
    tabOverview: "Επισκόπηση",
    tabFutures: "Εναλλακτικά μέλλοντα",
    tabPathways: "Διαδρομές προσαρμογής",
    tabHistory: "Ιστορικό",
    linkedCaseStudies: "Συνδεδεμένες μελέτες περίπτωσης",
    noLinkedCases: "Καμία μελέτη περίπτωσης δεν έχει συνδεθεί ακόμη με αυτή την πρόκληση.",
    baselineTitle: "Πού βρισκόμαστε τώρα;",
    baselineHazards: "Σχετικοί κλιματικοί κίνδυνοι",
    baselineAffectedSystems: "Επηρεαζόμενα συστήματα",
    baselineStakeholders: "Σχετικοί εμπλεκόμενοι φορείς",
    baselineEvidence: "Βασικά στοιχεία τεκμηρίωσης",
    baselineEmpty: "Δεν υπάρχουν ακόμη δεδομένα.",
    tocTitle: "Θεωρία Αλλαγής",
    tocCurrentState: "Τρέχουσα κατάσταση",
    tocDesiredFuture: "Επιθυμητό μέλλον",
    tocRequiredTransformations: "Απαιτούμενες μεταβολές",
    tocIntermediateOutcomes: "Ενδιάμεσα αποτελέσματα",
    tocEnablingConditions: "Συνθήκες που το διευκολύνουν",
    tocEdit: "Επεξεργασία",
    tocEmpty: "Δεν έχει οριστεί ακόμη.",
    p2rPhase2: "Φάση 2 · Δημιουργία κοινού οράματος",
    p2rPhase3: "Φάση 3 · Σχεδιασμός διαδρομών",
    newFuture: "Νέο εναλλακτικό μέλλον",
    newFutureTitle: "Νέο εναλλακτικό μέλλον",
    benefitsLabel: "Οφέλη",
    barriersLabel: "Εμπόδια",
    tradeOffsLabel: "Συμβιβασμοί (trade-offs)",
    noFutures: "Δεν έχουν προταθεί ακόμη ονομαστικά εναλλακτικά μέλλοντα — μπορείτε πάντα να προτείνετε ιδέες στο γενικό όραμα παραπάνω.",
    futuresEmptyTitle: "Πιθανά μέλλοντα για την Αττική",
    futuresEmptyDesc:
      "Ένα εναλλακτικό μέλλον περιγράφει ένα πιθανό σενάριο — τα οφέλη, τα εμπόδια και τους συμβιβασμούς του — γύρω από το οποίο μπορούν να οργανωθούν οι προτάσεις οράματος.",
    generalVision: "Γενικό όραμα (χωρίς συγκεκριμένο μέλλον)",
    proposeVisionElement: "Προτείνετε μια ιδέα",
    visionElementPlaceholder: "Γράψτε την ιδέα ή την πρότασή σας...",
    propose: "Πρόταση",
    noVisionElements: "Δεν υπάρχουν ακόμη προτάσεις.",
    agree: "Συμφωνώ",
    disagree: "Διαφωνώ",
    reply: "Απάντηση",
    replyPlaceholder: "Γράψτε μια απάντηση...",
    send: "Αποστολή",
    merge: "Συγχώνευση με...",
    mergedInto: "Συγχωνεύτηκε",
    mergeSelectTarget: "Επιλέξτε πρόταση προορισμού",
    mergeConfirm: "Συγχώνευση",
    newPathway: "Νέα διαδρομή",
    newPathwayTitle: "Νέα διαδρομή προσαρμογής (Adaptation Pathway)",
    shortDescriptionLabel: "Σύντομη περιγραφή",
    relevantImpactsLabel: "Σχετικά impacts",
    adaptationOptionsLabel: "Επιλογές προσαρμογής",
    enablingConditionsLabel: "Συνθήκες που το διευκολύνουν",
    decisionPointsLabel: "Σημεία απόφασης",
    transformativePotentialLabel: "Μετασχηματιστική δυναμική",
    noPathways: "Δεν έχουν προταθεί ακόμη διαδρομές.",
    pathwaysEmptyTitle: "Σχεδιάστε την πρώτη διαδρομή προσαρμογής",
    pathwaysEmptyDesc:
      "Μια διαδρομή προσαρμογής περιγράφει επιλογές, σημεία απόφασης και τη μετασχηματιστική της δυναμική. Προσθέστε περισσότερες από μία ώστε να μπορούν να συγκριθούν παρακάτω.",
    pathwaysEmptyNote: "Μόνο εκπρόσωποι, συντονιστές και διαχειριστές μπορούν να προσθέσουν μια διαδρομή.",
    comparisonTitle: "Σύγκριση διαδρομών",
    comparisonEmpty: "Χρειάζονται τουλάχιστον δύο διαδρομές για σύγκριση.",
    rateThis: "Βαθμολογήστε",
    markPreferred: "Ορισμός ως προτεινόμενη κατεύθυνση",
    preferredBadge: "Προτεινόμενη κατεύθυνση",
    statusDraft: "Πρόχειρο",
    statusUnderDiscussion: "Υπό συζήτηση",
    statusPreferred: "Προτεινόμενη",
    statusArchived: "Αρχειοθετημένο",
    comments: "Σχόλια",
    commentPlaceholder: "Γράψτε ένα σχόλιο...",
    historyTitle: "Ιστορικό διαδρομής",
    historyEmpty: "Δεν υπάρχει ακόμη καταγεγραμμένο ιστορικό.",
    criteriaHelp: {
      effectiveness: "Πόσο μειώνει πραγματικά τον κίνδυνο και ενισχύει την ανθεκτικότητα.",
      applicability: "Πόσο ταιριάζει στο συγκεκριμένο περιφερειακό πλαίσιο, στα συστήματα και στην κλίμακα της Αττικής.",
      feasibility: "Πόσο ρεαλιστικά μπορεί να υλοποιηθεί με τους διαθέσιμους πόρους, θεσμούς και χρόνο.",
      transformative_potential:
        "Αν αντιμετωπίζει τα βαθύτερα αίτια της ευαλωτότητας, αλλάζει θεσμικές ή δομικές πρακτικές, ενισχύει τη συνεργασία μεταξύ φορέων, μειώνει τις ανισότητες, συνδέει διαφορετικά συστήματα και δημιουργεί μακροπρόθεσμη ανθεκτικότητα — όχι μόνο βραχυπρόθεσμη προστασία.",
      adaptivity: "Αν μπορεί να προσαρμοστεί, να κλιμακωθεί ή να αναθεωρηθεί καθώς μεταβάλλονται οι κλιματικές συνθήκες.",
      inclusiveness: "Αν ωφελεί και τις πιο εκτεθειμένες ομάδες και δεν αφήνει κανέναν πίσω (just resilience).",
      stakeholder_support: "Πόσο το στηρίζουν οι εμπλεκόμενοι φορείς και οι τοπικές κοινότητες.",
      co_benefits: "Πρόσθετα οφέλη πέρα από την προσαρμογή — υγεία, βιοποικιλότητα, οικονομία, ποιότητα ζωής.",
      trade_off_risk: "Τι θυσιάζεται ή επιβαρύνεται για να επιτευχθεί το όφελος.",
      maladaptation_risk: "Κίνδυνος να αυξήσει την ευαλωτότητα ή να μεταφέρει τον κίνδυνο αλλού ή στο μέλλον.",
      long_term_resilience: "Αν η ωφέλεια αντέχει σε βάθος χρόνου και σε μεταβαλλόμενες κλιματικές συνθήκες.",
      cross_system_contribution: "Πόσο ωφελεί και άλλα συνδεδεμένα συστήματα, όχι μόνο το κύριο.",
    },
    criteria: {
      effectiveness: "Αποτελεσματικότητα",
      applicability: "Εφαρμοσιμότητα",
      feasibility: "Εφικτότητα",
      transformative_potential: "Μετασχηματιστική δυναμική",
      adaptivity: "Προσαρμοστικότητα / ευελιξία",
      inclusiveness: "Συμπεριληπτικότητα",
      stakeholder_support: "Υποστήριξη εμπλεκόμενων",
      co_benefits: "Συνοφέλη",
      trade_off_risk: "Κίνδυνος συμβιβασμών",
      maladaptation_risk: "Κίνδυνος δυσπροσαρμογής",
      long_term_resilience: "Μακροπρόθεσμη ανθεκτικότητα",
      cross_system_contribution: "Συμβολή σε άλλα συστήματα",
    },
    historyActions: {
      create_challenge: "Δημιουργία πρόκλησης",
      update_challenge: "Ενημέρωση πρόκλησης",
      propose_alternative_future: "Πρόταση εναλλακτικού μέλλοντος",
      propose_vision_element: "Πρόταση ιδέας οράματος",
      reply_vision_element: "Απάντηση σε ιδέα οράματος",
      merge_vision_element: "Συγχώνευση ιδεών οράματος",
      update_theory_of_change: "Ενημέρωση Θεωρίας Αλλαγής",
      create_pathway: "Δημιουργία διαδρομής",
      update_pathway: "Ενημέρωση διαδρομής",
      update_pathway_status: "Αλλαγή κατάστασης διαδρομής",
      rate_pathway: "Βαθμολόγηση διαδρομής",
      comment_pathway: "Σχόλιο σε διαδρομή",
    },
  },
  en: {
    navLabel: "Priority Systems",
    closeExplorer: "Close",
    homeCardTitle: "Priority Systems",
    homeCardDescription: "Select the affected system and explore its related climate impacts and resilience cases.",
    homeCardCta: "Explore the systems",
    systemsTitle: "Priority Systems",
    systemsSubtitle: "Start by selecting the system affected by the resilience challenge. You will then see its relevant climate impacts and resilience cases.",
    challengesCount: (n) => `${n} challenge${n === 1 ? "" : "s"}`,
    impactCountLabel: (n) => `${n} impact${n === 1 ? "" : "s"}`,
    caseStudyCountLabel: (n) => `${n} case stud${n === 1 ? "y" : "ies"}`,
    pathwayCountLabel: (n) => `${n} pathway${n === 1 ? "" : "s"}`,
    horizontalBadge: "Horizontal system",
    challengesTitle: "Climate challenges",
    exploreSystem: "Explore system",
    linkedSystemsLabel: "Linked systems",
    newCaseStudy: "New case study",
    newCaseStudyTitle: "New case study",
    primarySystemLabel: "Primary system *",
    primaryImpactLabel: "Primary climate impact *",
    selectSystemFirst: "Select a system first",
    noImpactsForSystem: "No impacts exist for this system yet. Ask an administrator to add one.",
    areaLabel: "Geographic area",
    startDateLabel: "Start date",
    targetDateLabel: "Target completion",
    saveAsDraftLabel: "Save as draft",
    hazardsLabel: "Climate pressures",
    noChallenges: "No challenges have been added for this system yet.",
    challengesEmptyTitle: "Let's start mapping resilience",
    challengesEmptyDesc:
      "Add a climate challenge for this system — like flooding to infrastructure or water scarcity — to kick off shared-vision and pathway co-creation.",
    challengesEmptyNote:
      "Only representatives, coordinators and admins can add a challenge. Reach out to the coordination team if you'd like to propose one.",
    impactsTitle: "Climate impacts / resilience challenges",
    impactsEmptyTitle: "No impacts defined yet",
    impactsEmptyDesc: "Climate impacts are a fixed taxonomy managed by platform administrators.",
    impactsEmptyNote: "Reach out to an administrator if a new impact needs to be added for this system.",
    selectImpactPrompt: "Select an impact above to see its linked systems, case studies, and adaptation pathways.",
    primarySystemCaseStudies: "Primary system",
    linkedSystemCaseStudies: "Linked system",
    noCaseStudiesForImpact: "No case studies have been linked to this impact yet.",
    relatedPathwaysTitle: "Phase 3 outputs",
    noPathwaysForImpact: "No adaptation pathways have been developed for this impact yet.",
    pathwayDevelopedIn: "Developed in case study",
    p2rJourneyTitle: "Regional Resilience Journey",
    selectCaseStudyPrompt: "Select a case study:",
    noPrimaryCaseStudyYet: "No case study has been created for this impact yet.",
    whereAreWeNow: "Where are we now?",
    systemVulnerabilities: "Key vulnerabilities",
    systemRccapPriorities: "RCCAP priorities",
    noContextYet: "No description recorded yet.",
    systemStepEyebrow: "Priority System",
    systemHeroDescription: "Explore the main climate impacts affecting this system and select a challenge to enter its resilience journey.",
    journeyRouteTitle: "Your route",
    routeSystem: "Select system",
    routeImpact: "Choose challenge",
    routeCase: "Open case study",
    routeComplete: "Complete",
    routeCurrent: "Now",
    routeNext: "Next",
    relevantImpactCount: (n) => `${n} relevant challenge${n === 1 ? "" : "s"}`,
    activeCaseCount: (n) => `${n} related case stud${n === 1 ? "y" : "ies"}`,
    chooseImpactTitle: "Select a Climate Impact to continue",
    chooseImpactDescription: "Nothing is preselected. Your choice opens the single Resilience Journey for that impact.",
    impactPrimaryRelationship: "Primary impact for this system",
    impactConnectedRelationship: "Cross-system impact",
    impactCaseCount: (n) => `${n} active case stud${n === 1 ? "y" : "ies"}`,
    inspectImpact: "View journey",
    impactFocusLabel: "Selected climate challenge",
    affectedSystems: "Connected systems",
    casesForImpactTitle: "Continue the resilience journey",
    casesForImpactDescription:
      "Choose a resilience case to see its current P2R phase, completed outputs and the next opportunity to contribute.",
    noCasesTitle: "No active case study yet",
    noCasesDescription: "The challenge is defined, but a collaboration space has not started yet. Case-study creation is available only to administrators.",
    openJourney: "Open resilience journey",
    backToImpact: "Back to the impact",
    startJourney: "Start the journey",
    startJourneyAdminOnly: "Only administrators can start a new journey for this impact.",
    startJourneyNeedsHazard: "Add at least one climate hazard to this challenge first, so a journey can start from it.",
    journeyStarted: "Journey started",
    membersLabel: (n) => `${n} member${n === 1 ? "" : "s"}`,
    casePhase1: "Prepare the Ground",
    casePhase2: "Build a Shared Vision",
    casePhase3: "Design Pathways",
    phase3Output: "Phase 3 output",
    pathwaysAvailable: (n) => `${n} adaptation pathway${n === 1 ? "" : "s"}`,
    phaseComplete: "Complete",
    phaseCurrent: "In progress",
    phaseUpcoming: "Upcoming",
    caseStatusDraft: "Draft",
    caseStatusInProgress: "In progress",
    caseStatusUnderReview: "Under review",
    caseStatusApproved: "Approved",
    caseStatusCompleted: "Completed",
    methodTitle: "Your Resilience Journey",
    methodDescription:
      "Follow the three P2R phases from a validated shared baseline to an agreed adaptation pathway.",
    methodStage1: "Understand the Challenge",
    methodStage2: "Shape a Transformative Future",
    methodStage3: "Design Pathways for Transformation",
    methodQuestion1: "Where are we now?",
    methodQuestion2: "Where do we want to go?",
    methodQuestion3: "How do we get there?",
    methodPhase1Description:
      "Explore what is already known about the challenge, including climate hazards, vulnerabilities, affected systems, stakeholders, existing measures, system interdependencies and available evidence.",
    methodPhase1Outcome: "Outcome: validated shared baseline",
    methodPhase2Description:
      "Explore alternative futures, agree a shared vision and define the Theory of Change needed to reach it.",
    methodPhase2Outcome: "Outcome: shared direction for change",
    methodPhase3Description:
      "Develop and assess adaptation measures, compare alternative pathways and agree the preferred or combined pathway.",
    methodPhase3Outcome: "Outcome: evidence-based decision",
    methodStatus: "Status",
    methodStatusComplete: "Completed",
    methodPhasePrefix: "P2R Phase",
    methodAction1: "Explore the current situation",
    methodAction2: "Shape the shared vision",
    methodAction3: "Explore adaptation pathways",
    methodBaselineReport: "View / Download Baseline Report",
    newChallenge: "New challenge",
    newChallengeTitle: "New challenge (impact / resilience challenge)",
    titleLabel: "Title *",
    descriptionLabel: "Description",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    createdTitle: "Created",
    createdError: "Something went wrong",
    tabOverview: "Overview",
    tabFutures: "Alternative futures",
    tabPathways: "Adaptation pathways",
    tabHistory: "History",
    linkedCaseStudies: "Linked case studies",
    noLinkedCases: "No case studies have been linked to this challenge yet.",
    baselineTitle: "Where are we now?",
    baselineHazards: "Relevant climate hazards",
    baselineAffectedSystems: "Affected systems",
    baselineStakeholders: "Relevant stakeholders",
    baselineEvidence: "Key evidence",
    baselineEmpty: "No data yet.",
    tocTitle: "Theory of Change",
    tocCurrentState: "Current state / challenges",
    tocDesiredFuture: "Desired future / shared vision",
    tocRequiredTransformations: "Required transformations",
    tocIntermediateOutcomes: "Intermediate outcomes",
    tocEnablingConditions: "Enabling conditions",
    tocEdit: "Edit",
    tocEmpty: "Not set yet.",
    p2rPhase2: "Phase 2 · Build a Shared Vision",
    p2rPhase3: "Phase 3 · Design Pathways",
    newFuture: "New alternative future",
    newFutureTitle: "New alternative future",
    benefitsLabel: "Benefits",
    barriersLabel: "Barriers",
    tradeOffsLabel: "Trade-offs",
    noFutures: "No named alternative futures yet — you can always propose ideas in the general vision above.",
    futuresEmptyTitle: "Possible futures for Attica",
    futuresEmptyDesc:
      "An alternative future describes one possible scenario — its benefits, barriers and trade-offs — that vision ideas can be organised around.",
    generalVision: "General vision (not tied to a specific future)",
    proposeVisionElement: "Propose an idea",
    visionElementPlaceholder: "Write your idea or proposal...",
    propose: "Propose",
    noVisionElements: "No proposals yet.",
    agree: "Agree",
    disagree: "Disagree",
    reply: "Reply",
    replyPlaceholder: "Write a reply...",
    send: "Send",
    merge: "Merge into...",
    mergedInto: "Merged",
    mergeSelectTarget: "Select a target proposal",
    mergeConfirm: "Merge",
    newPathway: "New pathway",
    newPathwayTitle: "New adaptation pathway",
    shortDescriptionLabel: "Short description",
    relevantImpactsLabel: "Relevant impacts",
    adaptationOptionsLabel: "Adaptation options",
    enablingConditionsLabel: "Enabling conditions",
    decisionPointsLabel: "Decision points",
    transformativePotentialLabel: "Transformative potential",
    noPathways: "No pathways proposed yet.",
    pathwaysEmptyTitle: "Design the first adaptation pathway",
    pathwaysEmptyDesc:
      "A pathway captures adaptation options, decision points and its transformative potential. Add more than one so they can be compared below.",
    pathwaysEmptyNote: "Only representatives, coordinators and admins can add a pathway.",
    comparisonTitle: "Pathway comparison",
    comparisonEmpty: "At least two pathways are needed to compare.",
    rateThis: "Rate",
    markPreferred: "Set as preferred direction",
    preferredBadge: "Preferred direction",
    statusDraft: "Draft",
    statusUnderDiscussion: "Under discussion",
    statusPreferred: "Preferred",
    statusArchived: "Archived",
    comments: "Comments",
    commentPlaceholder: "Write a comment...",
    historyTitle: "History trail",
    historyEmpty: "No history recorded yet.",
    criteriaHelp: {
      effectiveness: "How much it genuinely reduces risk and strengthens resilience.",
      applicability: "How well it fits Attica's particular regional context, systems and scale.",
      feasibility: "How realistically it can be delivered with the available resources, institutions and time.",
      transformative_potential:
        "Whether it tackles the deeper causes of vulnerability, changes institutional or structural practices, strengthens cooperation between actors, reduces inequalities, connects different systems, and builds long-term resilience — not only short-term protection.",
      adaptivity: "Whether it can be adjusted, scaled or revisited as climate conditions change.",
      inclusiveness: "Whether it also benefits the most exposed groups and leaves no one behind (just resilience).",
      stakeholder_support: "How strongly stakeholders and local communities back it.",
      co_benefits: "Additional gains beyond adaptation — health, biodiversity, economy, quality of life.",
      trade_off_risk: "What is given up or burdened in order to gain the benefit.",
      maladaptation_risk: "Risk that it increases vulnerability or shifts risk elsewhere or into the future.",
      long_term_resilience: "Whether the benefit holds up over time and under changing climate conditions.",
      cross_system_contribution: "How much it also benefits other linked systems, not just the primary one.",
    },
    criteria: {
      effectiveness: "Effectiveness",
      applicability: "Applicability",
      feasibility: "Feasibility",
      transformative_potential: "Transformative potential",
      adaptivity: "Adaptivity / flexibility",
      inclusiveness: "Inclusiveness",
      stakeholder_support: "Stakeholder support",
      co_benefits: "Co-benefits",
      trade_off_risk: "Trade-off / maladaptation risk",
      maladaptation_risk: "Maladaptation risk",
      long_term_resilience: "Long-term resilience",
      cross_system_contribution: "Cross-system contribution",
    },
    historyActions: {
      create_challenge: "Challenge created",
      update_challenge: "Challenge updated",
      propose_alternative_future: "Alternative future proposed",
      propose_vision_element: "Vision idea proposed",
      reply_vision_element: "Reply to a vision idea",
      merge_vision_element: "Vision ideas merged",
      update_theory_of_change: "Theory of Change updated",
      create_pathway: "Pathway created",
      update_pathway: "Pathway updated",
      update_pathway_status: "Pathway status changed",
      rate_pathway: "Pathway rated",
      comment_pathway: "Comment on a pathway",
    },
  },
};

async function api(path, options) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || "Request failed.");
  return body?.data;
}

let currentUserCache = null;
async function getCurrentUser() {
  if (currentUserCache) return currentUserCache;
  try {
    const data = await api("/me");
    currentUserCache = data.user;
  } catch {
    currentUserCache = null;
  }
  return currentUserCache;
}

function canCurate(user) {
  return !!user && ["representative", "coordinator", "admin"].includes(user.platformRole);
}

function isAdmin(user) {
  return user?.platformRole === "admin";
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A friendlier stand-in for a bare "nothing here yet" line — an icon, a
// short explanation of what belongs here, and (role permitting) a button
// that jumps straight into creating it, so an empty section is still
// something a visitor can act on rather than a dead end.
function buildEmptyState(t, { icon = "compass", title, description, ctaLabel, onCta, note, secondaryLabel, onSecondary }) {
  const wrap = el("div", "systems-explorer-empty-state");
  const iconWrap = el("div", "systems-explorer-empty-icon");
  iconWrap.innerHTML = systemIconSvg(icon);
  wrap.append(iconWrap);
  wrap.append(el("h3", null, title));
  wrap.append(el("p", null, description));
  const actions = el("div", "systems-explorer-empty-actions");
  if (ctaLabel && onCta) {
    const btn = el("button", "btn primary", ctaLabel);
    btn.type = "button";
    btn.addEventListener("click", onCta);
    actions.append(btn);
  }
  if (secondaryLabel && onSecondary) {
    const btn = el("button", "btn secondary", secondaryLabel);
    btn.type = "button";
    btn.addEventListener("click", onSecondary);
    actions.append(btn);
  }
  if (actions.childElementCount) wrap.append(actions);
  if (note) wrap.append(el("p", "systems-explorer-empty-note", note));
  return wrap;
}

// ---------------------------------------------------------------------------
// Overlay shell
// ---------------------------------------------------------------------------

// Lives *inside* the page's own <main> — appended as an extra child, with
// main's other (native) children hidden via a class rather than removed —
// so the real header and footer stay visible and usable around it, and it
// inherits main's own width/positioning/grid-column for free instead of
// having to replicate them. A full-viewport fixed overlay was the first
// approach here; ditched once it became clear it was hiding the site's own
// chrome, which is never what a real page on this site looks like.
function getOverlay() {
  const main = document.querySelector("main");
  if (!main) return null;
  [...main.children].forEach((child) => {
    if (!child.classList.contains("systems-explorer-page")) child.classList.add("systems-explorer-native-hidden");
  });
  let page = main.querySelector(":scope > .systems-explorer-page");
  if (!page) {
    page = document.createElement("div");
    page.className = "systems-explorer-page";
    page.setAttribute("data-no-localize", "true");
    page.innerHTML = `<div class="systems-explorer-shell"><div class="systems-explorer-topbar"></div><div class="systems-explorer-body"></div></div>`;
    main.append(page);
  }
  return page;
}

function removeOverlay() {
  const main = document.querySelector("main");
  if (!main) return;
  main.querySelector(":scope > .systems-explorer-page")?.remove();
  [...main.children].forEach((child) => child.classList.remove("systems-explorer-native-hidden"));
}

// The overlay covers the whole viewport (deliberately, at a z-index above
// the native header's 15) so none of the bundle's own nav is reachable
// while it's open — this close button is the only way out, clearing
// explorerState and letting the native page underneath show again exactly
// as the viewer left it (no re-navigation needed, since entering the
// explorer never left that page).
// `crumbs` is the ancestor trail (Priority Systems -> System -> ...), each
// entry a clickable {label, onClick} jumping straight to that level — this
// replaces the old single "Back to X" pill + static eyebrow badge, which
// only ever let a visitor step back exactly one level and didn't read as
// navigation at all (the eyebrow looked like a label, not a link).
function setTopbar(overlay, { crumbs = [], title, lang }) {
  const bar = overlay.querySelector(".systems-explorer-topbar");
  bar.innerHTML = "";
  if (crumbs.length || title) {
    const heading = el("div", "systems-explorer-heading");
    if (crumbs.length) {
      const nav = document.createElement("nav");
      nav.className = "systems-explorer-breadcrumb";
      nav.setAttribute("aria-label", "Breadcrumb");
      // A leading back-arrow on the trail's first (outermost) crumb makes it
      // legible as "go back" navigation at a glance, not just a label.
      nav.innerHTML = `<svg class="systems-explorer-crumb-back-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;
      crumbs.forEach((crumb, index) => {
        if (index > 0) nav.append(el("span", "systems-explorer-crumb-sep", "/"));
        const btn = el("button", "systems-explorer-crumb", crumb.label);
        btn.type = "button";
        btn.addEventListener("click", crumb.onClick);
        nav.append(btn);
      });
      heading.append(nav);
    }
    if (title) heading.append(el("h1", "systems-explorer-title", title));
    bar.append(heading);
  }
  // The close button is a convenience shortcut back to whatever native page
  // was showing before — with the real header/footer visible around this
  // page now, the site's own nav works just as well to leave it.
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn systems-explorer-close";
  closeBtn.setAttribute("aria-label", T[lang || currentLanguage()].closeExplorer);
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`;
  closeBtn.addEventListener("click", () => {
    explorerState = null;
    sessionStorage.removeItem(ACTIVE_EXPLORER_KEY);
    syncSystemsExplorer();
  });
  bar.append(closeBtn);
}

// ---------------------------------------------------------------------------
// Page: Systems grid
// ---------------------------------------------------------------------------

// Cycles through the bundle's own soft accent colors (bare classes, not
// scoped to .feature-grid like .feature-icon's sizing is — see
// SYSTEM_CARD_ICON_CSS below) so the grid doesn't read as ten identical cyan
// tiles the way a single fixed color would.
const SYSTEM_CARD_COLORS = ["cyan-bg", "green-bg", "violet-bg", "amber-bg"];

// Climate hazards describe events (heatwaves, floods, drought). These
// climate challenges describe the user-facing consequences for each
// Priority System. Keeping the two concepts separate prevents the cards
// from simply repeating the hazard taxonomy.
const SYSTEM_CLIMATE_CHALLENGES = {
  water: {
    el: ["Λειψυδρία και πίεση στους υδατικούς πόρους", "Πλημμύρες και υπερφόρτωση δικτύων ομβρίων", "Υποβάθμιση ποιότητας νερού", "Υφαλμύρινση παράκτιων υδροφορέων"],
    en: ["Water scarcity and pressure on water resources", "Flooding and overloaded stormwater networks", "Declining water quality", "Saltwater intrusion into coastal aquifers"],
  },
  forest_ecosystems: {
    el: ["Απώλεια βιοποικιλότητας και οικοτόπων", "Αυξημένη ένταση δασικών πυρκαγιών", "Ξήρανση και υποβάθμιση δασών", "Μείωση οικοσυστημικών υπηρεσιών"],
    en: ["Loss of biodiversity and habitats", "More severe wildfires", "Forest dieback and degradation", "Declining ecosystem services"],
  },
  health: {
    el: ["Θερμική καταπόνηση και αυξημένη θνησιμότητα", "Επιβάρυνση ευάλωτων ομάδων", "Νέοι ή ενισχυμένοι φορείς ασθενειών", "Πίεση στις υπηρεσίες υγείας"],
    en: ["Heat stress and increased mortality", "Disproportionate impacts on vulnerable groups", "Emerging or expanding disease vectors", "Pressure on health services"],
  },
  built_environment: {
    el: ["Αστική θερμική επιβάρυνση", "Υπερθέρμανση κτιρίων", "Αστικές πλημμύρες", "Ζημιές σε κτίρια και υποδομές", "Διακοπή κρίσιμων υποδομών", "Έκθεση στη διεπαφή δάσους–πόλης"],
    en: ["Urban heat", "Overheating of buildings", "Urban flooding", "Damage to buildings and infrastructure", "Disruption of critical infrastructure", "Wildfire exposure at the forest–urban interface"],
  },
  transport: {
    el: ["Διακοπές μετακινήσεων από πλημμύρες και ακραία φαινόμενα", "Θερμικές βλάβες σε οδικά και σιδηροδρομικά δίκτυα", "Ευπάθεια κόμβων και λιμένων", "Περιορισμένη πρόσβαση σε κρίσιμες υπηρεσίες"],
    en: ["Travel disruption from floods and extreme events", "Heat damage to road and rail networks", "Vulnerability of transport hubs and ports", "Reduced access to critical services"],
  },
  energy: {
    el: ["Αυξημένη ζήτηση ψύξης", "Μειωμένη απόδοση παραγωγής και δικτύων", "Βλάβες και διακοπές από ακραία φαινόμενα", "Ενεργειακή φτώχεια και άνιση πρόσβαση"],
    en: ["Rising cooling demand", "Reduced generation and network efficiency", "Damage and outages from extreme events", "Energy poverty and unequal access"],
  },
  tourism: {
    el: ["Θερμική δυσφορία επισκεπτών και εργαζομένων", "Υποβάθμιση φυσικών και πολιτιστικών πόρων", "Λειψυδρία σε περιόδους αιχμής", "Διαταραχή εποχικότητας και τοπικών οικονομιών"],
    en: ["Heat stress for visitors and workers", "Degradation of natural and cultural assets", "Water scarcity during peak demand", "Disrupted seasonality and local economies"],
  },
  coastal_zones: {
    el: ["Παράκτια διάβρωση και υποχώρηση ακτών", "Μόνιμη ή επεισοδιακή κατάκλυση", "Ζημιές σε παράκτιες υποδομές", "Απώλεια παράκτιων οικοτόπων"],
    en: ["Coastal erosion and shoreline retreat", "Permanent or episodic inundation", "Damage to coastal infrastructure", "Loss of coastal habitats"],
  },
  agriculture_livestock: {
    el: ["Μειωμένη διαθεσιμότητα νερού για άρδευση", "Απώλειες παραγωγής από ζέστη και ξηρασία", "Θερμική καταπόνηση ζώων", "Υποβάθμιση εδαφών και αυξημένοι επιβλαβείς οργανισμοί"],
    en: ["Reduced water availability for irrigation", "Crop losses from heat and drought", "Heat stress in livestock", "Soil degradation and increasing pests"],
  },
};

async function renderSystemsGrid(overlay, lang) {
  const t = T[lang];
  setTopbar(overlay, { title: t.systemsTitle });
  const body = overlay.querySelector(".systems-explorer-body");
  body.innerHTML = `<p class="systems-explorer-subtitle"></p><div class="systems-grid"></div>`;
  body.querySelector(".systems-explorer-subtitle").textContent = t.systemsSubtitle;
  const grid = body.querySelector(".systems-grid");
  grid.innerHTML = `<p class="systems-explorer-loading">…</p>`;
  try {
    const data = await api("/systems");
    grid.innerHTML = "";
    // Civil Protection remains available as a linked, cross-cutting system
    // in the data model, but it is not a tenth Priority System in the main
    // journey. Showing it here duplicated relationships and obscured the
    // nine systems the user is asked to choose between.
    const sorted = data.items.filter((system) => !system.is_horizontal);
    sorted.forEach((system, index) => {
      const card = document.createElement("article");
      card.className = "feature-card system-card";
      card.setAttribute("role", "link");
      card.tabIndex = 0;
      const name = lang === "el" ? system.name_el : system.name_en;
      const description = lang === "el" ? system.description_el : system.description_en;
      const colorClass = SYSTEM_CARD_COLORS[index % SYSTEM_CARD_COLORS.length];
      card.innerHTML = `
        <div class="system-card-head">
          <span class="system-card-icon ${colorClass}">${systemIconSvg(system.icon_key)}</span>
          <h3></h3>
        </div>
        <p class="system-card-desc"></p>
        <div class="system-card-challenges"><b></b><strong></strong></div>
        <div class="system-card-footer">
          <span class="system-card-cta"></span>
          <span class="system-card-arrow" aria-hidden="true">${ARROW_RIGHT_SVG}</span>
        </div>`;
      card.querySelector("h3").textContent = name;
      if (description) card.querySelector(".system-card-desc").textContent = description;
      else card.querySelector(".system-card-desc").remove();
      const challenges = SYSTEM_CLIMATE_CHALLENGES[system.key]?.[lang] || [];
      card.querySelector(".system-card-challenges b").textContent = t.challengesTitle;
      card.querySelector(".system-card-challenges strong").textContent = String(challenges.length);
      card.querySelector(".system-card-cta").textContent = t.exploreSystem;
      const open = () => navigateToExplorer("system", system.id);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
      grid.append(card);
    });
  } catch (error) {
    console.error("[Priority Systems] Unable to render the systems catalogue.", error);
    grid.innerHTML = `<p class="systems-explorer-error"></p>`;
    const message = grid.querySelector("p");
    message.textContent = t.createdError;
    message.dataset.error = error instanceof Error ? error.message : String(error);
  }
}

const SYSTEM_ICONS = {
  droplets: `<path d="M12 2.69 6.34 9.36a7 7 0 1 0 11.32 0z"/>`,
  trees: `<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13.343 7A4 4 0 0 1 21 9a3 3 0 0 1-.65 5.9"/><path d="M15 8v8"/><path d="M15 16h.3a2.7 2.7 0 0 1 1.5 4.9L15 22"/>`,
  "heart-pulse": `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/><path d="M3.22 9H10l1.5-3L15 12l1.5-3h4.28"/>`,
  "building-2": `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`,
  "train-front": `<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-1 1-2 1.5-4 1.5"/><path d="M15 19c1 1 2 1.5 4 1.5"/><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/>`,
  zap: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14Z"/>`,
  palmtree: `<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43 1.96 1.95 5.28 1.8 7.43-.35 2.15-2.15 2.3-5.47.35-7.43-1.96-1.95-5.28-1.8-7.43.35Z"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5"/><path d="M7 12c-1.5 1.5-3 2.5-4 2.5"/>`,
  waves: `<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>`,
  wheat: `<path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 21a2 2 0 0 0-2-2H9"/><path d="M20 17a2 2 0 0 0-2-2H11"/>`,
  siren: `<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1Z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/>`,
  layers: `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  compass: `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`,
  route: `<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>`,
  sparkles: `<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
};

function systemIconSvg(iconKey) {
  const inner = SYSTEM_ICONS[iconKey] || SYSTEM_ICONS.layers;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// ---------------------------------------------------------------------------
// Page: one System's Challenges
// ---------------------------------------------------------------------------

function buildTextField(label, name, { textarea = false, required = false, type = "text", value = "" } = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "systems-explorer-field";
  wrapper.append(label);
  const input = document.createElement(textarea ? "textarea" : "input");
  input.name = name;
  if (!textarea) input.type = type;
  if (required) input.required = true;
  // An edit form must open holding what is already stored. Without this the
  // Theory of Change form opened blank and its submit sent "" for every
  // untouched field, wiping the Phase 1 / Shared Vision text it inherits.
  if (value) input.value = value;
  wrapper.append(input);
  return { wrapper, input };
}

// An inline-selectable chip rather than a card that navigates away —
// selecting an Impact filters/reveals its linked systems, Case Studies and
// Pathways on this same page (spec section 4C), instead of spawning a
// separate Impact-detail page.
function localised(record, key, lang) {
  return record?.[`${key}_${lang}`] || record?.[`${key}_en`] || record?.[`${key}_el`] || "";
}

function buildImpactChoice(impact, systemId, lang, t, onSelect) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "system-impact-choice";
  card.setAttribute("aria-pressed", "false");
  const relationship = impact.system_id === systemId ? t.impactPrimaryRelationship : t.impactConnectedRelationship;
  card.append(el("span", "system-impact-relationship", relationship));
  card.append(el("span", "system-impact-choice-title", localised(impact, "title", lang)));
  const description = localised(impact, "description", lang);
  if (description) card.append(el("span", "system-impact-choice-description", description));
  const hazards = el("span", "system-impact-choice-hazards");
  impact.hazards.forEach((hazard) => hazards.append(el("span", "system-evidence-tag", localised(hazard, "name", lang))));
  card.append(hazards);
  const footer = el("span", "system-impact-choice-footer");
  footer.append(el("span", null, t.impactCaseCount(impact.case_study_count)), el("strong", null, t.inspectImpact));
  card.append(footer);
  card.addEventListener("click", () => onSelect(impact, card));
  return card;
}

function buildSystemHero(system, impacts, caseCount, lang, t) {
  const hero = el("section", "system-journey-hero");
  const copy = el("div", "system-journey-hero-copy");
  const eyebrow = el("div", "system-journey-eyebrow");
  const icon = el("span", "system-journey-icon");
  icon.innerHTML = systemIconSvg(system.icon_key);
  eyebrow.append(icon, el("span", null, t.systemStepEyebrow));
  copy.append(eyebrow, el("h1", null, localised(system, "name", lang)));
  copy.append(el("p", null, localised(system, "description", lang) || t.systemHeroDescription));
  hero.append(copy);
  return hero;
}

async function renderSystemDetail(overlay, lang, systemId) {
  const t = T[lang];
  const body = overlay.querySelector(".systems-explorer-body");
  body.innerHTML = `<p class="systems-explorer-loading">…</p>`;
  setTopbar(overlay, { crumbs: [{ label: t.navLabel, onClick: () => navigateToExplorer("systems") }] });
  try {
    const [systemData, impactsData] = await Promise.all([
      api(`/systems/${encodeURIComponent(systemId)}`),
      api(`/impacts?relatedSystemId=${encodeURIComponent(systemId)}`),
    ]);
    const system = systemData.system;
    setTopbar(overlay, { crumbs: [{ label: t.navLabel, onClick: () => navigateToExplorer("systems") }], lang });

    body.innerHTML = "";
    const relatedCases = new Set([...system.case_studies, ...system.linked_case_studies].map((item) => item.id));
    const impacts = [...impactsData.items].sort((a, b) => {
      const primaryDelta = Number(b.system_id === systemId) - Number(a.system_id === systemId);
      if (primaryDelta) return primaryDelta;
      return Number(b.case_study_count) - Number(a.case_study_count);
    });

    body.append(buildSystemHero(system, impacts, relatedCases.size, lang, t));

    const impactsSection = el("section", "system-impact-selector-section");
    const impactsHeader = el("div", "system-impact-selector-head");
    impactsHeader.append(el("h2", null, t.chooseImpactTitle), el("p", null, t.chooseImpactDescription));
    impactsSection.append(impactsHeader);
    const impactsGrid = el("div", "system-impact-choice-grid");
    impactsSection.append(impactsGrid);
    body.append(impactsSection);

    if (!impacts.length) {
      impactsGrid.append(
        buildEmptyState(t, { icon: "layers", title: t.impactsEmptyTitle, description: t.impactsEmptyDesc, note: t.impactsEmptyNote })
      );
      return;
    }

    const selectImpact = async (impact, card) => {
      impactsGrid.querySelectorAll(".system-impact-choice").forEach((item) => {
        const active = item === card;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      try {
        const data = await api(`/impacts/${encodeURIComponent(impact.id)}`);
        const journey = data.impact.case_studies?.[0];
        if (journey) {
          sessionStorage.setItem(ACTIVE_EXPLORER_KEY, JSON.stringify({ view: "system", id: systemId }));
          navigateToNative("case", journey.id, { rememberExplorer: true });
          return;
        }
        const user = await getCurrentUser();
        if (!isAdmin(user) || !data.impact.hazards?.length) {
          showToast({ type: "info", title: t.noCasesTitle, message: isAdmin(user) ? t.startJourneyNeedsHazard : t.startJourneyAdminOnly });
          card.classList.remove("active");
          card.setAttribute("aria-pressed", "false");
          return;
        }
        const created = await api("/cases", {
          method: "POST",
          body: JSON.stringify({
            titleEl: data.impact.title_el,
            titleEn: data.impact.title_en,
            descriptionEl: data.impact.description_el,
            descriptionEn: data.impact.description_en,
            impactId: data.impact.id,
            hazardIds: data.impact.hazards.map((hazard) => hazard.id),
            linkedSystemIds: data.impact.linked_systems.map((linked) => linked.id),
          }),
        });
        navigateToNative("case", created.caseStudy.id, { rememberExplorer: true });
      } catch (error) {
        showToast({ type: "error", title: t.createdError, message: error.message });
        card.classList.remove("active");
        card.setAttribute("aria-pressed", "false");
      }
    };

    impacts.forEach((impact) => impactsGrid.append(buildImpactChoice(impact, systemId, lang, t, selectImpact)));
  } catch (error) {
    body.innerHTML = `<p class="systems-explorer-error"></p>`;
    body.querySelector("p").textContent = error.message;
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher + nav injection
// ---------------------------------------------------------------------------

let lastRenderedKey = null;

// Single definition of "what the explorer is currently showing", so an
// in-page update (e.g. selecting an impact) can mark itself as already
// rendered instead of tripping the next sync pass into a full rebuild.
function explorerRenderKey(lang) {
  return `${currentExplorerView()}:${currentExplorerId()}:${explorerState?.impactId || ""}:${lang}`;
}

export async function syncSystemsExplorer() {
  consumePendingExplorerNavigation();
  const view = currentExplorerView();
  const id = currentExplorerId();
  if (!["systems", "system"].includes(view)) {
    lastRenderedKey = null;
    removeOverlay();
    return;
  }
  const lang = currentLanguage();
  const key = explorerRenderKey(lang);
  if (key === lastRenderedKey) return;
  lastRenderedKey = key;

  const overlay = getOverlay();
  if (!overlay) return;
  if (view === "systems") {
    await renderSystemsGrid(overlay, lang);
  } else if (view === "system") {
    if (!id) return navigateToExplorer("systems");
    await renderSystemDetail(overlay, lang, id);
  }
}

// Safety-net cleanup: if explorerState was cleared by something other than
// syncSystemsExplorer()'s own early-return (e.g. the native-nav-click
// handler below, between sync passes), make sure the native page's content
// is actually showing again rather than waiting for the next full pass.
export function teardownSystemsExplorerIfInactive() {
  if (!["systems", "system"].includes(currentExplorerView())) {
    removeOverlay();
  }
}

// Clicking a real header/footer nav destination while the explorer is open
// must exit it — otherwise explorerState stays set and the next render
// pass just re-hides the native page the click was trying to reach. Only
// relevant now that the explorer lives inside <main> rather than behind a
// full-viewport overlay, since the header/footer/sidebar are genuinely
// reachable and clickable.
let nativeExitListenerInstalled = false;
export function installSystemsExplorerNativeExitListener() {
  if (nativeExitListenerInstalled) return;
  nativeExitListenerInstalled = true;
  document.addEventListener(
    "click",
    (event) => {
      if (!explorerState) return;
      if (event.target.closest?.(".systems-explorer-page")) return;
      const target = event.target.closest?.(
        ".public-header button, .app-header button, .app-shell aside button, .site-footer button, .brand"
      );
      if (target) {
        explorerState = null;
        sessionStorage.removeItem(ACTIVE_EXPLORER_KEY);
      }
    },
    true
  );
}

// Deliberately re-checks every call rather than a permanent "ran once"
// flag: the bundle's own header re-renders after its async data (e.g. the
// case count) loads, which can wipe a manually-injected sibling the same
// way plain DOM children of any React-owned tree are at risk here — a
// one-shot flag would then never notice it's gone and never re-add it.
export function installSystemsExplorerNav() {
  consumePendingExplorerNavigation();
  const navs = document.querySelectorAll(".public-header nav, .app-header nav");
  if (!navs.length) return;
  const lang = currentLanguage();
  // The explorer is open whenever explorerState is set (i.e. currentView()
  // is non-empty) — the native nav buttons only get their own `.active`
  // class from React when *their* route matches, so without this our
  // button would never look pressed/selected while the explorer is open.
  const isActive = Boolean(currentExplorerView());
  navs.forEach((nav) => {
    let button = nav.querySelector(".systems-explorer-nav-button");
    if (!button) {
      // First in the nav, ahead of Case studies — this is meant to be the
      // platform's primary entry point (comment #1), not a bolt-on extra.
      const firstButton = nav.querySelector("button");
      button = document.createElement("button");
      button.type = "button";
      button.className = "systems-explorer-nav-button";
      button.innerHTML = `${systemIconSvg("layers")}<span></span>`;
      button.querySelector("span").textContent = T[lang].navLabel;
      button.addEventListener("click", () => navigateToExplorer("systems"));
      if (firstButton) firstButton.before(button);
      else nav.append(button);
    }
    button.classList.toggle("active", isActive);

    // The explorer renders OVER whatever native view the user was on, and
    // React keeps its own `.active` on that view's nav button -- so two
    // items looked selected at once. Suppress the native highlight while the
    // explorer owns the screen, and restore it verbatim when it closes.
    nav.querySelectorAll(":scope > button").forEach((native) => {
      if (native === button) return;
      if (isActive && native.classList.contains("active")) {
        native.classList.remove("active");
        native.classList.add(NATIVE_ACTIVE_SUPPRESSED);
      } else if (!isActive && native.classList.contains(NATIVE_ACTIVE_SUPPRESSED)) {
        native.classList.remove(NATIVE_ACTIVE_SUPPRESSED);
        native.classList.add("active");
      }
    });
  });
}

export function refreshSystemsExplorerNavLabel() {
  const lang = currentLanguage();
  document.querySelectorAll(".systems-explorer-nav-button").forEach((btn) => {
    const label = btn.querySelector("span");
    if (label) label.textContent = T[lang].navLabel;
  });
}

const ARROW_RIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;

// Same hand-rolled feature-card pattern as addGuideFeatureCard() in
// runtime-enhancements.js (matches the bundle's own card markup exactly),
// but always kept as the *first* card — Priority Systems is meant to be
// the platform's primary entry point (comment #1), same as the nav button.
export function addSystemsExplorerFeatureCard() {
  const grid = document.querySelector(".feature-grid");
  if (!grid) return;
  const lang = currentLanguage();
  const t = T[lang];
  let card = grid.querySelector(".feature-card-systems-explorer");
  if (card && card.dataset.lang === lang) {
    if (grid.firstElementChild !== card) grid.prepend(card);
    return;
  }
  if (!card) {
    card = document.createElement("article");
    card.className = "feature-card feature-card-systems-explorer";
    card.setAttribute("role", "link");
    card.tabIndex = 0;
    card.innerHTML = `
      <span class="feature-icon violet-bg">${systemIconSvg("layers")}</span>
      <h3></h3>
      <p></p>
      <span class="feature-cta" aria-hidden="true"><span class="feature-cta-text"></span> ${ARROW_RIGHT_SVG}</span>
    `;
    const navigate = () => navigateToExplorer("systems");
    card.addEventListener("click", navigate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate();
      }
    });
  }
  card.dataset.lang = lang;
  card.setAttribute("aria-label", t.navLabel);
  card.querySelector("h3").textContent = t.homeCardTitle;
  card.querySelector("p").textContent = t.homeCardDescription;
  card.querySelector(".feature-cta-text").textContent = t.homeCardCta;
  grid.prepend(card);
}

// Shared with src/case-workspace.js (the Case Study co-creation stepper)
// so the two modules don't duplicate the same bilingual copy dictionary,
// fetch helper, overlay/toast/permission/icon plumbing, or the empty-state
// component — the Case Study workspace is a sibling surface reading the
// same shared backend, not a parallel implementation.
export {
  T,
  api,
  getCurrentUser,
  canCurate,
  isAdmin,
  el,
  buildEmptyState,
  buildTextField,
  showToast,
  systemIconSvg,
  navigateToNative,
  currentLanguage,
};
