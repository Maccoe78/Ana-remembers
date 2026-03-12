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

  // Enkelzwelling: expliciet geen zwelling scoort false, anders true
  if (matchesAny(userText, KEYWORDS.noAnkleSwelling)) {
    obs.push({ type: "ankle_swelling", value: false, sourceQuote: "geen zwelling" });
  } else if (matchesAny(userText, KEYWORDS.ankleSwelling)) {
    obs.push({ type: "ankle_swelling", value: true, sourceQuote: "enkels gezwollen" });
  }

  // Gemiste medicatie: probeer het aantal dagen te extraheren
  if (matchesAny(userText, KEYWORDS.missedMeds)) {
    const mDays = userText.match(/(\d+)\s*dag/);
    const missedDays = mDays ? Number(mDays[1]) : 1;
    obs.push({ type: "missed_meds", value: missedDays, sourceQuote: userText.slice(0, 80) });
  }

  // Benauwdheid: score als getal OF zin als "een 7"
  const mScoreFraction = userText.match(/(\d{1,2})\s*\/\s*10/);
  const mScoreWord = userText.match(/(?:een|een\s+)?(\d{1,2})(?:\s*van\s*(?:de\s*)?10)?/);
  if (mScoreFraction) {
    const score = Number(mScoreFraction[1]);
    if (!Number.isNaN(score) && score >= 0 && score <= 10) {
      obs.push({ type: "dyspnea_score", value: score, sourceQuote: mScoreFraction[0] });
    }
  } else if (mScoreWord) {
    const score = Number(mScoreWord[1]);
    if (!Number.isNaN(score) && score >= 0 && score <= 10) {
      obs.push({ type: "dyspnea_score", value: score, sourceQuote: mScoreWord[0] });
    }
  }

  // Gewicht in kg
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