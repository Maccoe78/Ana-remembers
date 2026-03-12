import { NextResponse } from "next/server";

type LlmRequest = {
  prompt: string;
  model?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LlmRequest;

    if (!body?.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "Missing 'prompt' string" }, { status: 400 });
    }

    const model = body.model ?? "gemma3:4b";

    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: body.prompt,
        stream: false
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const data = (await r.json()) as { response?: string };
    return NextResponse.json({ text: data.response ?? "" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}