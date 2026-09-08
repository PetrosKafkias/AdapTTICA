// Shared read-side shape for every co-creation content type that supports
// the same propose / reply / agree-disagree / merge pattern (Alternative
// Futures, Vision Elements, Adaptation Options, Pathway proposals) — avoids
// four near-identical hand-rolled vote/reply-count queries.

export async function voteTally(db, table, idColumn, targetId) {
  const votes = await db.all(`select value, count(*) as count from ${table} where ${idColumn} = ? group by value`, targetId);
  const agree = votes.find((v) => v.value === "agree")?.count || 0;
  const disagree = votes.find((v) => v.value === "disagree")?.count || 0;
  return { agree_count: agree, disagree_count: disagree };
}

export async function replyCount(db, table, idColumn, targetId) {
  const row = await db.get(`select count(*) as c from ${table} where ${idColumn} = ?`, targetId);
  return row.c;
}

// Step 2's collective assessment: the value most stakeholders picked for
// each of the four Low/Medium/High criteria (a mode, not an average -- these
// are ordinal labels, not numbers, until the score below), plus the overall
// score the automatic prioritisation ranks by. Kept as one small function so
// the weighting (currently a flat High=3/Medium=2/Low=1 sum) can change
// later without touching every call site.
const OPTION_ASSESSMENT_CRITERIA = ["effectiveness", "feasibility", "co_benefits", "transformative_potential"];
const OPTION_ASSESSMENT_LEVEL_SCORE = { low: 1, medium: 2, high: 3 };

function modeOf(values) {
  const counts = {};
  values.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export async function aggregateOptionAssessment(db, optionId) {
  const rows = await db.all("select * from option_assessments where option_id = ?", optionId);
  if (!rows.length) return { count: 0, collective: null, score: 0 };
  const collective = {};
  for (const criterion of OPTION_ASSESSMENT_CRITERIA) {
    collective[criterion] = modeOf(rows.map((row) => row[criterion]));
  }
  collective.robust_across_futures = modeOf(rows.map((row) => row.robust_across_futures));
  const score = OPTION_ASSESSMENT_CRITERIA.reduce((sum, criterion) => sum + OPTION_ASSESSMENT_LEVEL_SCORE[collective[criterion]], 0);
  return { count: rows.length, collective, score };
}

// "Evaluate Pathways" (Design Portfolio of Interventions, sub-tab 2): the
// same mode-based Low/Medium/High collective result and transparent scoring
// as the Adaptation Options assessment above, applied to the pathway-level
// criteria the methodology doc specifies (Risk reduction, Feasibility,
// Cost, Co-benefits, Transformative potential, Flexibility) instead of the
// Options ones -- kept as its own small function since the criteria list
// and table are genuinely different, not a variant of the same table.
export const PATHWAY_EVALUATION_CRITERIA = ["risk_reduction", "feasibility", "cost", "co_benefits", "transformative_potential", "flexibility"];
const PATHWAY_EVALUATION_LEVEL_SCORE = { low: 1, medium: 2, high: 3 };

export async function aggregatePathwayEvaluation(db, pathwayId) {
  const rows = await db.all("select * from pathway_evaluations where pathway_id = ?", pathwayId);
  if (!rows.length) return { count: 0, collective: null, score: 0 };
  const collective = {};
  for (const criterion of PATHWAY_EVALUATION_CRITERIA) {
    collective[criterion] = modeOf(rows.map((row) => row[criterion]));
  }
  const score = PATHWAY_EVALUATION_CRITERIA.reduce((sum, criterion) => sum + PATHWAY_EVALUATION_LEVEL_SCORE[collective[criterion]], 0);
  return { count: rows.length, collective, score };
}

// Per-criterion average score for every Adaptation Option (measure) in a
// case -- the "measure-level assessment" a Pathway's calculated profile is
// built from (journey doc), and also what the Options step itself shows.
export async function optionCriteriaAverages(db, caseId) {
  const rows = await db.all(
    `select option_id, criterion, avg(score) as average, count(*) as rating_count
     from option_comparisons where case_id = ? group by option_id, criterion`,
    caseId
  );
  const byOption = {};
  for (const row of rows) {
    byOption[row.option_id] ||= {};
    byOption[row.option_id][row.criterion] = { average: Math.round(row.average * 10) / 10, rating_count: row.rating_count };
  }
  return byOption;
}
