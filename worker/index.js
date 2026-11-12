// Worker Cloudflare: serve il sito (cartella dist) e la funzione /api/proxy
// che prima girava su Vercel (api/proxy.js). Stesso comportamento: inoltra la richiesta e restituisce il JSON.
// Per sicurezza accetta solo i servizi usati dall'app (CoinGecko e Fear & Greed).

const HOST_PERMESSI = ["api.coingecko.com", "api.alternative.me"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/proxy") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      return proxy(request);
    }
    return env.ASSETS.fetch(request);
  },
};
