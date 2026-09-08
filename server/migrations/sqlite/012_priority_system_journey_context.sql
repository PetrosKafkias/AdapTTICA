-- Phase 1 "Prepare the Ground" context for every Priority System:
-- the admin-curated "Where are we now?" description, key vulnerabilities
-- and RCCAP priorities the System Overview page reads. Seeded here rather
-- than in seed.js so an existing database picks it up on migrate.

update systems set
  description = '{"el":"Η ανθεκτικότητα των υδάτων συνδέει λεκάνες απορροής, δίκτυα ύδρευσης, αποχέτευση ομβρίων και παράκτιους αποδέκτες σε όλη την Αττική.","en":"Water resilience connects catchments, supply networks, stormwater drainage and coastal receiving waters across Attica."}',
  key_vulnerabilities = '{"el":"Ξηρασία και μεταβλητές βροχοπτώσεις, αστικές πλημμύρες, πίεση στα δίκτυα και αλληλεξαρτήσεις με ενέργεια, υγεία και μεταφορές.","en":"Drought and variable rainfall, urban flooding, network stress, and dependencies with energy, health and transport."}',
  rccap_priorities = '{"el":"Χρησιμοποιήστε τα στοιχεία βάσης του ΠεΣΠΚΑ για να εξετάσετε διαχείριση ζήτησης, επαναχρησιμοποίηση νερού, γαλάζιες-πράσινες υποδομές και περιφερειακό συντονισμό.","en":"Use the RCCAP baseline to explore demand management, water reuse, blue-green drainage and regional coordination."}'
where key = 'water';

update systems set
  description = '{"el":"Τα δάση και η βιοποικιλότητα στηρίζουν τη ρύθμιση του κλίματος, του νερού και του εδάφους και συνδέονται άμεσα με την ασφάλεια των κοινοτήτων.","en":"Forests and biodiversity regulate climate, water and soil and are directly connected to community safety."}',
  key_vulnerabilities = '{"el":"Δασικές πυρκαγιές, ξηρασία, κατακερματισμός οικοτόπων, διάβρωση και αργή μεταπυρική αποκατάσταση.","en":"Wildfire, drought, habitat fragmentation, erosion and slow post-fire ecosystem recovery."}',
  rccap_priorities = '{"el":"Συνδέστε πρόληψη, οικολογική αποκατάσταση, παρακολούθηση και τοπική ετοιμότητα σε μία κοινή διαδρομή.","en":"Connect prevention, ecological restoration, monitoring and local preparedness in one shared pathway."}'
where key = 'forest_ecosystems';

update systems set
  description = '{"el":"Η κλιματική ανθεκτικότητα της υγείας αφορά την πρόληψη, την ετοιμότητα υπηρεσιών και την προστασία των περισσότερο εκτεθειμένων ομάδων.","en":"Climate-resilient health combines prevention, service preparedness and protection of the most exposed groups."}',
  key_vulnerabilities = '{"el":"Θερμική καταπόνηση, καπνός από πυρκαγιές, πλημμυρικά επεισόδια, διακοπές υπηρεσιών και άνιση έκθεση.","en":"Heat stress, wildfire smoke, flooding, service disruption and unequal exposure."}',
  rccap_priorities = '{"el":"Συνδυάστε έγκαιρη προειδοποίηση, κοινωνική φροντίδα, ανθεκτικές δομές υγείας και χωρικά δεδομένα ευαλωτότητας.","en":"Combine early warning, social care, resilient health facilities and spatial vulnerability evidence."}'
where key = 'health';

update systems set
  description = '{"el":"Το δομημένο περιβάλλον συγκεντρώνει κατοικία, δημόσιο χώρο και κρίσιμες υποδομές όπου οι κλιματικές πιέσεις γίνονται καθημερινός κίνδυνος.","en":"The built environment brings together housing, public space and critical infrastructure where climate pressures become everyday risks."}',
  key_vulnerabilities = '{"el":"Αστικές πλημμύρες, υπερθέρμανση, υψηλή στεγανοποίηση εδάφους, παλαιό κτιριακό απόθεμα και άνιση πρόσβαση σε ασφαλείς χώρους.","en":"Urban flooding, overheating, sealed surfaces, ageing building stock and unequal access to safe public space."}',
  rccap_priorities = '{"el":"Εξετάστε γαλάζιες-πράσινες υποδομές, δροσερές γειτονιές, αναβάθμιση κτιρίων και ανθεκτικό πολεοδομικό σχεδιασμό.","en":"Explore blue-green infrastructure, cooler neighbourhoods, building upgrades and resilience-led spatial planning."}'
where key = 'built_environment';

update systems set
  description = '{"el":"Οι μεταφορές συνδέουν ανθρώπους, υπηρεσίες και εφοδιαστικές αλυσίδες και πρέπει να λειτουργούν πριν, κατά τη διάρκεια και μετά από ένα κλιματικό συμβάν.","en":"Transport connects people, services and supply chains and must function before, during and after climate events."}',
  key_vulnerabilities = '{"el":"Πλημμυρικά σημεία, θερμική καταπόνηση υποδομών, κατολισθήσεις, διακοπές δικτύου και εξάρτηση κρίσιμων υπηρεσιών.","en":"Flood-prone links, heat stress on infrastructure, landslides, network disruption and critical-service dependencies."}',
  rccap_priorities = '{"el":"Χαρτογραφήστε κρίσιμες συνδέσεις και εναλλακτικές, δώστε προτεραιότητα σε ανθεκτικές υποδομές και ενσωματώστε σχέδια συνέχειας.","en":"Map critical links and alternatives, prioritise resilient infrastructure and integrate continuity planning."}'
where key = 'transport';

update systems set
  description = '{"el":"Η ενεργειακή ανθεκτικότητα διασφαλίζει αξιόπιστη και προσιτή ενέργεια για νοικοκυριά, υπηρεσίες και κρίσιμες υποδομές.","en":"Energy resilience safeguards reliable and affordable power for households, services and critical infrastructure."}',
  key_vulnerabilities = '{"el":"Αιχμές ζήτησης λόγω ζέστης, βλάβες δικτύου, έκθεση εγκαταστάσεων και ενεργειακή ευαλωτότητα νοικοκυριών.","en":"Heat-driven demand peaks, network failures, exposed assets and household energy vulnerability."}',
  rccap_priorities = '{"el":"Συνδυάστε ενεργειακή αποδοτικότητα, αποκεντρωμένη παραγωγή, αποθήκευση και προστασία κρίσιμων εγκαταστάσεων.","en":"Combine energy efficiency, distributed generation, storage and protection of critical facilities."}'
where key = 'energy';

update systems set
  description = '{"el":"Ο τουρισμός εξαρτάται από ασφαλείς τόπους, φυσικούς πόρους και υπηρεσίες που μπορούν να προσαρμόζονται σε μεταβαλλόμενες κλιματικές συνθήκες.","en":"Tourism depends on safe places, natural assets and services that can adapt to changing climate conditions."}',
  key_vulnerabilities = '{"el":"Καύσωνες, λειψυδρία, παράκτια διάβρωση, πυρκαγιές και εποχική πίεση σε τοπικές υποδομές.","en":"Heatwaves, water scarcity, coastal erosion, wildfire and seasonal pressure on local infrastructure."}',
  rccap_priorities = '{"el":"Διαφοροποιήστε εποχές και δραστηριότητες, προστατεύστε φυσικά και πολιτιστικά αγαθά και μειώστε την πίεση σε νερό και ενέργεια.","en":"Diversify seasons and activities, protect natural and cultural assets and reduce pressure on water and energy."}'
where key = 'tourism';

update systems set
  description = '{"el":"Οι παράκτιες ζώνες συνδέουν οικισμούς, οικοσυστήματα, τουρισμό και υποδομές σε ένα δυναμικό μέτωπο κλιματικού κινδύνου.","en":"Coastal zones connect settlements, ecosystems, tourism and infrastructure along a dynamic climate-risk frontier."}',
  key_vulnerabilities = '{"el":"Άνοδος στάθμης θάλασσας, διάβρωση, παράκτιες πλημμύρες, απώλεια οικοτόπων και συγκρούσεις χρήσεων γης.","en":"Sea-level rise, erosion, coastal flooding, habitat loss and competing land uses."}',
  rccap_priorities = '{"el":"Συνδυάστε προστασία, προσαρμογή και χωρικό σχεδιασμό με λύσεις βασισμένες στη φύση και σαφή σημεία απόφασης.","en":"Combine protection, accommodation and spatial planning with nature-based solutions and clear decision points."}'
where key = 'coastal_zones';

update systems set
  description = '{"el":"Η γεωργία και η κτηνοτροφία εξαρτώνται από νερό, υγιή εδάφη, βιοποικιλότητα και σταθερές αλυσίδες παραγωγής.","en":"Agriculture and livestock depend on water, healthy soils, biodiversity and reliable production chains."}',
  key_vulnerabilities = '{"el":"Ξηρασία, θερμική καταπόνηση, ακραίες βροχοπτώσεις, διάβρωση εδάφους, νέοι εχθροί και ασθένειες.","en":"Drought, heat stress, extreme rainfall, soil erosion, pests and emerging diseases."}',
  rccap_priorities = '{"el":"Εξετάστε αποδοτική άρδευση, ανθεκτικές καλλιέργειες, υγεία εδάφους, αγροδασικά συστήματα και κοινές υπηρεσίες πρόγνωσης.","en":"Explore efficient irrigation, resilient crops, soil health, agroforestry and shared forecasting services."}'
where key = 'agriculture_livestock';

update systems set
  description = '{"el":"Η πολιτική προστασία είναι οριζόντιο σύστημα που συνδέει πρόληψη, ετοιμότητα, απόκριση και ανάκαμψη σε όλες τις προτεραιότητες.","en":"Civil protection is a cross-cutting system connecting prevention, preparedness, response and recovery across every priority."}',
  key_vulnerabilities = '{"el":"Ταυτόχρονα συμβάντα, κατακερματισμένη πληροφόρηση, άνισες τοπικές δυνατότητες και αλληλεξαρτήσεις κρίσιμων υποδομών.","en":"Compound events, fragmented information, uneven local capacity and critical-infrastructure dependencies."}',
  rccap_priorities = '{"el":"Ενοποιήστε δεδομένα κινδύνου, κοινά πρωτόκολλα, ασκήσεις ετοιμότητας, έγκαιρη προειδοποίηση και σχέδια ανάκαμψης.","en":"Integrate risk data, shared protocols, preparedness exercises, early warning and recovery planning."}'
where key = 'emergency_response';
