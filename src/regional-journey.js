// @ts-nocheck
// The single Attica Regional Resilience Journey. Priority Systems are
// evidence lenses inside Phase 1; they never create separate journeys.

import {
  api,
  currentLanguage,
  el,
  getCurrentUser,
  showToast,
  systemIconSvg,
  navigateToNative,
} from "./systems-explorer.js";
import { renderCaseJourney, renderPhaseForum } from "./case-workspace.js";

const REGIONAL_CASE_ID = "20000000-0000-4000-8000-000000000001";
const STATE_KEY = "adapttica:regional-journey";
const PAGE_CLASS = "regional-journey-page";
const NATIVE_HIDDEN = "regional-native-hidden";
const BRAND_NAME = "AdapTTICA VISIONS";
const CONFIRMED_SYSTEM_KEYS = ["water", "forest_ecosystems", "health", "built_environment"];
const PHASE_SYSTEM_KEY_PREFIX = "adapttica:regional-journey:phase-system:";

const COPY = {
  el: {
    brandHome: "αρχική",
    navJourney: "Περιφερειακή Διαδρομή Ανθεκτικότητας",
    navLibrary: "Βιβλιοθήκη γνώσης",
    navGuide: "Οδηγός χρήσης",
    homeTitle: "Συνδιαμόρφωση των διαδρομών προς την κλιματική ανθεκτικότητα της Περιφέρειας Αττικής",
    homeIntro: "Το AdapTTICA VISIONS είναι το συμμετοχικό περιβάλλον της Περιφέρειας Αττικής για την ανάπτυξη κοινών οραμάτων και διαδρομών κλιματικής ανθεκτικότητας. Συνδέει υπάρχουσα γνώση και στοιχεία με τη συμμετοχή ενδιαφερόμενων φορέων, ακολουθώντας τη μεθοδολογία του ευρωπαϊκού προγράμματος Pathways2Resilience.",
    homeCta: "Εξερευνήστε την Περιφερειακή Διαδρομή Ανθεκτικότητας της Αττικής",
    heroVisualLabel: "Ο κύκλος μετάβασης του Pathways2Resilience: σκοπός, διαδικασία και σχέδια για μια δίκαιη κλιματική μετάβαση.",
    homeWhatKicker: "Τι είναι",
    homeWhatTitle: "Τι είναι το AdapTTICA VISIONS",
    homeWhatBody:
      "Είναι ο κοινός χώρος της Περιφέρειας Αττικής όπου η υπάρχουσα κλιματική τεκμηρίωση συναντά τη συμμετοχή των φορέων. Συγκεντρώνει ό,τι ήδη γνωρίζουμε για τους κινδύνους της περιοχής, το ανοίγει σε σχολιασμό και επικύρωση, και οργανώνει τις συλλογικές αποφάσεις σε μία διαδρομή που μπορεί να παρακολουθηθεί.",
    homeWhyTitle: "Γιατί υπάρχει",
    homeWhyBody:
      "Η προσαρμογή στην κλιματική αλλαγή αποτυγχάνει όταν η γνώση μένει σε εκθέσεις και οι αποφάσεις σε κλειστά γραφεία. Η πλατφόρμα κάνει ορατό ποιος συνεισέφερε τι, τι έχει επικυρωθεί και τι εκκρεμεί — ώστε η τελική στρατηγική να στηρίζεται σε τεκμήρια και σε πραγματική συμφωνία.",
    homeHowKicker: "Πώς λειτουργεί",
    homeHowTitle: "Η Περιφερειακή Διαδρομή Ανθεκτικότητας",
    homeHowBody:
      "Η διαδρομή ακολουθεί τη μεθοδολογία του ευρωπαϊκού προγράμματος Pathways2Resilience. Υπάρχει μία διαδρομή για την Αττική — όχι ξεχωριστή ανά τομέα — και εξελίσσεται σε τρεις διαδοχικές φάσεις.",
    homeContextKicker: "Το έργο",
    homeContextTitle: "Το πλαίσιο του AdapTTICA",
    homeContextBody:
      "Το AdapTTICA υλοποιείται στην Περιφέρεια Αττικής στο πλαίσιο του Pathways2Resilience, μιας ευρωπαϊκής πρωτοβουλίας που στηρίζει περιφέρειες και κοινότητες να σχεδιάσουν τη δική τους πορεία κλιματικής ανθεκτικότητας. Συγχρηματοδοτείται από την Ευρωπαϊκή Ένωση (Συμφωνία επιχορήγησης αρ. 101093942).",
    homePartnersKicker: "Ποιοι συμμετέχουν",
    homePartnersTitle: "Εταίροι",
    homePartnersBody: "Το έργο υλοποιείται από τους παρακάτω φορείς, μαζί με τους εμπλεκόμενους φορείς που συμμετέχουν στη διαδρομή.",
    homePartnerAttica: "Περιφέρεια Αττικής",
    homePartnerAtticaRole: "Περιφερειακή αρχή — ιδιοκτήτης της διαδικασίας",
    homePartnerDraxis: "DRAXIS",
    homePartnerDraxisRole: "Κλιματικά δεδομένα και ψηφιακή πλατφόρμα",
    homePartnerBioassist: "BioAssist",
    homePartnerBioassistRole: "Τεχνολογία και υποστήριξη συμμετοχής",
    homePartnerP2R: "Pathways2Resilience",
    homePartnerP2RRole: "Ευρωπαϊκό πλαίσιο και μεθοδολογία",
    homeStartKicker: "Από πού ξεκινάω",
    homeStartTitle: "Πού να ξεκινήσετε",
    homeStartBody: "Αν είναι η πρώτη σας επίσκεψη, ξεκινήστε από τη διαδρομή. Οι παρακάτω σελίδες υποστηρίζουν τη διαδικασία.",
    homeLinkLibrary: "Δείτε την τεκμηρίωση, τα δεδομένα και τα αποτελέσματα εργαστηρίων.",
    homeLinkGuide: "Πρακτικές οδηγίες για τη χρήση της πλατφόρμας.",
    eyebrow: "Pathways2Resilience · Περιφέρεια Αττικής",
    journeyTitle: "Περιφερειακή Διαδρομή Ανθεκτικότητας της Αττικής",
    journeyIntro: "Μία κοινή περιφερειακή διαδικασία που οργανώνει την υπάρχουσα τεκμηρίωση, τη συνδημιουργία και τη λήψη αποφάσεων σε τρεις διαδοχικές φάσεις.",
    visionsRole: "Δομή, τεκμηρίωση, αξιολόγηση και επικύρωση",
    affineRole: "Ζωντανά εργαστήρια και συνδημιουργία",
    openPhase: "Άνοιγμα φάσης",
    loginToOpenPhase: "Συνδεθείτε για να συνεχίσετε",
    phase1: "Φάση 1",
    phase1Title: "Προετοιμασία βάσης / Baseline",
    phase1Desc: "Κατανοήστε τι γνωρίζουμε ήδη για το πλαίσιο κλιματικής ανθεκτικότητας της Αττικής.",
    phase2: "Φάση 2",
    phase2Title: "Δημιουργία κοινού οράματος",
    phase2Desc: "Διερευνήστε πιθανά μέλλοντα και συνδιαμορφώστε ένα κοινό όραμα ανθεκτικότητας.",
    phase3: "Φάση 3",
    phase3Title: "Σχεδιασμός διαδρομών",
    phase3Desc: "Εντοπίστε, αξιολογήστε και συνδυάστε παρεμβάσεις σε διαδρομές προσαρμογής.",
    completed: "Ολοκληρώθηκε",
    current: "Τρέχουσα",
    upcoming: "Επόμενη",
    locked: "Κλειδωμένη",
    backJourney: "Περιφερειακή Διαδρομή Ανθεκτικότητας",
    phase1Question: "Τι γνωρίζουμε ήδη;",
    phase1Intro: "Η Φάση 1 συγκεντρώνει την υπάρχουσα περιφερειακή τεκμηρίωση και τη μετατρέπει σε κοινή αφετηρία για τη διαδικασία συνδημιουργίας.",
    evidenceTitle: "Κύριες πηγές τεκμηρίωσης",
    evidenceIntro: "Οι πηγές αυτές αποτελούν το αρχικό πλαίσιο· δεν παρουσιάζονται ως τελική, αμετάβλητη ερμηνεία.",
    sourceRccap: "Περιφερειακός σχεδιασμός προσαρμογής",
    sourceRccapDesc: "Το υφιστάμενο περιφερειακό πλαίσιο κινδύνων, προτεραιοτήτων και μέτρων προσαρμογής.",
    sourceClimaax: "CLIMAAX",
    sourceClimaaxDesc: "Εργαλεία και υπηρεσίες για συνεπή περιφερειακή αξιολόγηση κλιματικού κινδύνου.",
    sourceObservatory: "Παρατηρητήριο και κλιματικές πηγές",
    sourceObservatoryDesc: "Σχετικά κλιματικά δεδομένα, δείκτες και περιφερειακή παρακολούθηση.",
    moreInfo: "Περισσότερες πληροφορίες",
    moreInfoVulnerabilities: "Βασικές τρωτότητες",
    moreInfoPriorities: "Προτεραιότητες ΠεΣΠΚΑ",
    close: "Κλείσιμο",
    download: "Λήψη",
    downloadSignIn: "Συνδεθείτε για λήψη",
    openExternal: "Άνοιγμα ιστότοπου",
    browseLibrary: "Αναζήτηση στη Βιβλιοθήκη",
    alreadyKnow: "Τι γνωρίζουμε ήδη",
    systemsIntro: "Τα τέσσερα συστήματα προτεραιότητας είναι θεματικοί φακοί της ίδιας περιφερειακής διαδρομής.",
    systemsContextTitle: "Συστήματα προτεραιότητας",
    systemsContextIntro:
      "Τα τέσσερα συστήματα παραμένουν το πλαίσιο αυτής της φάσης· δεν ξεκινούν ξεχωριστές διαδρομές. Επιλέξτε ένα για να δείτε την τεκμηρίωση της Φάσης 1 που το αφορά.",
    systemsContextOpen: "Δείτε το πλήρες πλαίσιο Φάσης 1",
    systemsContextHint: "Επιλέξτε σύστημα για το πλαίσιό του.",
    exploreSystem: "Εξερεύνηση συστήματος",
    continuePhase2: "Συνέχεια στη Φάση 2 — Δημιουργία κοινού οράματος",
    continuePhase3: "Συνέχεια στη Φάση 3 — Σχεδιασμός διαδρομών",
    returnPhase1: "Επιστροφή στη Φάση 1",
    returnPhase2: "Επιστροφή στη Φάση 2",
    climateImpacts: "Κλιματικές επιπτώσεις",
    interdependencies: "Αλληλεξαρτήσεις συστημάτων",
    stakeholderMapping: "Χαρτογράφηση εμπλεκόμενων φορέων",
    indicative: "Ενδεικτική προεπισκόπηση — αντικαθίσταται από εγκεκριμένο απόσπασμα αξιολόγησης.",
    period: "Κλιματική περίοδος",
    scenario: "Σενάριο",
    viewDetails: "Προβολή στοιχείων →",
    note: "Σημείωση",
    systemMapTitle: "Χάρτης αλληλεξαρτήσεων",
    interdependenciesInfographicTitle: "Περιφερειακό διάγραμμα αλληλεξαρτήσεων",
    interdependenciesInfographicPending: "Το διάγραμμα θα προστεθεί από την ομάδα έργου.",
    interdependenciesInfographicAlt: "Διάγραμμα αλληλεξαρτήσεων μεταξύ των συστημάτων προτεραιότητας της Αττικής.",
    mappedActors: "Χαρτογραφημένοι φορείς",
    stakeholderMappingAltPrefix: "Χαρτογράφηση εμπλεκόμενων μερών —",
    sectorSnapshot: "Αποτέλεσμα χαρτογράφησης",
    sectorSnapshotPending: "Το στιγμιότυπο του εργαστηρίου θα προστεθεί από την ομάδα έργου.",
    impactImageTitle: "Απόσπασμα αξιολόγησης",
    impactImagePending: "Η εικόνα αξιολόγησης θα προστεθεί από την ομάδα έργου.",
    systemForumTitle: "Γενικό φόρουμ συζήτησης",
    systemForumIntro: "Σχολιάστε ό,τι αφορά αυτό το Σύστημα Προτεραιότητας.",
    systemForumPlaceholder: "Γράψτε ένα σχόλιο...",
    systemForumSubmit: "Δημοσίευση",
    forumEmpty: "Δεν υπάρχουν ακόμα σχόλια. Γίνετε ο πρώτος που θα σχολιάσει.",
    commentPosted: "Το σχόλιο δημοσιεύτηκε",
    createdError: "Κάτι πήγε στραβά",
    phase2Question: "Πού θέλουμε να φτάσουμε;",
    phase2Intro: "Η Φάση 1 βοήθησε να κατανοήσουμε το πλαίσιο ανθεκτικότητας της Αττικής. Στη Φάση 2, οι εμπλεκόμενοι φορείς διερευνούν πιθανά μέλλοντα και διαμορφώνουν μαζί ένα κοινό όραμα για μια κλιματικά ανθεκτική Αττική.",
    phase2PickTitle: "Επιλέξτε ένα Σύστημα Προτεραιότητας για να ξεκινήσετε",
    phase2PickIntro: "Η διερεύνηση πιθανών μελλόντων, το κοινό όραμα και η Θεωρία Αλλαγής οργανώνονται γύρω από ένα Σύστημα Προτεραιότητας τη φορά.",
    phase3PickTitle: "Επιλέξτε ένα Σύστημα Προτεραιότητας για να ξεκινήσετε",
    phase3PickIntro: "Ο εντοπισμός, η αξιολόγηση και η σύγκριση παρεμβάσεων οργανώνονται γύρω από ένα Σύστημα Προτεραιότητας τη φορά.",
    phase2WorkingOn: "Εργάζεστε πάνω στο",
    phase2ChangeSystem: "Αλλαγή συστήματος",
    ownership: "Ιδιοκτησία & Δέσμευση",
    ownershipQuestion: "Έχουμε τους κατάλληλους ανθρώπους για να συνδιαμορφώσουν το όραμα;",
    representation: "Έλεγχος εκπροσώπησης",
    loginNeeded: "Συνδεθείτε για να συμμετάσχετε στις δραστηριότητες, στα forums, στις ψηφοφορίες και στην επικύρωση.",
    login: "Σύνδεση",
    phase3Question: "Για αυτό το μέλλον, ποιες παρεμβάσεις και διαδρομές μπορούν να μας οδηγήσουν εκεί;",
    phase3Intro: "Εντοπίστε, αξιολογήστε, διαμορφώστε, συγκρίνετε και επιλέξτε τις παρεμβάσεις που συνθέτουν τις περιφερειακές διαδρομές προσαρμογής.",
    phase3Locked: "Ολοκληρώστε και επικυρώστε τη Φάση 2 πριν συνεχίσετε στον σχεδιασμό διαδρομών.",
    statusLabel: "Κατάσταση φάσης",
    implementation: "Υλοποίηση",
    implementationLater: "Η λειτουργικότητα υλοποίησης θα αναπτυχθεί σε επόμενο στάδιο. Δεν δημιουργείται πρόσθετη ροή σε αυτή τη φάση.",
    loading: "Φόρτωση…",
    error: "Δεν ήταν δυνατή η φόρτωση αυτού του περιεχομένου.",
  },
  en: {
    brandHome: "home",
    navJourney: "Regional Resilience Journey",
    navLibrary: "Knowledge Library",
    navGuide: "User Guide",
    homeTitle: "Co-creating pathways towards climate resilience for the Region of Attica",
    homeIntro: "AdapTTICA VISIONS is the Region of Attica’s participatory environment for developing shared visions and climate-resilience pathways. It connects existing knowledge and evidence with stakeholder participation, following the methodology of the European Pathways2Resilience programme.",
    homeCta: "Explore Attica’s Regional Resilience Journey",
    heroVisualLabel: "The Pathways2Resilience transition cycle: purpose, process and plans for a just climate transition.",
    homeWhatKicker: "What it is",
    homeWhatTitle: "What AdapTTICA VISIONS is",
    homeWhatBody:
      "It is the Region of Attica's shared space where existing climate evidence meets stakeholder participation. It gathers what we already know about the region's risks, opens it up for comment and validation, and organises the resulting collective decisions into one journey that can be followed.",
    homeWhyTitle: "Why it exists",
    homeWhyBody:
      "Climate adaptation fails when evidence stays in reports and decisions stay behind closed doors. This platform makes visible who contributed what, what has been validated and what is still open — so the resulting strategy rests on evidence and on real agreement.",
    homeHowKicker: "How it works",
    homeHowTitle: "The Regional Resilience Journey",
    homeHowBody:
      "The journey follows the methodology of the European Pathways2Resilience programme. There is one journey for Attica — not a separate one per sector — and it moves through three sequential phases.",
    homeContextKicker: "The project",
    homeContextTitle: "The AdapTTICA context",
    homeContextBody:
      "AdapTTICA runs in the Region of Attica as part of Pathways2Resilience, a European initiative supporting regions and communities to design their own climate-resilience journey. It is co-funded by the European Union (Grant agreement no. 101093942).",
    homePartnersKicker: "Who is involved",
    homePartnersTitle: "Partners",
    homePartnersBody: "The project is delivered by the organisations below, together with the stakeholders taking part in the journey.",
    homePartnerAttica: "Region of Attica",
    homePartnerAtticaRole: "Regional authority — owner of the process",
    homePartnerDraxis: "DRAXIS",
    homePartnerDraxisRole: "Climate data and digital platform",
    homePartnerBioassist: "BioAssist",
    homePartnerBioassistRole: "Technology and participation support",
    homePartnerP2R: "Pathways2Resilience",
    homePartnerP2RRole: "European framework and methodology",
    homeStartKicker: "Where to start",
    homeStartTitle: "Where to start",
    homeStartBody: "If this is your first visit, start with the journey. The pages below support the process.",
    homeLinkLibrary: "Browse the evidence, datasets and workshop outputs.",
    homeLinkGuide: "Practical instructions for using the platform.",
    eyebrow: "Pathways2Resilience · Region of Attica",
    journeyTitle: "Attica Regional Resilience Journey",
    journeyIntro: "One shared regional process that structures existing evidence, co-creation and decision-making through three sequential phases.",
    visionsRole: "Structure, evidence, assessment and validation",
    affineRole: "Live workshops and co-creation",
    openPhase: "Open phase",
    loginToOpenPhase: "Sign in to continue",
    phase1: "Phase 1",
    phase1Title: "Prepare the Ground / Baseline",
    phase1Desc: "Understand what we already know about Attica’s climate-resilience context.",
    phase2: "Phase 2",
    phase2Title: "Build a Shared Vision",
    phase2Desc: "Explore possible futures and co-create a shared resilience vision.",
    phase3: "Phase 3",
    phase3Title: "Design Pathways",
    phase3Desc: "Identify, assess and combine interventions into adaptation pathways.",
    completed: "Completed",
    current: "Current",
    upcoming: "Upcoming",
    locked: "Locked",
    backJourney: "Regional Resilience Journey",
    phase1Question: "What do we already know?",
    phase1Intro: "Phase 1 brings together the existing regional evidence and turns it into a shared starting point for co-creation.",
    evidenceTitle: "Main evidence sources",
    evidenceIntro: "These sources form the starting context; they are not presented as a final, unchangeable interpretation.",
    sourceRccap: "Regional climate adaptation planning",
    sourceRccapDesc: "The existing regional framework of risks, priorities and adaptation measures.",
    sourceClimaax: "CLIMAAX",
    sourceClimaaxDesc: "Tools and services for consistent regional climate-risk assessment.",
    sourceObservatory: "Observatory and climate information sources",
    sourceObservatoryDesc: "Relevant climate data, indicators and regional monitoring sources.",
    moreInfo: "More information",
    moreInfoVulnerabilities: "Key vulnerabilities",
    moreInfoPriorities: "RCCAP priorities",
    close: "Close",
    download: "Download",
    downloadSignIn: "Sign in to download",
    openExternal: "Open website",
    browseLibrary: "Browse the Library",
    alreadyKnow: "What We Already Know",
    systemsIntro: "The four Priority Systems are evidence lenses within the same Regional Resilience Journey.",
    systemsContextTitle: "Priority Systems",
    systemsContextIntro:
      "The four systems remain the context for this phase; they do not start separate journeys. Select one to see the Phase 1 evidence behind it.",
    systemsContextOpen: "See the full Phase 1 context",
    systemsContextHint: "Select a system to see its context.",
    exploreSystem: "Explore system",
    continuePhase2: "Continue to Phase 2 — Build a Shared Vision",
    continuePhase3: "Continue to Phase 3 — Design Pathways",
    returnPhase1: "Return to Phase 1",
    returnPhase2: "Return to Phase 2",
    climateImpacts: "Climate Impacts",
    interdependencies: "System Interdependencies",
    stakeholderMapping: "Stakeholder Mapping",
    indicative: "Indicative preview — replace with the approved assessment extract.",
    period: "Climate period",
    scenario: "Scenario",
    viewDetails: "View details →",
    note: "Note",
    systemMapTitle: "System interdependency map",
    interdependenciesInfographicTitle: "Regional interdependencies diagram",
    interdependenciesInfographicPending: "The diagram will be added by the project team.",
    interdependenciesInfographicAlt: "Diagram of the interdependencies between Attica's Priority Systems.",
    mappedActors: "Mapped actors",
    stakeholderMappingAltPrefix: "Stakeholder mapping —",
    sectorSnapshot: "Mapping output",
    sectorSnapshotPending: "The workshop snapshot will be added by the project team.",
    impactImageTitle: "Assessment extract",
    impactImagePending: "The assessment image will be added by the project team.",
    systemForumTitle: "General discussion forum",
    systemForumIntro: "Comment on anything related to this Priority System.",
    systemForumPlaceholder: "Write a comment...",
    systemForumSubmit: "Post",
    forumEmpty: "No comments yet. Be the first to comment.",
    commentPosted: "Comment posted",
    createdError: "Something went wrong",
    phase2Question: "Where do we want to go?",
    phase2Intro: "Phase 1 helped us understand Attica’s resilience context. In Phase 2, stakeholders explore different possible futures and work together to define a shared vision for a climate-resilient Attica.",
    phase2PickTitle: "Choose a Priority System to get started",
    phase2PickIntro: "Exploring possible futures, the shared vision and the Theory of Change are organised around one Priority System at a time.",
    phase3PickTitle: "Choose a Priority System to get started",
    phase3PickIntro: "Identifying, assessing and comparing interventions is organised around one Priority System at a time.",
    phase2WorkingOn: "Working on",
    phase2ChangeSystem: "Change system",
    ownership: "Ownership & Commitment",
    ownershipQuestion: "Do we have the right people involved to co-create the vision?",
    representation: "Representation Check",
    loginNeeded: "Log in to participate in activities, forums, voting and validation.",
    login: "Log in",
    phase3Question: "For this future, what interventions and pathways could help us get there?",
    phase3Intro: "Identify, assess, formulate, compare and select the interventions that form the regional adaptation pathways.",
    phase3Locked: "Complete and validate Phase 2 before continuing to Pathway Design.",
    statusLabel: "Phase status",
    implementation: "Implementation",
    implementationLater: "Implementation functionality will be developed at a later stage. No additional workflow is created at this point.",
    loading: "Loading…",
    error: "This content could not be loaded.",
  },
};

const SYSTEM_IMPACTS = {
  water: ["Flooding", "Drought", "Water Scarcity", "Extreme Rainfall"],
  forest_ecosystems: ["Wildfires", "Drought", "Extreme Heat", "Extreme Rainfall / Erosion"],
  health: ["Extreme Heat", "Wildfires", "Flooding"],
  built_environment: ["Extreme Heat", "Flooding", "Wildfires", "Sea-Level Rise / Coastal Flooding"],
};

const SYSTEM_IMPACTS_EL = {
  Flooding: "Πλημμύρες", Drought: "Ξηρασία", "Water Scarcity": "Λειψυδρία", "Extreme Rainfall": "Ακραίες βροχοπτώσεις",
  Wildfires: "Δασικές πυρκαγιές", "Extreme Heat": "Ακραία ζέστη", "Extreme Rainfall / Erosion": "Ακραίες βροχοπτώσεις / Διάβρωση",
  "Sea-Level Rise / Coastal Flooding": "Άνοδος στάθμης θάλασσας / Παράκτιες πλημμύρες",
};

const SYSTEM_IMPACT_DESCRIPTIONS = {
  Flooding: {
    el: "Έντονη βροχόπτωση υπερφορτώνει τα δίκτυα αποστράγγισης και πλημμυρίζει αστικές και παράκτιες περιοχές.",
    en: "Heavy rainfall overwhelms drainage networks and floods urban and coastal areas.",
  },
  Drought: {
    el: "Παρατεταμένη έλλειψη βροχοπτώσεων μειώνει τη διαθεσιμότητα νερού για ανθρώπους, γεωργία και οικοσυστήματα.",
    en: "Prolonged rainfall deficits reduce water availability for people, agriculture and ecosystems.",
  },
  "Water Scarcity": {
    el: "Η ζήτηση νερού ξεπερνά τη διαθέσιμη προσφορά σε περιόδους αιχμής.",
    en: "Demand for water outpaces available supply during peak periods.",
  },
  "Extreme Rainfall": {
    el: "Σύντομα, έντονα επεισόδια βροχόπτωσης προκαλούν αιφνίδιες πλημμύρες και διάβρωση εδάφους.",
    en: "Short, intense rainfall events trigger flash flooding and soil erosion.",
  },
  Wildfires: {
    el: "Ξηρές, θερμές συνθήκες αυξάνουν τον κίνδυνο εξάπλωσης πυρκαγιών σε δασικές και περιαστικές περιοχές.",
    en: "Hot, dry conditions raise the risk of fires spreading through forested and peri-urban areas.",
  },
  "Extreme Heat": {
    el: "Παρατεταμένα κύματα καύσωνα επιβαρύνουν τη δημόσια υγεία, τη ζήτηση ενέργειας και τις υποδομές.",
    en: "Prolonged heatwaves strain public health, energy demand and infrastructure.",
  },
  "Extreme Rainfall / Erosion": {
    el: "Έντονη βροχόπτωση σε επικλινή εδάφη επιταχύνει τη διάβρωση και την απώλεια εδάφους.",
    en: "Intense rainfall on sloped terrain accelerates soil erosion and land loss.",
  },
  "Sea-Level Rise / Coastal Flooding": {
    el: "Η άνοδος της στάθμης της θάλασσας αυξάνει τον κίνδυνο μόνιμης ή περιοδικής πλημμύρας στις ακτές.",
    en: "Rising sea levels increase the risk of permanent or periodic flooding along the coast.",
  },
};

const INTERDEPENDENCIES = {
  water: ["Built Environment", "Health", "Forest Ecosystems & Biodiversity"],
  forest_ecosystems: ["Water", "Health", "Built Environment"],
  health: ["Built Environment", "Water", "Forest Ecosystems & Biodiversity"],
  built_environment: ["Water", "Health", "Forest Ecosystems & Biodiversity"],
};

const SYSTEM_NAMES_EL = {
  Water: "Ύδατα", Health: "Υγεία", "Built Environment": "Δομημένο Περιβάλλον",
  "Forest Ecosystems & Biodiversity": "Δασικά Οικοσυστήματα & Βιοποικιλότητα",
};

function state() {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "null"); } catch { return null; }
}

function setState(next) {
  sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
  syncRegionalJourney();
}

// Which Priority System the current visitor picked before entering a
// collaborative phase's own steps (Phase 2's Explore/Vision/ToC, Phase 3's
// Options/Pathways). Kept separate from STATE_KEY (the generic
// view/systemId/tab triple) since it must persist across a phase render the
// way STATE_KEY's own systemId slot only tracks Phase 1's system pages.
// The Priority System a visitor commits to is universal across phases --
// picking it (or changing it) in Phase 2 carries into Phase 3 and back, so
// one shared key is used regardless of which phase asks for it.
function getPhaseSystem() {
  return sessionStorage.getItem(PHASE_SYSTEM_KEY_PREFIX) || "";
}

function setPhaseSystem(systemId) {
  if (systemId) sessionStorage.setItem(PHASE_SYSTEM_KEY_PREFIX, systemId);
  else sessionStorage.removeItem(PHASE_SYSTEM_KEY_PREFIX);
}

export function openRegionalJourney(view = "overview", systemId = null, tab = "impacts") {
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ view, systemId, tab }));
  const nativeView = new URLSearchParams(location.search).get("view") || "home";
  if (nativeView !== "home") window.location.href = `${location.pathname}?view=home`;
  else syncRegionalJourney();
}

function closeRegionalJourney() {
  sessionStorage.removeItem(STATE_KEY);
  const host = document.querySelector(`.${HOME_SECTIONS_CLASS}`);
  if (host) delete host.dataset.renderKey;
  document.querySelector(`.${PAGE_CLASS}`)?.remove();
  document.querySelectorAll(`.${NATIVE_HIDDEN}`).forEach((node) => node.classList.remove(NATIVE_HIDDEN));
  rewriteHomepage();
  installRegionalNavigation();
}

function ensurePage() {
  const main = document.querySelector("main");
  if (!main) return null;
  [...main.children].forEach((child) => {
    if (!child.classList.contains(PAGE_CLASS)) child.classList.add(NATIVE_HIDDEN);
  });
  let page = main.querySelector(`:scope > .${PAGE_CLASS}`);
  if (!page) {
    page = el("div", PAGE_CLASS);
    page.dataset.noLocalize = "true";
    main.append(page);
  }
  return page;
}

function phaseBadge(status, t) {
  const labels = { completed: t.completed, current: t.current, upcoming: t.upcoming, locked: t.locked };
  const icons = { completed: "✓", current: "●", upcoming: "○", locked: "" };
  const icon = icons[status];
  return el("span", `regional-status regional-status-${status}`, icon ? `${icon} ${labels[status] || status}` : labels[status] || status);
}

async function loadPhaseData() {
  try { return await api(`/cases/${REGIONAL_CASE_ID}/phases`); }
  catch { return { canManage: false, items: [{ phase: "phase1", status: "completed" }, { phase: "phase2", status: "current" }, { phase: "phase3", status: "locked" }] }; }
}

function addBackBar(page, title, onBack) {
  const bar = el("div", "regional-backbar");
  const back = el("button", "regional-back", `← ${title}`);
  back.type = "button";
  back.addEventListener("click", onBack);
  bar.append(back);
  page.append(bar);
}

function renderPlatformRoles(container, t) {
  const strip = el("div", "regional-platform-roles");
  strip.innerHTML = `<div><strong>AdapTTICA VISIONS</strong><span></span></div><b aria-hidden="true">+</b><div><strong>AFFiNE</strong><span></span></div>`;
  strip.children[0].querySelector("span").textContent = t.visionsRole;
  strip.children[2].querySelector("span").textContent = t.affineRole;
  container.append(strip);
}

async function renderOverview(page, lang, t) {
  const [phases, user] = await Promise.all([loadPhaseData(), getCurrentUser().catch(() => null)]);
  const statuses = Object.fromEntries(phases.items.map((item) => [item.phase, item.status]));
  const hero = el("section", "regional-hero");
  hero.innerHTML = `<span class="regional-eyebrow"></span><h1></h1><p class="regional-lead"></p>`;
  hero.querySelector(".regional-eyebrow").textContent = t.eyebrow;
  hero.querySelector("h1").textContent = t.journeyTitle;
  hero.querySelector(".regional-lead").textContent = t.journeyIntro;
  page.append(hero);

  const grid = el("section", "regional-phase-grid");
  [
    ["phase1", t.phase1, t.phase1Title, t.phase1Desc],
    ["phase2", t.phase2, t.phase2Title, t.phase2Desc],
    ["phase3", t.phase3, t.phase3Title, t.phase3Desc],
  ].forEach(([key, phase, title, desc], index) => {
    const status = statuses[key] || (key === "phase3" ? "locked" : "upcoming");
    const isLocked = status === "locked" && !phases.canManage;
    // Phase 1 is a public evidence review; Phase 2/3 are co-creation and
    // already require a session once you're inside them (case membership,
    // voting, etc.) -- surfacing that here means a visitor is not routed
    // into a phase only to be turned back by a login panel deeper in.
    const requiresLogin = key !== "phase1" && !isLocked && !user;
    const card = el("button", `regional-phase-card regional-phase-card-${status}`);
    card.type = "button";
    card.disabled = isLocked;
    card.innerHTML = `<span class="regional-phase-top"><span class="regional-phase-index"><span class="regional-sr-only"></span><span aria-hidden="true"></span></span></span><h2></h2><p></p><span class="regional-phase-foot"></span>`;
    // "ΦΑΣΗ 1" is dropped from the visible card because the numeral already
    // says it, but a screen reader still needs the full label.
    card.querySelector(".regional-sr-only").textContent = phase;
    card.querySelector(".regional-phase-index [aria-hidden]").textContent = String(index + 1);
    card.querySelector(".regional-phase-top").append(phaseBadge(status, t));
    card.querySelector("h2").textContent = title;
    card.querySelector("p").textContent = desc;
    const foot = card.querySelector(".regional-phase-foot");
    if (isLocked) {
      foot.classList.add("regional-phase-foot-locked");
      foot.textContent = t.phase3Locked;
    } else if (requiresLogin) {
      foot.append(el("span", "regional-phase-action", t.loginToOpenPhase), el("span", "regional-phase-arrow", "→"));
    } else {
      foot.append(el("span", "regional-phase-action", t.openPhase), el("span", "regional-phase-arrow", "→"));
    }
    card.addEventListener("click", () => {
      if (requiresLogin) navigateToNative("login");
      else setState({ view: key });
    });
    grid.append(card);
  });
  page.append(grid);
}

const DOWNLOAD_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
const LIBRARY_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 6 4 14"></path><path d="M12 6v14"></path><path d="M8 8v12"></path><path d="M4 4v16"></path></svg>`;
const EXTERNAL_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

function formatBytes(bytes, lang) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString(lang === "el" ? "el-GR" : "en-GB")} ${units[unit]}`;
}

// Three outcomes, each said plainly rather than dressed up as the same link:
// a real file to download, an external service to open, or a document the
// project team has not uploaded yet -- which stays visible as a gap instead
// of being hidden behind a link that goes nowhere useful.
function renderPhaseNav(page, phase, phaseData, t) {
  const nav = el("div", "regional-phase-nav");
  const back = { phase2: ["phase1", t.returnPhase1], phase3: ["phase2", t.returnPhase2] }[phase];
  const forward = { phase1: ["phase2", t.continuePhase2], phase2: ["phase3", t.continuePhase3] }[phase];

  if (back) {
    const button = el("button", "btn secondary regional-phase-nav-back", `← ${back[1]}`);
    button.type = "button";
    button.addEventListener("click", () => setState({ view: back[0] }));
    nav.append(button);
  } else {
    nav.append(el("span", "regional-phase-nav-spacer"));
  }

  if (forward) {
    const [targetPhase, label] = forward;
    const targetStatus = phaseData?.items?.find((item) => item.phase === targetPhase)?.status;
    const blocked = targetStatus === "locked" && !phaseData?.canManage;
    const button = el("button", "btn primary regional-phase-nav-forward", `${label} →`);
    button.type = "button";
    button.disabled = blocked;
    if (blocked) button.title = t.phase3Locked;
    else button.addEventListener("click", () => setState({ view: targetPhase }));
    nav.append(button);
  }
  page.append(nav);
}

function evidenceCard(title, description, source, t, lang, signedIn) {
  const card = el("article", "regional-evidence-card");
  card.innerHTML = `<div><h3><span class="regional-doc-icon">▤</span><span class="regional-doc-title"></span></h3><p></p></div>`;
  card.querySelector(".regional-doc-title").textContent = title;
  card.querySelector("p").textContent = description;
  const body = card.querySelector("div");

  if (source.externalUrl) {
    const link = document.createElement("a");
    link.className = "btn secondary small regional-evidence-action";
    link.href = source.externalUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = EXTERNAL_SVG;
    link.append(document.createTextNode(t.openExternal));
    body.append(link);
    return card;
  }

  if (source.file) {
    if (!signedIn) {
      // The file endpoint requires a session, so a guest clicking download
      // would only receive a 401. Send them to sign in instead.
      const prompt = el("button", "btn secondary small regional-evidence-action", t.downloadSignIn);
      prompt.type = "button";
      prompt.addEventListener("click", () => navigateToNative("login"));
      body.append(prompt);
      return card;
    }
    const link = document.createElement("a");
    link.className = "btn primary small regional-evidence-action";
    link.href = `/api/v1/files/${encodeURIComponent(source.file.file_key)}`;
    link.setAttribute("download", source.file.file_name || "");
    link.innerHTML = DOWNLOAD_SVG;
    link.append(document.createTextNode(t.download));
    body.append(link);
    const meta = [source.file.file_name, formatBytes(source.file.file_size, lang)].filter(Boolean).join(" · ");
    if (meta) body.append(el("span", "regional-evidence-meta", meta));
    return card;
  }

  const browse = document.createElement("a");
  browse.className = "btn secondary small regional-evidence-action";
  browse.href = `${location.pathname}?view=library`;
  browse.innerHTML = LIBRARY_SVG;
  browse.append(document.createTextNode(t.browseLibrary));
  body.append(browse);
  return card;
}

// A document is wired to an evidence card by tagging it in the Knowledge
// Library, so the project team can attach the real RCCAP or observatory file
// without a code change. Matching on type would have been looser and could
// surface an unrelated report under an official heading.
function findEvidenceFile(resources, tag) {
  return (
    resources.find(
      (item) =>
        item.file_key &&
        item.status === "approved" &&
        (item.tags || []).some((candidate) => String(candidate).toLowerCase() === tag)
    ) || null
  );
}

async function renderPhase1(page, lang, t) {
  addBackBar(page, t.backJourney, () => setState({ view: "overview" }));
  const hero = el("section", "regional-phase-hero regional-phase-hero-baseline");
  hero.innerHTML = `<div><span class="regional-eyebrow"></span><h1></h1><p></p></div>`;
  hero.querySelector(".regional-eyebrow").textContent = `${t.phase1} · ${t.phase1Title}`;
  hero.querySelector("h1").textContent = t.phase1Question;
  hero.querySelector("p").textContent = t.phase1Intro;
  page.append(hero);

  const evidence = el("section", "regional-section");
  evidence.innerHTML = `<div class="regional-section-head"><div><span class="regional-section-number">01</span><h2></h2><p></p></div></div><div class="regional-evidence-grid"></div>`;
  evidence.querySelector("h2").textContent = t.evidenceTitle;
  evidence.querySelector(".regional-section-head p").textContent = t.evidenceIntro;
  const evidenceGrid = evidence.querySelector(".regional-evidence-grid");
  const [libraryResources, signedInForFiles] = await Promise.all([
    api("/resources").then((data) => data.items || []).catch(() => []),
    getCurrentUser().then((user) => Boolean(user)).catch(() => false),
  ]);
  evidenceGrid.append(
    evidenceCard(t.sourceRccap, t.sourceRccapDesc, { file: findEvidenceFile(libraryResources, "rccap") }, t, lang, signedInForFiles),
    evidenceCard(t.sourceClimaax, t.sourceClimaaxDesc, { externalUrl: "https://climaax.eu/" }, t, lang, signedInForFiles),
    evidenceCard(t.sourceObservatory, t.sourceObservatoryDesc, { file: findEvidenceFile(libraryResources, "observatory") }, t, lang, signedInForFiles)
  );
  page.append(evidence);

  const systemsSection = el("section", "regional-section regional-systems-section");
  systemsSection.innerHTML = `<div class="regional-section-head"><div><span class="regional-section-number">02</span><h2></h2><p></p></div></div><div class="regional-confirmed-systems"></div>`;
  systemsSection.querySelector("h2").textContent = t.alreadyKnow;
  systemsSection.querySelector(".regional-section-head p").textContent = t.systemsIntro;
  page.append(systemsSection);
  const grid = systemsSection.querySelector(".regional-confirmed-systems");
  try {
    const data = await api("/systems");
    data.items.filter((system) => CONFIRMED_SYSTEM_KEYS.includes(system.key)).sort((a, b) => CONFIRMED_SYSTEM_KEYS.indexOf(a.key) - CONFIRMED_SYSTEM_KEYS.indexOf(b.key)).forEach((system, index) => {
      const card = el("button", "regional-system-card");
      card.type = "button";
      const name = lang === "el" ? system.name_el : system.name_en;
      const description = lang === "el" ? system.description_el : system.description_en;
      card.innerHTML = `<span class="regional-system-icon"></span><span class="regional-system-copy"><small></small><strong></strong><span></span><b></b></span><span class="regional-card-arrow">→</span>`;
      card.querySelector(".regional-system-icon").innerHTML = systemIconSvg(system.icon_key);
      card.querySelector("small").textContent = `0${index + 1}`;
      card.querySelector("strong").textContent = name;
      card.querySelector(".regional-system-copy > span").textContent = description;
      card.querySelector("b").textContent = t.exploreSystem;
      card.addEventListener("click", () => setState({ view: "system", systemId: system.id, tab: "impacts" }));
      grid.append(card);
    });
  } catch (error) {
    grid.append(el("p", "systems-explorer-error", error.message || t.error));
  }

  try { page.append(await renderPhaseForum(REGIONAL_CASE_ID, "phase1", lang)); }
  catch { page.append(buildLoginNotice(t)); }
  renderPhaseNav(page, "phase1", await loadPhaseData(), t);
}

function translatedImpact(name, lang) { return lang === "el" ? (SYSTEM_IMPACTS_EL[name] || name) : name; }
function translatedImpactDescription(name, lang) { return SYSTEM_IMPACT_DESCRIPTIONS[name]?.[lang] || ""; }
function translatedSystemName(name, lang) { return lang === "el" ? (SYSTEM_NAMES_EL[name] || name) : name; }

// Review: the Low/Medium/High badge here was never real classification --
// it was assigned purely from each impact's position in a fixed array
// (`index === 0 ? "high" : ...`), the same fabricated-looking value on every
// visit regardless of who reads it. Removed along with its legend and
// colour coding, rather than kept as decoration with nothing behind it.
// Same tag-based binding as the interdependencies infographic and the
// stakeholder-mapping screenshots -- the project team attaches a real
// assessment extract per impact without a code change.
function climateImpactImageTag(systemKey, impact) {
  return `climate-impact:${systemKey}:${impact.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function renderRiskCards(container, system, lang, t, resources = [], signedIn = false) {
  const grid = el("div", "regional-risk-grid");
  const impacts = SYSTEM_IMPACTS[system.key] || [];
  impacts.forEach((impact) => {
    const title = translatedImpact(impact, lang);
    const card = el("button", "regional-risk-card");
    card.type = "button";
    card.innerHTML = `<span class="regional-risk-card-main"><span class="regional-risk-card-title"></span><span class="regional-risk-card-desc"></span></span><span class="regional-risk-card-cta"></span>`;
    card.querySelector(".regional-risk-card-title").textContent = title;
    card.querySelector(".regional-risk-card-desc").textContent = translatedImpactDescription(impact, lang);
    card.querySelector(".regional-risk-card-cta").textContent = t.viewDetails;
    const tag = climateImpactImageTag(system.key, impact);
    const match = resources.find(
      (item) =>
        item.file_key &&
        item.status === "approved" &&
        String(item.file_type || "").startsWith("image/") &&
        (item.tags || []).some((candidate) => String(candidate).toLowerCase() === tag)
    );
    card.addEventListener("click", () => {
      document.body.append(
        buildDetailTableModal(
          title,
          [
            [t.period, "2041–2070"],
            [t.scenario, "RCP 4.5 / 8.5"],
            [t.note, t.indicative],
          ],
          t,
          { imageUrl: match && signedIn ? `/api/v1/files/${encodeURIComponent(match.file_key)}` : null }
        )
      );
    });
    grid.append(card);
  });
  container.append(grid);
}

// The infographic is one shared regional graphic (not one per system), the
// same tag-based binding already used for evidence documents and
// stakeholder-mapping screenshots -- the project team attaches the real
// material from the project deliverable without a code change.
const INTERDEPENDENCIES_INFOGRAPHIC_TAG = "interdependencies-infographic";

function renderInterdependenciesInfographic(container, resources, signedIn, t) {
  const match = resources.find(
    (item) =>
      item.file_key &&
      item.status === "approved" &&
      String(item.file_type || "").startsWith("image/") &&
      (item.tags || []).some((candidate) => String(candidate).toLowerCase() === INTERDEPENDENCIES_INFOGRAPHIC_TAG)
  );
  const figure = el("figure", "regional-sector-snapshot regional-interdependencies-infographic");
  if (match && signedIn) {
    const image = document.createElement("img");
    image.src = `/api/v1/files/${encodeURIComponent(match.file_key)}`;
    image.alt = t.interdependenciesInfographicAlt;
    image.loading = "lazy";
    figure.append(image);
  } else {
    const placeholder = el("div", "regional-sector-snapshot-empty");
    placeholder.append(el("strong", null, t.interdependenciesInfographicTitle), el("span", null, t.interdependenciesInfographicPending));
    figure.append(placeholder);
  }
  container.append(figure);
}

function renderInterdependencies(container, system, lang, t, resources = [], signedIn = false) {
  renderInterdependenciesInfographic(container, resources, signedIn, t);
}

// Review: the sector-grouped actor cards from the previous pass counted as
// "additional mapping functionality" beyond what was asked for here -- this
// tab now shows only the stakeholder-mapping screenshot for the system,
// bound by tag the same way the interdependencies infographic above is.
function renderStakeholders(container, system, lang, t, resources = [], signedIn = false) {
  const tag = `stakeholder-map:${system.key}`;
  const match = resources.find(
    (item) =>
      item.file_key &&
      item.status === "approved" &&
      String(item.file_type || "").startsWith("image/") &&
      (item.tags || []).some((candidate) => String(candidate).toLowerCase() === tag)
  );
  const figure = el("figure", "regional-sector-snapshot");
  // The file route needs a session, so a guest would only get a broken
  // image; show them the placeholder instead.
  if (match && signedIn) {
    const image = document.createElement("img");
    image.src = `/api/v1/files/${encodeURIComponent(match.file_key)}`;
    image.alt = `${t.stakeholderMappingAltPrefix} ${lang === "el" ? system.name_el : system.name_en}`;
    image.loading = "lazy";
    figure.append(image);
  } else {
    const placeholder = el("div", "regional-sector-snapshot-empty");
    placeholder.append(el("strong", null, t.sectorSnapshot), el("span", null, t.sectorSnapshotPending));
    figure.append(placeholder);
  }
  container.append(figure);
}

function buildLoginNotice(t) {
  const notice = el("section", "regional-forum-login");
  notice.innerHTML = `<p></p><button class="btn secondary small"></button>`;
  notice.querySelector("p").textContent = t.loginNeeded;
  notice.querySelector("button").textContent = t.login;
  notice.querySelector("button").addEventListener("click", () => navigateToNative("login"));
  return notice;
}

// Native vendor modal shell (`.modal-backdrop.systems-explorer-modal-backdrop`
// + `.modal-card`, the pattern already established for the platform's own
// dialogs) reused here so a hand-rolled dialog doesn't drift visually from
// the rest of the platform. `fillCard` receives the `.modal-card` element to
// populate with its own heading/body.
function buildModal(cardClassName, fillCard, t) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop systems-explorer-modal-backdrop";
  overlay.setAttribute("data-no-localize", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = el("div", `modal-card ${cardClassName}`);
  fillCard(card);

  const actions = el("div", "modal-actions");
  const closeBtn = el("button", "btn primary", t.close);
  closeBtn.type = "button";
  actions.append(closeBtn);
  card.append(actions);
  overlay.append(card);

  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKeydown); };
  const onKeydown = (event) => { if (event.key === "Escape") close(); };
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKeydown);

  return overlay;
}

function buildSystemMoreInfoModal(system, lang, t) {
  return buildModal(
    "regional-more-info-card",
    (card) => {
      card.append(el("h2", null, lang === "el" ? system.name_el : system.name_en));
      card.append(el("p", "regional-tab-intro", lang === "el" ? system.description_el : system.description_en));

      const vulnerabilities = lang === "el" ? system.key_vulnerabilities_el : system.key_vulnerabilities_en;
      const priorities = lang === "el" ? system.rccap_priorities_el : system.rccap_priorities_en;
      if (vulnerabilities) {
        card.append(el("h3", null, t.moreInfoVulnerabilities));
        card.append(el("p", null, vulnerabilities));
      }
      if (priorities) {
        card.append(el("h3", null, t.moreInfoPriorities));
        card.append(el("p", null, priorities));
      }
    },
    t
  );
}

// A general discussion thread for a Priority System, shown once at the
// bottom of the system page regardless of which tab is active -- distinct
// from the phase-wide forum on the Phase 1 systems grid, and from a case's
// per-contribution discussions, this is the one place to talk about the
// system as a whole (e.g. "Water").
async function renderSystemForum(system, lang, t) {
  const panel = el("section", "systems-explorer-panel case-phase-forum");
  const head = el("div", "systems-explorer-section-head");
  head.append(el("h3", null, t.systemForumTitle));
  panel.append(head, el("p", "systems-explorer-empty-inline", t.systemForumIntro));
  const list = el("div", "case-phase-forum-list");
  panel.append(list);

  const reload = async () => {
    const data = await api(`/systems/${encodeURIComponent(system.id)}/comments`);
    list.innerHTML = "";
    if (!data.items.length) {
      list.append(el("p", "systems-explorer-empty", t.forumEmpty));
      return;
    }
    data.items.forEach((comment) => {
      const card = el("article", "case-phase-forum-comment");
      const meta = el("div", "contribution-reply-head");
      meta.append(el("strong", null, comment.author_name));
      if (comment.author_org) meta.append(el("span", "contribution-reply-role", comment.author_org));
      if (comment.created_at) {
        meta.append(el("span", "contribution-reply-time", new Date(comment.created_at).toLocaleDateString(lang === "el" ? "el-GR" : "en-GB")));
      }
      card.append(meta, el("p", null, comment.body));
      list.append(card);
    });
  };

  let signedIn = false;
  try {
    signedIn = Boolean(await getCurrentUser());
  } catch {
    signedIn = false;
  }

  if (signedIn) {
    const form = document.createElement("form");
    form.className = "vision-element-propose-form case-phase-forum-form";
    const input = document.createElement("textarea");
    input.placeholder = t.systemForumPlaceholder;
    const submit = el("button", "btn primary small", t.systemForumSubmit);
    submit.type = "submit";
    form.append(input, submit);
    panel.append(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      try {
        await api(`/systems/${encodeURIComponent(system.id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
        input.value = "";
        showToast({ type: "success", title: t.commentPosted });
        await reload();
      } catch (error) {
        showToast({ type: "error", title: t.createdError, message: error.message });
      }
    });
  } else {
    panel.append(buildLoginNotice(t));
  }

  await reload();
  return panel;
}

// A small table popup reused by both the Climate Impacts cards and the
// Interdependencies map -- click a chip/card, see its detail as a table,
// rather than spelling every row out inline on the page at once.
function buildDetailTableModal(title, rows, t, { imageUrl = null } = {}) {
  return buildModal(
    "regional-detail-table-card",
    (card) => {
      card.append(el("h2", null, title));
      const figure = el("figure", "regional-sector-snapshot regional-detail-table-image");
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        figure.append(image);
      } else {
        const placeholder = el("div", "regional-sector-snapshot-empty");
        placeholder.append(el("strong", null, t.impactImageTitle), el("span", null, t.impactImagePending));
        figure.append(placeholder);
      }
      card.append(figure);
      const table = document.createElement("table");
      table.className = "regional-mapping-table";
      table.innerHTML = "<tbody></tbody>";
      rows.forEach(([label, value]) => {
        const row = table.tBodies[0].insertRow();
        row.insertCell().textContent = label;
        row.insertCell().textContent = value;
      });
      card.append(table);
    },
    t
  );
}

async function renderSystem(page, lang, t, current) {
  addBackBar(page, t.alreadyKnow, () => setState({ view: "phase1" }));
  try {
    const data = await api(`/systems/${encodeURIComponent(current.systemId)}`);
    const system = data.system;
    const hero = el("section", "regional-system-hero");
    hero.innerHTML = `<span class="regional-system-icon"></span><div><span class="regional-eyebrow"></span><h1></h1><p></p><button type="button" class="btn secondary small regional-more-info-cta"></button></div>`;
    hero.querySelector(".regional-system-icon").innerHTML = systemIconSvg(system.icon_key);
    hero.querySelector(".regional-eyebrow").textContent = lang === "el" ? "Σύστημα προτεραιότητας · Φάση 1" : "Priority System · Phase 1";
    hero.querySelector("h1").textContent = lang === "el" ? system.name_el : system.name_en;
    hero.querySelector("p").textContent = lang === "el" ? system.description_el : system.description_en;
    const moreInfoButton = hero.querySelector(".regional-more-info-cta");
    moreInfoButton.textContent = t.moreInfo;
    moreInfoButton.addEventListener("click", () => document.body.append(buildSystemMoreInfoModal(system, lang, t)));
    page.append(hero);
    const tabs = el("nav", "regional-tabs");
    [["impacts", t.climateImpacts], ["interdependencies", t.interdependencies], ["stakeholders", t.stakeholderMapping]].forEach(([key, label]) => {
      const button = el("button", current.tab === key ? "active" : "", label);
      button.type = "button";
      button.addEventListener("click", () => setState({ ...current, tab: key }));
      tabs.append(button);
    });
    page.append(tabs);
    const content = el("section", "regional-section regional-tab-panel");
    const title = current.tab === "impacts" ? t.climateImpacts : current.tab === "interdependencies" ? t.systemMapTitle : t.mappedActors;
    content.append(el("h2", null, title));
    const [libraryResources, signedIn] = await Promise.all([
      api("/resources").then((payload) => payload.items || []).catch(() => []),
      getCurrentUser().then((user) => Boolean(user)).catch(() => false),
    ]);
    if (current.tab === "impacts") {
      renderRiskCards(content, system, lang, t, libraryResources, signedIn);
    } else if (current.tab === "interdependencies") {
      renderInterdependencies(content, system, lang, t, libraryResources, signedIn);
    } else {
      renderStakeholders(content, system, lang, t, libraryResources, signedIn);
    }
    page.append(content);
    try {
      page.append(await renderSystemForum(system, lang, t));
    } catch (error) {
      page.append(el("p", "systems-explorer-error", error.message || t.error));
    }
    const footer = el("div", "regional-phase-footer");
    const next = el("button", "btn primary", `${t.continuePhase2} →`);
    next.type = "button"; next.addEventListener("click", () => setState({ view: "phase2" })); footer.append(next); page.append(footer);
  } catch (error) {
    page.append(el("p", "systems-explorer-error", error.message || t.error));
  }
}

const STAKEHOLDER_CATEGORY_LABELS = {
  el: { public: "Δημόσιος τομέας", private: "Ιδιωτικός τομέας", civil: "ΜΚΟ / Κοινωνία των πολιτών", research: "Έρευνα & ακαδημαϊκή κοινότητα" },
  en: { public: "Public sector", private: "Private sector", civil: "NGOs / Civil Society", research: "Research & Academia" },
};
const STAKEHOLDER_CATEGORY_ORDER = ["public", "private", "civil", "research"];

// Fetches how many participants belong to each stakeholder category. Used
// both here (Phase 2) and by the registration-page patch in
// runtime-enhancements.js, so both surfaces show the same numbers.
async function fetchRepresentationCounts() {
  const data = await api(`/cases/${REGIONAL_CASE_ID}/representation`);
  return data.counts || {};
}

function buildRepresentationCounts(lang, t, counts) {
  const grid = el("div", "regional-representation-counts");
  STAKEHOLDER_CATEGORY_ORDER.forEach((key) => {
    const item = el("div", "regional-representation-count");
    item.innerHTML = `<strong></strong><span></span>`;
    item.querySelector("strong").textContent = String(counts[key] || 0);
    item.querySelector("span").textContent = STAKEHOLDER_CATEGORY_LABELS[lang][key];
    grid.append(item);
  });
  return grid;
}

function renderRepresentation(page, lang, t) {
  const section = el("section", "regional-ownership");
  section.innerHTML = `<div><span class="regional-section-number">00</span><h2></h2><p></p></div>`;
  section.querySelector("h2").textContent = t.ownership;
  section.querySelector("p").textContent = t.ownershipQuestion;
  const placeholder = el("div", "regional-representation-counts");
  section.append(placeholder);
  fetchRepresentationCounts()
    .then((counts) => placeholder.replaceWith(buildRepresentationCounts(lang, t, counts)))
    .catch(() => placeholder.remove());
  page.append(section);
}

async function addPhaseStatusControl(hero, phase, t, phaseData) {
  const current = phaseData.items.find((item) => item.phase === phase)?.status || "upcoming";
  const wrap = el("div", "regional-phase-status-control");
  wrap.append(phaseBadge(current, t));
  if (phaseData.canManage) {
    const label = el("label", null, t.statusLabel);
    const select = document.createElement("select");
    [["locked", t.locked], ["upcoming", t.upcoming], ["current", t.current], ["completed", t.completed]].forEach(([value, name]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = name; option.selected = value === current; select.append(option);
    });
    select.addEventListener("change", async () => {
      try { await api(`/cases/${REGIONAL_CASE_ID}/phases/${phase}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); showToast({ type: "success", title: t.statusLabel }); setState({ view: phase }); }
      catch (error) { select.value = current; showToast({ type: "error", title: t.error, message: error.message }); }
    });
    label.append(select); wrap.append(label);
  }
  hero.append(wrap);
}

async function renderSystemsContext(page, lang, t) {
  const section = el("section", "regional-section regional-systems-context");
  section.innerHTML =
    `<div class="regional-section-head regional-section-head-plain"><div><h2></h2><p></p></div></div>` +
    `<div class="regional-context-chips"></div><div class="regional-context-panel"></div>`;
  section.querySelector("h2").textContent = t.systemsContextTitle;
  section.querySelector(".regional-section-head p").textContent = t.systemsContextIntro;
  const chips = section.querySelector(".regional-context-chips");
  const panel = section.querySelector(".regional-context-panel");
  page.append(section);

  let systems = [];
  try {
    const data = await api("/systems");
    systems = data.items
      .filter((system) => CONFIRMED_SYSTEM_KEYS.includes(system.key))
      .sort((a, b) => CONFIRMED_SYSTEM_KEYS.indexOf(a.key) - CONFIRMED_SYSTEM_KEYS.indexOf(b.key));
  } catch {
    section.remove();
    return;
  }

  const hint = el('p', 'regional-context-hint', t.systemsContextHint);
  panel.append(hint);

  const show = (system, chip) => {
    // Single-select: two systems open at once would read as a comparison
    // this section does not actually make.
    chips.querySelectorAll("button").forEach((node) => {
      const active = node === chip;
      node.classList.toggle("active", active);
      node.setAttribute("aria-expanded", active ? "true" : "false");
    });
    panel.innerHTML = "";
    const detail = el("div", "regional-context-detail");
    const impacts = (SYSTEM_IMPACTS[system.key] || []).map((name) => translatedImpact(name, lang));
    const linked = (INTERDEPENDENCIES[system.key] || []).map((name) => translatedSystemName(name, lang));
    [[t.climateImpacts, impacts], [t.interdependencies, linked]].forEach(([label, values]) => {
      if (!values.length) return;
      const group = el("div", "regional-context-group");
      group.append(el("span", "regional-context-label", label));
      const list = el("div", "regional-context-tags");
      values.forEach((value) => list.append(el("span", null, value)));
      group.append(list);
      detail.append(group);
    });
    const open = el("button", "regional-text-button", `${t.systemsContextOpen} →`);
    open.type = "button";
    open.addEventListener("click", () => setState({ view: "system", systemId: system.id, tab: "impacts" }));
    detail.append(open);
    panel.append(detail);
  };

  systems.forEach((system) => {
    const chip = el("button", "regional-context-chip");
    chip.type = "button";
    chip.setAttribute("aria-expanded", "false");
    chip.innerHTML = `<span class="regional-context-chip-icon"></span><span></span>`;
    chip.querySelector(".regional-context-chip-icon").innerHTML = systemIconSvg(system.icon_key);
    chip.querySelector("span:last-child").textContent = lang === "el" ? system.name_el : system.name_en;
    chip.addEventListener("click", () => show(system, chip));
    chips.append(chip);
  });
}

async function renderCollaborativePhase(page, lang, t, phase) {
  addBackBar(page, t.backJourney, () => setState({ view: "overview" }));
  const phaseData = await loadPhaseData();
  const status = phaseData.items.find((item) => item.phase === phase)?.status || (phase === "phase3" ? "locked" : "current");
  const hero = el("section", `regional-phase-hero regional-phase-hero-${phase}`);
  hero.innerHTML = `<div><span class="regional-eyebrow"></span><h1></h1><p></p></div>`;
  hero.querySelector(".regional-eyebrow").textContent = phase === "phase2" ? `${t.phase2} · ${t.phase2Title}` : `${t.phase3} · ${t.phase3Title}`;
  hero.querySelector("h1").textContent = phase === "phase2" ? t.phase2Question : t.phase3Question;
  hero.querySelector("p").textContent = phase === "phase2" ? t.phase2Intro : t.phase3Intro;
  await addPhaseStatusControl(hero, phase, t, phaseData);
  page.append(hero);
  if (phase === "phase2") {
    renderRepresentation(page, lang, t);
  }
  if (phase === "phase3" && status === "locked") {
    const locked = el("section", "regional-locked-panel");
    locked.innerHTML = `<span>🔒</span><div><h2></h2><p></p></div>`;
    locked.querySelector("h2").textContent = t.locked;
    locked.querySelector("p").textContent = t.phase3Locked;
    page.append(locked);
    // The systems stay visible even while the phase is closed: they are the
    // context the phase will run against, and a stakeholder waiting for it to
    // open still benefits from the Phase 1 evidence behind them.
    await renderSystemsContext(page, lang, t);
    // A locked phase still needs the way back, or the only route out is the
    // browser button.
    renderPhaseNav(page, phase, phaseData, t);
    return;
  }

  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("auth");
    // Both collaborative phases only make progression legible if a visitor
    // commits to one Priority System before their steps appear -- showing
    // all of it up front is exactly what the spec asked Phase 2 to avoid,
    // and Phase 3's Options/Pathways need the same framing.
    if (!getPhaseSystem()) {
      await renderPhaseSystemPicker(page, lang, t, phase);
    } else {
      renderPhaseSystemBanner(page, lang, t, phase);
      const workspace = el("section", "regional-embedded-workspace");
      page.append(workspace);
      await renderCaseJourney(workspace, REGIONAL_CASE_ID, lang, { phase, compact: true });
    }
  } catch {
    const empty = el("section", "regional-login-panel");
    empty.innerHTML = `<div class="regional-lock-icon">◉</div><h2></h2><p></p><button class="btn primary"></button>`;
    empty.querySelector("h2").textContent = phase === "phase2" ? t.phase2Title : t.phase3Title;
    empty.querySelector("p").textContent = t.loginNeeded;
    empty.querySelector("button").textContent = t.login;
    empty.querySelector("button").addEventListener("click", () => navigateToNative("login"));
    page.append(empty);
  }
  renderPhaseNav(page, phase, phaseData, t);
}

// The gate the spec asks for: a collaborative phase's own steps stay hidden
// until a visitor commits to one Priority System. The underlying content
// (Futures/Vision/ToC in Phase 2, Options/Pathways in Phase 3) is still
// shared platform-wide (no per-system data model exists yet -- flagged to
// the project team), so this selection frames which system the visitor is
// working on rather than filtering the data itself.
async function renderPhaseSystemPicker(page, lang, t, phase) {
  const section = el("section", "regional-section regional-phase-system-picker");
  section.innerHTML = `<h2></h2><p></p><div class="regional-confirmed-systems"></div>`;
  section.querySelector("h2").textContent = phase === "phase3" ? t.phase3PickTitle : t.phase2PickTitle;
  section.querySelector("p").textContent = phase === "phase3" ? t.phase3PickIntro : t.phase2PickIntro;
  const grid = section.querySelector(".regional-confirmed-systems");
  try {
    const data = await api("/systems");
    data.items
      .filter((system) => CONFIRMED_SYSTEM_KEYS.includes(system.key))
      .sort((a, b) => CONFIRMED_SYSTEM_KEYS.indexOf(a.key) - CONFIRMED_SYSTEM_KEYS.indexOf(b.key))
      .forEach((system, index) => {
        const card = el("button", "regional-system-card");
        card.type = "button";
        card.innerHTML = `<span class="regional-system-icon"></span><span class="regional-system-copy"><small></small><strong></strong><span></span><b></b></span><span class="regional-card-arrow">→</span>`;
        card.querySelector(".regional-system-icon").innerHTML = systemIconSvg(system.icon_key);
        card.querySelector("small").textContent = `0${index + 1}`;
        card.querySelector("strong").textContent = lang === "el" ? system.name_el : system.name_en;
        card.querySelector(".regional-system-copy > span").textContent = lang === "el" ? system.description_el : system.description_en;
        card.querySelector("b").textContent = t.exploreSystem;
        card.addEventListener("click", () => { setPhaseSystem(system.id); setState({ view: phase }); });
        grid.append(card);
      });
  } catch (error) {
    grid.append(el("p", "systems-explorer-error", error.message || t.error));
  }
  page.append(section);
}

function renderPhaseSystemBanner(page, lang, t, phase) {
  const selectedId = getPhaseSystem();
  const banner = el("div", "regional-phase-system-banner");
  banner.innerHTML = `<span class="regional-phase-system-icon"></span><span class="regional-phase-system-copy"><small></small><strong></strong></span><button type="button" class="btn secondary small regional-phase-system-change"></button>`;
  banner.querySelector("small").textContent = t.phase2WorkingOn;
  banner.querySelector(".regional-phase-system-change").textContent = t.phase2ChangeSystem;
  banner.querySelector(".regional-phase-system-change").addEventListener("click", () => { setPhaseSystem(""); setState({ view: phase }); });
  page.append(banner);
  api("/systems")
    .then((data) => {
      const system = data.items.find((item) => item.id === selectedId);
      if (!system) return;
      banner.querySelector(".regional-phase-system-icon").innerHTML = systemIconSvg(system.icon_key);
      banner.querySelector("strong").textContent = lang === "el" ? system.name_el : system.name_en;
    })
    .catch(() => {});
}


export async function syncRegionalJourney() {
  const current = state();
  const nativeView = new URLSearchParams(location.search).get("view") || "home";
  if (!current || nativeView !== "home") {
    document.querySelector(`.${PAGE_CLASS}`)?.remove();
    document.querySelectorAll(`.${NATIVE_HIDDEN}`).forEach((node) => node.classList.remove(NATIVE_HIDDEN));
    return;
  }
  const page = ensurePage();
  if (!page) return;
  const lang = currentLanguage();
  const t = COPY[lang];
  const isCollaborativePhase = current.view === "phase2" || current.view === "phase3";
  const renderKey = `${lang}:${current.view}:${current.systemId || ""}:${current.tab || ""}:${isCollaborativePhase ? getPhaseSystem() : ""}`;
  // MutationObserver passes can fire while an async render is awaiting API
  // data. The render key itself is the lock; allowing a second pass while
  // `rendering` was true duplicated the entire journey surface.
  if (page.dataset.renderKey === renderKey) return;
  page.dataset.renderKey = renderKey;
  page.dataset.rendering = "1";
  page.innerHTML = `<div class="regional-loading">${t.loading}</div>`;
  try {
    page.innerHTML = "";
    if (current.view === "phase1") await renderPhase1(page, lang, t);
    else if (current.view === "system") await renderSystem(page, lang, t, current);
    else if (current.view === "phase2" || current.view === "phase3") await renderCollaborativePhase(page, lang, t, current.view);
    else await renderOverview(page, lang, t);
  } catch (error) {
    page.innerHTML = "";
    page.append(el("p", "systems-explorer-error", error.message || t.error));
  } finally { page.dataset.rendering = "0"; }
  installRegionalNavigation();
}

const HOME_SECTIONS_CLASS = "regional-home-sections";

// A first-time visitor has to be able to answer five questions before they
// commit to opening the journey: what this is, why it exists, how it works,
// who is behind it and where to start. The bundle's own homepage sections
// answer none of them any more -- they still describe Case Studies, a
// Toolkit and a five-step process from an earlier version of the journey --
// so they stay hidden and this builds the current story in their place.
//
// Rebuilt only when the language changes: a full rebuild on every sync pass
// would fight the user's scroll position and re-run every animation.
function renderHomeSections(lang, t) {
  const hero = document.querySelector("main .hero");
  if (!hero) return;
  let host = document.querySelector(`.${HOME_SECTIONS_CLASS}`);
  if (host && host.dataset.renderKey === lang) return;
  if (!host) {
    host = el("div", HOME_SECTIONS_CLASS);
    host.dataset.noLocalize = "true";
    hero.after(host);
  }
  host.dataset.renderKey = lang;
  host.innerHTML = "";

  const section = (kicker, title, body, extraClass, variant = "info") => {
    const node = el("section", `regional-home-section regional-home-section-${variant} ${extraClass || ""}`.trim());
    node.innerHTML = `<span class="regional-eyebrow"></span><h2></h2><p></p>`;
    node.querySelector(".regional-eyebrow").textContent = kicker;
    node.querySelector("h2").textContent = title;
    node.querySelector("p").textContent = body;
    return node;
  };

  // 1. What it is / why it exists, plus the division of labour with AFFiNE.
  const about = section(t.homeWhatKicker, t.homeWhatTitle, t.homeWhatBody, "regional-home-lead", "info");
  const why = el("div", "regional-home-why");
  why.innerHTML = `<h3></h3><p></p>`;
  why.querySelector("h3").textContent = t.homeWhyTitle;
  why.querySelector("p").textContent = t.homeWhyBody;
  about.append(why);
  renderPlatformRoles(about, t);
  host.append(about);

  // 2. How the journey works -- the three phases, each opening that phase
  //    directly, so the homepage explains and routes in one move.
  const how = section(t.homeHowKicker, t.homeHowTitle, t.homeHowBody, "regional-home-how", "actions");
  const phases = el("div", "regional-home-phases");
  [
    ["phase1", t.phase1, t.phase1Title, t.phase1Desc],
    ["phase2", t.phase2, t.phase2Title, t.phase2Desc],
    ["phase3", t.phase3, t.phase3Title, t.phase3Desc],
  ].forEach(([key, phase, title, description], index) => {
    const card = el("button", "regional-home-phase");
    card.type = "button";
    card.innerHTML = `<span class="regional-home-phase-index"></span><span class="regional-home-phase-kicker"></span><strong></strong><span class="regional-home-phase-desc"></span><b class="regional-home-phase-go" aria-hidden="true">→</b>`;
    card.querySelector(".regional-home-phase-index").textContent = String(index + 1);
    card.querySelector(".regional-home-phase-kicker").textContent = phase;
    card.querySelector("strong").textContent = title;
    card.querySelector(".regional-home-phase-desc").textContent = description;
    card.addEventListener("click", () => openRegionalJourney(key));
    phases.append(card);
  });
  how.append(phases);
  host.append(how);

  // 3. Project context and 4. partners.
  host.append(section(t.homeContextKicker, t.homeContextTitle, t.homeContextBody, "regional-home-context", "note"));
  const partners = section(t.homePartnersKicker, t.homePartnersTitle, t.homePartnersBody, "regional-home-partners", "note");
  const partnerGrid = el("div", "regional-partner-grid");
  [
    [t.homePartnerAttica, t.homePartnerAtticaRole],
    [t.homePartnerDraxis, t.homePartnerDraxisRole],
    [t.homePartnerBioassist, t.homePartnerBioassistRole],
    [t.homePartnerP2R, t.homePartnerP2RRole],
  ].forEach(([name, role]) => {
    const card = el("article", "regional-partner-card");
    card.innerHTML = `<strong></strong><span></span>`;
    card.querySelector("strong").textContent = name;
    card.querySelector("span").textContent = role;
    partnerGrid.append(card);
  });
  partners.append(partnerGrid);
  host.append(partners);

  // 5. Where to start -- the journey first, then the supporting pages.
  const start = section(t.homeStartKicker, t.homeStartTitle, t.homeStartBody, "regional-home-start", "actions");
  const primary = el("button", "btn primary large regional-home-start-cta", t.homeCta);
  primary.type = "button";
  primary.addEventListener("click", () => openRegionalJourney("overview"));
  start.append(primary);
  const links = el("div", "regional-home-links");
  [
    [t.navLibrary, t.homeLinkLibrary, () => navigateToNative("library")],
    [t.navGuide, t.homeLinkGuide, () => navigateToNative("guide")],
  ].forEach(([title, description, onOpen]) => {
    const card = el("button", "regional-home-link");
    card.type = "button";
    card.innerHTML = `<strong></strong><span></span><b aria-hidden="true">→</b>`;
    card.querySelector("strong").textContent = title;
    card.querySelector("span").textContent = description;
    card.addEventListener("click", onOpen);
    links.append(card);
  });
  start.append(links);
  host.append(start);
}

export function rewriteHomepage() {
  if (state() || (new URLSearchParams(location.search).get("view") || "home") !== "home") return;
  const lang = currentLanguage();
  const t = COPY[lang];
  const hero = document.querySelector("main .hero");
  if (!hero) return;
  const h1 = hero.querySelector("h1");
  const intro = hero.querySelector(".hero-copy > p");
  const primary = hero.querySelector(".button-row .btn.primary");
  if (h1) h1.textContent = t.homeTitle;
  if (intro) intro.textContent = t.homeIntro;
  if (primary) {
    primary.textContent = t.homeCta;
    primary.onclick = (event) => { event.preventDefault(); event.stopPropagation(); openRegionalJourney("overview"); };
  }
  hero.querySelector(".button-row .btn.secondary")?.classList.add("regional-home-hidden");
  document.querySelectorAll("main > .numbers-strip, main > .platform-section, main > .journey-section, main > .homepage-methodology").forEach((node) => node.classList.add("regional-home-hidden"));
  // The slot now holds the P2R transition cycle, so the accessible name
  // that described a photograph of Attica no longer matches what is there.
  const heroVisual = hero.querySelector(".hero-visual");
  if (heroVisual) {
    // The bundle's localiser rewrites [aria-label] from its own dictionary,
    // so setting it alone loses the race; opt out the way the bundle's own
    // language switcher does.
    heroVisual.setAttribute("data-no-localize", "true");
    heroVisual.setAttribute("role", "img");
    if (heroVisual.getAttribute("aria-label") !== t.heroVisualLabel) {
      heroVisual.setAttribute("aria-label", t.heroVisualLabel);
    }
  }
  hero.classList.add("regional-home-hero");
  renderHomeSections(lang, t);
}

function labelNavButton(button, text) {
  const label = button.querySelector("span:not(.badge)");
  if (label) label.textContent = text;
  else {
    const textNodes = [...button.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
    if (textNodes.length) textNodes[textNodes.length - 1].data = text;
    else button.append(document.createTextNode(text));
  }
}

export function installRegionalNavigation() {
  const lang = currentLanguage();
  const t = COPY[lang];
  document.querySelectorAll(".brand").forEach((brand) => {
    const wordmark = brand.querySelector("b");
    if (wordmark) wordmark.textContent = BRAND_NAME;
    // The bundle's localiser walks [aria-label] and rewrites it from its own
    // translation dictionary, so setting the attribute alone loses the race
    // on every pass. Opt out with the bundle's own escape hatch and supply
    // the accessible name here instead, in both languages.
    brand.setAttribute("data-no-localize", "true");
    const label = `${BRAND_NAME} ${t.brandHome}`;
    if (brand.getAttribute("aria-label") !== label) brand.setAttribute("aria-label", label);
  });
  document.querySelectorAll(".systems-explorer-nav-button").forEach((node) => node.remove());
  document.querySelectorAll(".public-header nav, .app-header nav").forEach((nav) => {
    [...nav.querySelectorAll(":scope > button")].forEach((button) => {
      const text = (button.textContent || "").trim();
      if (/case studies|μελέτες περίπτωσης|toolkit|εργαλειοθήκη/i.test(text)) button.classList.add("regional-nav-obsolete");
      if (/knowledge|βιβλιοθήκη/i.test(text)) labelNavButton(button, t.navLibrary);
      if (/guide|οδηγός/i.test(text)) labelNavButton(button, t.navGuide);
    });
    let journey = nav.querySelector(".regional-journey-nav");
    if (!journey) {
      journey = el("button", "regional-journey-nav");
      journey.type = "button";
      journey.innerHTML = `${systemIconSvg("route")}<span></span>`;
      journey.addEventListener("click", () => openRegionalJourney("overview"));
      nav.prepend(journey);
    }
    journey.querySelector("span").textContent = t.navJourney;
    journey.classList.toggle("active", Boolean(state()));
  });
  document.querySelectorAll("footer button").forEach((button) => {
    const text = button.textContent || "";
    if (/priority systems|συστήματα προτεραιότητας|case studies|μελέτες περίπτωσης/i.test(text)) {
      button.textContent = t.navJourney;
      button.onclick = (event) => { event.preventDefault(); event.stopPropagation(); openRegionalJourney("overview"); };
    }
  });
}

export function installRegionalJourney() {
  installRegionalNavigation();
  rewriteHomepage();
  syncRegionalJourney();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state()) closeRegionalJourney();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".brand")) return;
    sessionStorage.removeItem(STATE_KEY);
  }, true);
}
