"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [naam, setNaam] = useState("");
  const router = useRouter();

  function handleStart() {
    if (naam.trim() === "") return;
    router.push(`/chat?naam=${encodeURIComponent(naam.trim())}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-400 to-red-600 flex flex-col items-center justify-center p-4">
      {/* Kaartje */}
      <div className="bg-white rounded-3xl shadow-lg p-10 w-full max-w-md flex flex-col items-center gap-6">

        {/* Hart icoon */}
        <div className="bg-gradient-to-br from-red-500 to-red-700 rounded-2xl w-16 h-16 flex items-center justify-center shadow-md">
          <span className="text-white text-3xl">♥</span>
        </div>

        {/* Titel */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Ana Remembers</h1>
          <p className="text-gray-400 text-sm mt-1">Hartfalen monitoring assistent</p>
        </div>

        {/* Naam input */}
        <div className="w-full flex flex-col gap-2">
          <label className="font-semibold text-gray-700 text-sm">Wat is je naam?</label>
          <input
            type="text"
            placeholder="Bijv. Maria Jansen"
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            className="w-full border border-red-200 rounded-xl px-4 py-3 text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
        </div>

        {/* Knop */}
        <button
          onClick={handleStart}
          disabled={naam.trim() === ""}
          className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-3 rounded-xl hover:from-red-600 hover:to-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Start check-in
        </button>

        {/* Info badge */}
        <div className="w-full bg-red-50 border border-red-100 rounded-xl py-3 flex items-center justify-center gap-2 text-red-500 text-sm">
          <span>〜</span>
          <span>Wekelijkse monitoring voor jouw gezondheid</span>
        </div>
      </div>

      {/* Onderste tekst */}
      <p className="text-gray-400 text-sm mt-8">Bij noodgevallen: bel direct 112</p>
    </div>
  );
}
