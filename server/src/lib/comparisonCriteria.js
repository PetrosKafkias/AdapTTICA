// The assessment brief's initial criteria set, applied at two levels: an
// Adaptation Option (measure) and a whole Pathway share one rating
// vocabulary rather than two independent sets.
//
// This array is the SINGLE source of truth. The API returns it to the client
// with every assessment payload, so the UI never carries its own copy, and
// the database no longer pins the list in a CHECK constraint (migration 018)
// -- the brief states these criteria may change.
export const COMPARISON_CRITERIA = [
  "effectiveness",
  "applicability",
  "feasibility",
  "co_benefits",
  "trade_off_risk",
  "transformative_potential",
  "adaptivity",
];
