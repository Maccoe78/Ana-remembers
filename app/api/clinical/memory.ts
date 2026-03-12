import { pool } from "@/src/db";

export async function getLatestFacts(patientId: string) {
  const types = [
    "dyspnea_score",
    "weight_kg",
    "ankle_swelling",
    "missed_meds",
    "activity_tolerance_stairs",
    "symptom.chest_pain",
    "symptom.fainting",
    "symptom.severe_sob_at_rest"
  ];

  const r = await pool.query<{
    type: string;
    value_jsonb: any;
    observed_at: string;
    source_quote: string;
  }>(
    `
    SELECT DISTINCT ON (type)
      type, value_jsonb, observed_at, source_quote
    FROM observations
    WHERE patient_id = $1
      AND type = ANY($2)
    ORDER BY type, observed_at DESC
    `,
    [patientId, types]
  );

  const latest: Record<string, { value: any; observedAt: string; quote: string }> = {};
  for (const row of r.rows) {
    latest[row.type] = {
      value: row.value_jsonb?.value,
      observedAt: row.observed_at,
      quote: row.source_quote
    };
  }
  return latest;
}