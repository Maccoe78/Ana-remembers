import { NextResponse } from "next/server";
import { pool } from "@/src/db";
import { extractObservations } from "@/app/api/clinical/extract";
import { getLatestFacts } from "@/app/api/clinical/memory";
import { decideEscalation } from "@/app/api/clinical/escalation";

type CheckinRequest = {
  patientId: string;
  userText: string;
  questionIndex?: number;
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

const INSULTS = ["rot op", "je moeder", "hou je bek", "flikker op", "klootzak", "lul", "kut", "fuck", "shit"];

// START: correctie-woorden die aan het begin van de zin staan
const CORRECTION_AT_START = ["maar ", "nee maar", "wacht ", "nee hoor", "nee, ", "oh wacht", "ow ", "eigenlijk "];
// ANYWHERE: correctie-woorden die overal in de zin kunnen staan
// Let op: "eigenlijk" staat hier NIET — "ja eigenlijk wel" is gewoon een antwoord
const CORRECTION_ANYWHERE = ["ik bedoel", "bedoel ik", "inplaats van", "in plaats van", "wacht even", "toch wel maar", "heb ik toch niet", "eigenlijk niet", "eigenlijk wel maar", "toch eventjes", "toch even"];

// Klachten dat een vraag overgeslagen is → ga één stap terug
const SKIP_COMPLAINTS = ["over de vraag heen", "vraag vergeten", "die vraag niet", "niet gevraagd", "je skipte", "je slaat over", "je hebt niet gevraagd", "je vergeet", "die vraag over", "heen gegaan"];

// Vragen gericht AAN de bot (bevatten "ben je", "doe je", "snap je" etc.)
// Dit zijn geen check-in verduidelijkingen maar opmerkingen/frustraties
const BOT_DIRECTED = ["ben je ", "ben jij ", "doe je ", "snap je ", "begrijp je ", "luister je ", "hoor je ", "zie je ", "ga je "];

function classifyAnswer(answer: string): "VALID" | "RETRY" | "CORRECTION" | "QUESTION" | "SKIP_COMPLAINT" {
  const lower = answer.toLowerCase().trim();
  if (lower.length === 0) return "RETRY";
  if (INSULTS.some(w => lower.includes(w))) return "RETRY";
  // Klacht over overgeslagen vraag → terug naar vorige vraag
  if (SKIP_COMPLAINTS.some(w => lower.includes(w))) return "SKIP_COMPLAINT";
  // Vraag gericht aan de bot zelf → RETRY (geen echte checkin-vraag)
  if (lower.endsWith("?") && BOT_DIRECTED.some(w => lower.includes(w))) return "RETRY";
  // Echte verduidelijkingsvraag van de patiënt
  if (lower.endsWith("?")) return "QUESTION";
  if (CORRECTION_AT_START.some(w => lower.startsWith(w))) return "CORRECTION";
  if (CORRECTION_ANYWHERE.some(w => lower.includes(w))) return "CORRECTION";
  return "VALID";
}

// Verwijder alle zinnen die eindigen op ? uit een AI-reactie.
// Dit voorkomt dat de AI zijn eigen vraag stelt vóórdat wij de hardcoded vraag toevoegen.
function stripQuestions(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/) // splits op zin-grenzen
    .filter(s => !s.trim().endsWith("?"))
    .join(" ")
    .trim();
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
    const isFirstSession = knownFactsLines.length === 0;

    // Context-afhankelijke vragen: eerste sessie vs herhaalbezoek
    const questions = isFirstSession ? [
      "Op een schaal van 0 tot 10, hoe benauwd voel je je nu?",
      "Zijn je enkels of benen gezwollen?",
      "Hoeveel weeg je op dit moment? (of bij benadering)",
      "Neem je elke dag je medicijnen in?",
      "Hoeveel kun je bewegen? Kun je bijvoorbeeld traplopen?"
    ] : [
      "Op een schaal van 0 tot 10, hoe benauwd ben je deze week — beter of slechter dan vorige keer?",
      "Heb je last van gezwollen enkels of benen?",
      "Weet je wat je nu weegt? Is dat veranderd ten opzichte van vorige week?",
      "Heb je deze week al je medicijnen elke dag ingenomen?",
      "Hoe ging het met bewegen deze week — kon je traplopen?"
    ];

    // 8) Bouw de prompt op basis van de fase
    const qIndex = body.questionIndex ?? 0;
    const isStart = body.userText === "__start__";

    // Persona-instructie die altijd meegaat
    const persona = [
      `Je bent Ana, een warme en menselijke AI zorgassistent voor hartfalen check-ins (schoolproject).`,
      `Praat zoals een echte, betrokken zorgmedewerker: kort, natuurlijk, geen herhaling van dezelfde zinnen.`,
      `Gebruik GEEN vaste openingszinnen zoals "Dat is goed om te horen" of "Ik begrijp dat" elke keer.`,
      `Varieer je reacties. Wees empathisch maar bondig.`,
      ``,
      `SCHAALINTERPRETATIE (belangrijk voor je reacties):`,
      `- Benauwdheid 0-10: 0 = helemaal niet benauwd (goed nieuws!), 10 = zeer ernstig.`,
      `  Een score van 0, 1 of 2 is geruststellend. Reageer positief hierop, NIET bezorgd.`,
      `  Een score van 7 of hoger is zorgelijk.`,
      `- Enkelzwelling: geen zwelling = goed nieuws.`,
      `- Medicijnen: elke dag ingenomen = goed nieuws.`,
      `- Bewegen/traplopen: beter dan vorige week = goed nieuws.`,
    ].join("\n");

    let prompt: string;
    let done = false;
    let validAnswer = true;
    let isCorrection = false;
    let isSkipComplaint = false;
    let currentQuestion = "";

    if (isStart) {
      const previousSummary = isFirstSession
        ? `Dit is het eerste gesprek met deze patiënt. Stel je even kort voor.`
        : `Eerdere bekende feiten:\n${knownFactsLines.join("\n")}\nVerwelkom de patiënt terug en verwijs kort naar het vorige gesprek als dat relevant is.`;

      prompt = [
        persona,
        `Groet de patiënt "${body.patientId}" bij naam.`,
        previousSummary,
        `Stel daarna ALLEEN deze eerste vraag en wacht op antwoord:`,
        `"${questions[0]}"`
      ].join("\n");
    } else {
      currentQuestion = questions[qIndex];
      const nextIndex = qIndex + 1;
      done = nextIndex >= questions.length;

      // Altijd eerst classificeren — ook op de laatste vraag
      const classification = classifyAnswer(body.userText);
      validAnswer = classification !== "RETRY";
      isCorrection = classification === "CORRECTION";
      isSkipComplaint = classification === "SKIP_COMPLAINT";
      const isQuestion = classification === "QUESTION";

      if (isSkipComplaint) {
        // Patiënt klaagt dat een vraag overgeslagen is → terug naar vorige vraag
        const skippedIndex = Math.max(0, qIndex - 1);
        const skippedQuestion = questions[skippedIndex];
        prompt = [
          persona,
          `De patiënt "${body.patientId}" geeft aan dat je een vraag hebt overgeslagen.`,
          `Bied kort excuses aan (1 zin, geen vraagteken). Wij stellen de overgeslagen vraag opnieuw.`
        ].join("\n");

        const reaction = await callOllama(prompt);
        const aiText = `${stripQuestions(reaction)}\n\n${skippedQuestion}`;
        await client.query(`UPDATE sessions SET ai_text = $1 WHERE id = $2`, [aiText, sessionId]);
        await client.query("COMMIT");
        return NextResponse.json({
          sessionId, extracted, escalation,
          aiText, done: false, nextQuestionIndex: skippedIndex
        });

      } else if (!validAnswer) {
        // Belediging, frustratie of vraag gericht aan de bot
        prompt = [
          persona,
          `De patiënt "${body.patientId}" zei: "${body.userText}"`,
          `Dit is geen antwoord op de check-in vraag maar een opmerking of frustratie richting jou.`,
          `Reageer kort en rustig — erken de opmerking zonder te verdedigen of uitleggen (max 1 zin, geen vraagteken).`,
          `Schrijf GEEN vraag. Wij voegen de check-in vraag daarna toe.`
        ].join("\n");

        const reaction = await callOllama(prompt);
        const aiText = `${stripQuestions(reaction)}\n\n${currentQuestion}`;
        await client.query(`UPDATE sessions SET ai_text = $1 WHERE id = $2`, [aiText, sessionId]);
        await client.query("COMMIT");
        return NextResponse.json({
          sessionId, extracted, escalation,
          aiText, done: false, nextQuestionIndex: qIndex
        });

      } else if (isQuestion) {
        // Patiënt stelt een verduidelijkingsvraag (eindigt op ?).
        // Beantwoord de vraag en herhaal de huidige check-in vraag.
        prompt = [
          persona,
          `De patiënt "${body.patientId}" stelt een vraag: "${body.userText}"`,
          `De context is de check-in vraag die je net stelde: "${currentQuestion}"`,
          `Beantwoord de verduidelijkingsvraag kort en praktisch (1-2 zinnen).`,
          `Schrijf GEEN nieuwe vraag, eindig NIET met een vraagteken. Wij herhalen de check-in vraag zelf.`
        ].join("\n");

        const reaction = await callOllama(prompt);
        const aiText = `${stripQuestions(reaction)}\n\n${currentQuestion}`;
        await client.query(`UPDATE sessions SET ai_text = $1 WHERE id = $2`, [aiText, sessionId]);
        await client.query("COMMIT");
        return NextResponse.json({
          sessionId, extracted, escalation,
          aiText, done: false, nextQuestionIndex: qIndex
        });

      } else if (isCorrection) {
        // Patiënt corrigeert een vorig antwoord.
        // Het gecorrigeerde antwoord zit al in zijn bericht — we hoeven de vraag NIET opnieuw te stellen.
        // We erkennen de correctie en gaan door met de HUIDIGE vraag (qIndex blijft hetzelfde).
        prompt = [
          persona,
          `De patiënt "${body.patientId}" corrigeert een eerder antwoord: "${body.userText}"`,
          `De gecorrigeerde informatie is nu bekend. Erken dit heel kort (max 1 zin, geen vraagteken).`,
          `Wij stellen de huidige vraag daarna.`
        ].join("\n");

        const reaction = await callOllama(prompt);
        const aiText = `${stripQuestions(reaction)}\n\n${currentQuestion}`;
        await client.query(`UPDATE sessions SET ai_text = $1 WHERE id = $2`, [aiText, sessionId]);
        await client.query("COMMIT");
        return NextResponse.json({
          sessionId, extracted, escalation,
          aiText, done: false, nextQuestionIndex: qIndex
        });

      } else if (done) {
        // Laatste vraag beantwoord: sluitend bericht
        prompt = [
          persona,
          `De patiënt "${body.patientId}" antwoordde op de laatste vraag: "${body.userText}".`,
          `ESCALATION_LEVEL: ${escalation.level}`,
          escalation.level === "urgent"
            ? `BELANGRIJK: Zeg dat je nu direct een verpleegkundige inschakelt.`
            : ``,
          `Schrijf een korte, warme afsluiting (2-3 zinnen).`,
          `Bedank de patiënt persoonlijk, vat kort samen wat je gehoord hebt, en zeg dat je volgende week weer incheckt.`
        ].join("\n");

      } else {
        // Normaal antwoord op een tussenvraag.
        // BELANGRIJK: de AI schrijft ALLEEN een korte reactie op het antwoord (1 zin, geen vraag).
        // De backend voegt de volgende vraag zelf toe — zo kan hij nooit overgeslagen worden.
        prompt = [
          persona,
          `De patiënt "${body.patientId}" antwoordde "${body.userText}" op de vraag: "${currentQuestion}".`,
          `Schrijf ALLEEN een korte, natuurlijke reactie op dit antwoord (maximaal 1 zin).`,
          `Schrijf GEEN volgende vraag. Eindig NIET met een vraagteken. Wij voegen de vraag zelf toe.`,
          escalation.level === "urgent"
            ? `BELANGRIJK: vermeld ook kort dat je een verpleegkundige inschakelt.`
            : ``
        ].join("\n");
      }
    }

    // AI genereert de reactie
    const reaction = await callOllama(prompt);

    // Bouw het uiteindelijke bericht:
    // - VALID tussenvraag: reactie van AI + volgende vraag (hardcoded door ons)
    // - CORRECTION: reactie van AI + zelfde vraag opnieuw (hardcoded door ons)
    // - Start of afsluiting: alleen het AI-antwoord
    let aiText: string;
    if (!isStart && validAnswer && !done && !isCorrection) {
      const nextQuestion = questions[qIndex + 1];
      aiText = `${stripQuestions(reaction)}\n\n${nextQuestion}`;
    } else {
      aiText = reaction.trim();
    }

    const nextQuestionIndex = validAnswer ? (isStart ? 0 : qIndex + 1) : qIndex;

    // 9) Save ai response
    await client.query(`UPDATE sessions SET ai_text = $1 WHERE id = $2`, [aiText, sessionId]);

    await client.query("COMMIT");

    return NextResponse.json({
      sessionId,
      extracted,
      escalation,
      aiText,
      done: !isStart && done && validAnswer,
      nextQuestionIndex: done ? null : nextQuestionIndex
    });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}