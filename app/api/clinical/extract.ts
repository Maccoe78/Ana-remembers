import { KEYWORDS, matchesAny } from "./symptoms";

export type ExtractedObservation = {
  type: string;          // bv. "dyspnea_score" of "symptom.chest_pain"
  value: any;            // number/boolean/string
  sourceQuote: string;   // stukje bewijs voor audit
};


export function extractObservations(userText: string): ExtractedObservation[] {
  const obs: ExtractedObservation[] = [];

  if (matchesAny(userText, KEYWORDS.chestPain)) {
    obs.push({ type: "symptom.chest_pain", value: true, sourceQuote: "borstpijn" });
  }
  if (matchesAny(userText, KEYWORDS.fainting)) {
    obs.push({ type: "symptom.fainting", value: true, sourceQuote: "flauwvallen" });
  }
  if (matchesAny(userText, KEYWORDS.severeSobRest)) {
    obs.push({ type: "symptom.severe_sob_at_rest", value: true, sourceQuote: "benauwd in rust" });
  }

  
  if (matchesAny(userText, KEYWORDS.ankleSwelling)) {
    obs.push({ type: "ankle_swelling", value: true, sourceQuote: "enkels gezwollen" });
  }

  if (matchesAny(userText, KEYWORDS.missedMeds)) {
    obs.push({ type: "missed_meds", value: true, sourceQuote: "medicatie gemist/vergeten" });
  }

  const mScore = userText.match(/(\d{1,2})\s*\/\s*10/);
  if (mScore) {
    const score = Number(mScore[1]);
    if (!Number.isNaN(score) && score >= 0 && score <= 10) {
      obs.push({ type: "dyspnea_score", value: score, sourceQuote: mScore[0] });
    }
  }

  const mKg = userText.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (mKg) {
    const kg = Number(mKg[1].replace(",", "."));
    if (!Number.isNaN(kg) && kg > 0) {
      obs.push({ type: "weight_kg", value: kg, sourceQuote: mKg[0] });
    }
  }

  if (matchesAny(userText, KEYWORDS.stairsWorse)) {
    obs.push({ type: "activity_tolerance_stairs", value: "worse", sourceQuote: "traplopen slechter" });
  } else if (matchesAny(userText, KEYWORDS.stairsBetter)) {
    obs.push({ type: "activity_tolerance_stairs", value: "better", sourceQuote: "traplopen beter" });
  } else if (matchesAny(userText, KEYWORDS.stairsSame)) {
    obs.push({ type: "activity_tolerance_stairs", value: "same", sourceQuote: "traplopen hetzelfde" });
  }

  return obs;
}