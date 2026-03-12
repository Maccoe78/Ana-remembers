"use client";

import { useState } from "react";

export default function Home() {
  const [patientId, setPatientId] = useState("margaret");
  const [userText, setUserText] = useState("Het is erger en mijn enkels zijn gezwollen. 7/10 benauwd.");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setResult(null);

    const r = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, userText })
    });

    const data = await r.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Ana Remembers – Heart Failure Check-in</h1>

      <div style={{ marginBottom: 12 }}>
        <label>Patient ID</label>
        <br />
        <input value={patientId} onChange={(e) => setPatientId(e.target.value)} />
      </div>

      <div>
        <label>Patient message</label>
        <br />
        <textarea
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          rows={5}
          style={{ width: "100%" }}
        />
      </div>

      <button onClick={send} disabled={loading} style={{ marginTop: 12 }}>
        {loading ? "Bezig..." : "Verstuur check-in"}
      </button>

      {result?.aiText && (
        <>
          <h2>AI antwoord</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{result.aiText}</pre>
        </>
      )}

      <h2>Debug JSON</h2>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {result ? JSON.stringify(result, null, 2) : ""}
      </pre>
    </main>
  );
}
