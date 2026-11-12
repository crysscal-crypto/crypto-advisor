// Worker Cloudflare: serve il sito (cartella dist) e la funzione /api/proxy
// che prima girava su Vercel (api/proxy.js). Stesso comportamento: inoltra la richiesta e restituisce il JSON.
// Per sicurezza accetta solo i servizi usati dall'app (CoinGecko e Fear & Greed).

const HOST_PERMESSI = ["api.coingecko.com", "api.alternative.me"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST",
};

function json(dati, status = 200) {
  return new Response(JSON.stringify(dati), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function proxy(request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return json({ error: "Missing url" }, 400);

  let destinazione;
  try {
    destinazione = new URL(url);
  } catch {
    return json({ error: "Invalid url" }, 400);
  }
  if (destinazione.protocol !== "https:" || !HOST_PERMESSI.includes(destinazione.hostname)) {
    return json({ error: "Host not allowed" }, 403);
  }

  try {
    const risposta = await fetch(destinazione.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const dati = await risposta.json();
    return json(dati, 200);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// Analisi IA con Gemini (piano gratuito). Serve il segreto GEMINI_API_KEY sul Worker.
async function analisiAI(request, env) {
  if (request.method !== "POST") return json({ error: "Usa POST" }, 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Analisi IA non configurata (manca GEMINI_API_KEY)." }, 500);
  const { prompt } = await request.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string" || prompt.length > 4000) return json({ error: "Richiesta non valida" }, 400);

  const modelli = [env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash", "gemini-2.5-flash", "gemini-flash-lite-latest"].filter(Boolean);
  let ultimoErrore = "";
  for (const modello of modelli) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
          }),
        }
      );
      const d = await r.json();
      const testo = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
      if (r.ok && testo) return json({ text: testo });
      ultimoErrore = d?.error?.message || `errore ${r.status}`;
    } catch (e) {
      ultimoErrore = e.message;
    }
  }
  return json({ error: "Analisi non disponibile: " + ultimoErrore }, 502);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/proxy") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      return proxy(request);
    }
    if (pathname === "/api/ai") return analisiAI(request, env);
    return env.ASSETS.fetch(request);
  },
};
