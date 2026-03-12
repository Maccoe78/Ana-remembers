import { NextResponse } from "next/server";
import { pool } from "@/src/db";
import { extractObservations } from "@/app/api/clinical/extract";
import { getLatestFacts } from "@/app/api/clinical/memory";
import { decideEscalation } from "@/app/api/clinical/escalation";

type CheckinRequest = {
  patientId: string;
  userText: string;
};

async function callOllama(prompt: string) {
  const r = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma3:4b",
      prompt,
      stream: false
    })
  });

  if (!r.ok) throw new Error(await r.text());
  const data = (await r.json()) as { response?: string };
  return data.response ?? "";
}

export async function POST(req: Request) {
  const body = (await req.json()) as CheckinRequest;

  if (!body?.patientId || !body?.userText) {
    return NextResponse.json({ error: "patientId and userText are required" }, { status: 400 });
  }

    // 1) Extract structured observations from user text
  const extracted = extractObservations(body.userText);

  // 2) Load latest facts for memory/trend comparisons
  const latest = await getLatestFacts(body.patientId);

  // 3) Decide escalation with transparent rules (no diagnosis)
  const escalation = decideEscalation(extracted, latest);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 4) Ensure patient exists
    await client.query(
      `INSERT INTO patients (id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [body.patientId, body.patientId]
    );

    // 5) Insert session (ai_text later)
    const sessionRes = await client.query<{ id: string }>(
      `INSERT INTO sessions (patient_id, user_text, ai_text)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [body.patientId, body.userText, ""]
    );
    const sessionId = sessionRes.rows[0].id;

    // 6) Store observations with evidence quote
    for (const o of extracted) {
      await client.query(
        `INSERT INTO observations (patient_id, session_id, type, value_jsonb, source_quote)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [body.patientId, sessionId, o.type, JSON.stringify({ value: o.value }), o.sourceQuote]
      );
    }

    // 7) Store escalation decision (even if "none", useful for audit)
    await client.query(
      `INSERT INTO escalations (patient_id, session_id, level, reasons, evidence)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        body.patientId,
        sessionId,
        escalation.level,
        JSON.stringify(escalation.reasons),
        JSON.stringify({ extracted })
      ]
    );

    /**
     * 8) Build prompt with MEMORY (latest facts) + guardrails.
     * Belangrijk: LLM mag alleen refereren aan facts die wij geven.
     */
    const knownFactsLines = Object.entries(latest).map(
      ([type, v]) => `- ${type}: ${JSON.stringify(v.value)} (at ${v.observedAt})`
    );

    const prompt = [
      "Je bent Ana, een AI assistent voor hartfalen week-check-ins (schoolproject).",
      "BELANGRIJK:",
      "- Verzín geen medische geschiedenis/medicatie/symptomen.",
      "- Geen diagnose, geen medisch advies. Alleen triage-taal.",
      "- Als ESCALATION_LEVEL = urgent, zeg dat je nu een nurse/clinician gaat inschakelen.",
      "",
      `ESCALATION_LEVEL: ${escalation.level}`,
      `ESCALATION_REASONS: ${escalation.reasons.join("; ") || "none"}`,
      "",
      "LAATSTE BEKENDE FEITEN (memory):",
      knownFactsLines.length ? knownFactsLines.join("\n") : "- (geen eerdere facts gevonden)",
      "",
      `PATIENT ZEI NU: "${body.userText}"`,
      "",
      "Taken:",
      "1) Reageer warm in het Nederlands.",
      "2) Als urgent: zeg dat je direct gaat escaleren.",
      "3) Stel daarna 1-2 concrete vervolgvragen uit de checklist: benauwdheid 0-10, gewicht, enkelzwelling, medicatie gemist, traplopen beter/zelfde/slechter.",
      "4) Als patient iets zegt dat niet in hartfalen checklist zit (bv. keelpijn), erken het en vraag 1 korte verduidelijking, maar blijf bij triage (geen diagnose)."
    ].join("\n");

    const aiText = await callOllama(prompt);

    // 9) Save ai response
    await client.query(`UPDATE sessions SET ai_text = $1 WHERE id = $2`, [aiText, sessionId]);

    await client.query("COMMIT");

    return NextResponse.json({
      sessionId,
      extracted,
      escalation,
      aiText
    });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}