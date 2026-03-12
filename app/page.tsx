"use client";

import { useState, useRef, useEffect } from "react";

type Message = { role: "ai" | "user"; text: string };
type Phase = "askName" | "chatting" | "done";

export default function Home() {
  const [patientName, setPatientName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [phase, setPhase] = useState<Phase>("askName");
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll naar beneden als er een nieuw bericht is
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const name = nameInput.trim();
    setPatientName(name);
    setPhase("chatting");
    setLoading(true);

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: name.toLowerCase(),
        userText: "__start__",
        questionIndex: 0
      })
    });
    const data = await res.json();
    setMessages([{ role: "ai", text: data.aiText }]);
    setLoading(false);
  }

  async function sendAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answerInput.trim() || loading || phase === "done") return;

    const text = answerInput.trim();
    setAnswerInput("");
    setLoading(true);

    // Voeg het bericht van de gebruiker direct toe aan de chat
    setMessages(prev => [...prev, { role: "user", text }]);

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: patientName.toLowerCase(),
        userText: text,
        questionIndex
      })
    });
    const data = await res.json();

    setMessages(prev => [...prev, { role: "ai", text: data.aiText }]);

    if (data.done) {
      setPhase("done");
    } else {
      setQuestionIndex(data.nextQuestionIndex);
    }
    setLoading(false);
  }

  // --- Fase 1: naam invullen ---
  if (phase === "askName") {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "system-ui" }}>
        <form onSubmit={startChat} style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
          <h1 style={{ margin: 0 }}>Ana – Check-in</h1>
          <p style={{ margin: 0, color: "#555" }}>Wat is je naam?</p>
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Vul je naam in..."
            style={{ padding: "10px 14px", fontSize: 16, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <button
            type="submit"
            style={{ padding: "10px 14px", fontSize: 16, borderRadius: 8, background: "#0070f3", color: "#fff", border: "none", cursor: "pointer" }}
          >
            Start gesprek
          </button>
        </form>
      </main>
    );
  }

  // --- Fase 2 & 3: chat ---
  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 600 }}>
        Ana – Check-in voor {patientName}
      </div>

      {/* Berichtenlijst */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "ai" ? "flex-start" : "flex-end",
              background: m.role === "ai" ? "#f0f0f0" : "#0070f3",
              color: m.role === "ai" ? "#111" : "#fff",
              padding: "10px 14px",
              borderRadius: 12,
              maxWidth: "80%",
              whiteSpace: "pre-wrap"
            }}
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", color: "#999", fontStyle: "italic" }}>Ana typt...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Invoer */}
      <form onSubmit={sendAnswer} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eee" }}>
        <input
          autoFocus
          value={answerInput}
          onChange={e => setAnswerInput(e.target.value)}
          placeholder={phase === "done" ? "Gesprek afgerond" : "Typ je antwoord..."}
          disabled={loading || phase === "done"}
          style={{ flex: 1, padding: "10px 14px", fontSize: 15, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <button
          type="submit"
          disabled={loading || phase === "done"}
          style={{ padding: "10px 18px", borderRadius: 8, background: "#0070f3", color: "#fff", border: "none", cursor: "pointer" }}
        >
          Stuur
        </button>
      </form>
    </main>
  );
}