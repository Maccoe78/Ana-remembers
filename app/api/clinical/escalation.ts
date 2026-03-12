import type { ExtractedObservation } from "./extract";

type LatestFacts = Record<string, { value: any; observedAt: string; quote: string }>;

function getCurrent<T>(extracted: ExtractedObservation[], type: string): T | undefined {
  const hit = extracted.find((o) => o.type === type);
  return hit?.value as T | undefined;
}

export function decideEscalation(extracted: ExtractedObservation[], latest: LatestFacts) {
  const reasons: string[] = [];
  let level: "none" | "nurse" | "urgent" = "none";

  const chestPain = getCurrent<boolean>(extracted, "symptom.chest_pain") === true;
  const fainting = getCurrent<boolean>(extracted, "symptom.fainting") === true;
  const severeSobRest = getCurrent<boolean>(extracted, "symptom.severe_sob_at_rest") === true;

  if (chestPain) reasons.push("Borstpijn genoemd");
  if (fainting) reasons.push("Flauwvallen genoemd");
  if (severeSobRest) reasons.push("Ernstige benauwdheid in rust genoemd");

  if (reasons.length > 0) {
    level = "urgent";
    return { level, reasons };
  }

  const currDyspnea = getCurrent<number>(extracted, "dyspnea_score");
  const lastDyspnea = latest["dyspnea_score"]?.value as number | undefined;

  const currWeight = getCurrent<number>(extracted, "weight_kg");
  const lastWeight = latest["weight_kg"]?.value as number | undefined;

  const currSwelling = getCurrent<boolean>(extracted, "ankle_swelling");
  const lastSwelling = latest["ankle_swelling"]?.value as boolean | undefined;

  const missedMeds = getCurrent<boolean>(extracted, "missed_meds") === true;

  if (typeof currDyspnea === "number" && typeof lastDyspnea === "number") {
    if (currDyspnea >= lastDyspnea + 2) reasons.push(`Benauwdheid score stijgt (${lastDyspnea} → ${currDyspnea})`);
    if (currDyspnea >= 8) reasons.push(`Hoge benauwdheid score (${currDyspnea}/10)`);
  }

  if (typeof currWeight === "number" && typeof lastWeight === "number") {
    const diff = currWeight - lastWeight;
    if (diff >= 2) reasons.push(`Gewicht stijgt snel (+${diff.toFixed(1)} kg t.o.v. vorige meting)`);
  }

  if (currSwelling === true && lastSwelling === false) {
    reasons.push("Nieuwe enkelzwelling t.o.v. vorige keer");
  }

  if (typeof currDyspnea === "number" && currDyspnea >= 6 && currSwelling === true) {
    reasons.push("Benauwdheid + zwelling samen (mogelijk vocht vasthouden)");
  }

  if (missedMeds) reasons.push("Medicatie gemist/vergeten genoemd");

  if (reasons.length > 0) level = "nurse";

  return { level, reasons };
}