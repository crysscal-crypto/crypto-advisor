import { useState, useEffect, useCallback, useRef } from "react";

// ─── PALETTE ───────────────────────────────────────────────────────────────
const C = {
  bg: "#060810",
  panel: "#0b0e1a",
  border: "#141929",
  borderBright: "#1e2840",
  accent: "#00d4ff",
  accentDim: "#00d4ff22",
  green: "#00e676",
  greenDim: "#00e67622",
  red: "#ff3d5a",
  redDim: "#ff3d5a22",
  yellow: "#ffd600",
  yellowDim: "#ffd60022",
  purple: "#b388ff",
  purpleDim: "#b388ff22",
  textPrimary: "#e8edf8",
  textSecondary: "#7c8db5",
  textDim: "#3a4a6b",
};

// ─── CRYPTO LIST ───────────────────────────────────────────────────────────
const COINS = [
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "cardano", symbol: "ADA", name: "Cardano" },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "matic-network", symbol: "MATIC", name: "Polygon" },
  { id: "chainlink", symbol: "LINK", name: "Chainlink" },
];

// ─── INDICATORI ────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;
  const macd = ema12 - ema26;
  // signal line: EMA9 of MACD (approximated)
  return { macd, signal: macd * 0.85, histogram: macd * 0.15 };
}

function calcBollinger(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: sma + 2 * std, middle: sma, lower: sma - 2 * std, std };
}

function calcATR(ohlc, period = 14) {
  if (ohlc.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < ohlc.length; i++) {
    const high = ohlc[i][2], low = ohlc[i][3], prevClose = ohlc[i - 1][4];
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcSupportResistance(closes) {
  const sorted = [...closes].sort((a, b) => a - b);
  const n = sorted.length;
  const support = sorted[Math.floor(n * 0.1)];
  const resistance = sorted[Math.floor(n * 0.9)];
  const midpoint = (support + resistance) / 2;
  return { support, resistance, midpoint };
}

function detectMarketRegime(closes, atr, price) {
  if (!atr || closes.length < 20) return "sconosciuto";
  const atrPct = (atr / price) * 100;
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  if (atrPct > 4) return "volatile";
  if (ema20 && ema50) {
    const trendStrength = Math.abs((ema20 - ema50) / ema50) * 100;
    if (trendStrength > 2) return ema20 > ema50 ? "trend_rialzista" : "trend_ribassista";
  }
  return "laterale";
}

// ─── SCORE SEGNALE ─────────────────────────────────────────────────────────
function computeSignal(ind) {
  const { rsi, ema20, ema50, ema200, macd, bb, price, change24h, atr, regime } = ind;
  let score = 0;
  const reasons = [];

  if (rsi !== null) {
    if (rsi < 30) { score += 3; reasons.push({ t: "RSI fortemente oversold", v: rsi.toFixed(1), good: true }); }
    else if (rsi < 45) { score += 1; reasons.push({ t: "RSI in zona bassa", v: rsi.toFixed(1), good: true }); }
    else if (rsi > 75) { score -= 3; reasons.push({ t: "RSI fortemente overbought", v: rsi.toFixed(1), good: false }); }
    else if (rsi > 60) { score -= 1; reasons.push({ t: "RSI in zona alta", v: rsi.toFixed(1), good: false }); }
    else reasons.push({ t: "RSI neutro", v: rsi.toFixed(1), good: null });
  }

  if (ema20 && ema50) {
    if (ema20 > ema50) { score += 2; reasons.push({ t: "EMA20 > EMA50 (Golden Cross)", v: "↑", good: true }); }
    else { score -= 2; reasons.push({ t: "EMA20 < EMA50 (Death Cross)", v: "↓", good: false }); }
  }

  if (ema200 && price) {
    if (price > ema200) { score += 1; reasons.push({ t: "Prezzo sopra EMA200", v: "bull", good: true }); }
    else { score -= 1; reasons.push({ t: "Prezzo sotto EMA200", v: "bear", good: false }); }
  }

  if (macd) {
    if (macd.macd > 0 && macd.macd > macd.signal) { score += 1; reasons.push({ t: "MACD positivo e sopra signal", v: "+", good: true }); }
    else if (macd.macd < 0) { score -= 1; reasons.push({ t: "MACD negativo", v: "-", good: false }); }
  }

  if (bb && price) {
    const bbPos = (price - bb.lower) / (bb.upper - bb.lower);
    if (bbPos < 0.15) { score += 2; reasons.push({ t: "Prezzo vicino banda lower BB", v: `${(bbPos * 100).toFixed(0)}%`, good: true }); }
    else if (bbPos > 0.85) { score -= 2; reasons.push({ t: "Prezzo vicino banda upper BB", v: `${(bbPos * 100).toFixed(0)}%`, good: false }); }
    else reasons.push({ t: "Prezzo dentro le Bollinger Band", v: `${(bbPos * 100).toFixed(0)}%`, good: null });
  }

  if (change24h < -6) { score += 1; reasons.push({ t: "Forte calo 24h = potenziale rimbalzo", v: `${change24h.toFixed(1)}%`, good: true }); }
  else if (change24h > 8) { score -= 1; reasons.push({ t: "Forte rialzo 24h = attenzione pullback", v: `+${change24h.toFixed(1)}%`, good: false }); }

  // Grid bot suggestion
  let gridAdvice = "";
  if (regime === "laterale") gridAdvice = "✅ Mercato LATERALE: condizioni IDEALI per grid bot. Attiva o mantieni il bot.";
  else if (regime === "volatile") gridAdvice = "⚠️ Mercato VOLATILE: il grid bot può subire perdite rapide. Valuta di ridurre il range o sospendere.";
  else if (regime === "trend_rialzista") gridAdvice = "📈 TREND RIALZISTA: considera grid asimmetrico spostato verso l'alto. Rischio di essere venduto troppo presto.";
  else if (regime === "trend_ribassista") gridAdvice = "📉 TREND RIBASSISTA: il grid bot compra in caduta. Rischio accumulo perdite. Valuta stop del bot.";

  let signal, color, emoji;
  if (score >= 4) { signal = "ENTRA"; color = C.green; emoji = "🟢"; }
  else if (score <= -3) { signal = "ESCI"; color = C.red; emoji = "🔴"; }
  else if (score >= 2) { signal = "POSSIBILE ENTRATA"; color = "#80ff80"; emoji = "🟡"; }
  else if (score <= -1) { signal = "ATTENZIONE"; color = C.yellow; emoji = "🟡"; }
  else { signal = "ATTENDI"; color = C.yellow; emoji = "🟡"; }

  return { signal, color, emoji, score, reasons, gridAdvice, regime };
}

// ─── AI ADVISOR ────────────────────────────────────────────────────────────
async function getAIAdvice(indicators, botConfig, triggers, coinSymbol) {
  const prompt = `Sei un advisor professionale di trading crypto. Analizza questa situazione e dai consigli pratici in italiano, come farebbe un trader esperto.

COIN: ${coinSymbol}/USDT
PREZZO: $${indicators.price?.toFixed(2)}
VARIAZIONE 24H: ${indicators.change24h?.toFixed(2)}%
RSI (14): ${indicators.rsi?.toFixed(1)}
EMA20: $${indicators.ema20?.toFixed(2)}
EMA50: $${indicators.ema50?.toFixed(2)}
EMA200: $${indicators.ema200?.toFixed(2)}
MACD: ${indicators.macd?.macd?.toFixed(2)} (signal: ${indicators.macd?.signal?.toFixed(2)})
BOLLINGER BANDS: upper $${indicators.bb?.upper?.toFixed(2)}, middle $${indicators.bb?.middle?.toFixed(2)}, lower $${indicators.bb?.lower?.toFixed(2)}
ATR (14): $${indicators.atr?.toFixed(2)} (volatilità)
REGIME DI MERCATO: ${indicators.regime}
FEAR & GREED INDEX: ${indicators.fearGreed ?? "N/D"}/100

${botConfig.active ? `
CONFIGURAZIONE BOT GRID DELL'UTENTE:
- Tipo: ${botConfig.type}
- Range: $${botConfig.priceMin} - $${botConfig.priceMax}
- Numero griglie: ${botConfig.gridCount}
- Capitale investito: $${botConfig.capital}
- Profitto per griglia stimato: ${botConfig.gridCount > 0 && botConfig.capital > 0 ? (((botConfig.priceMax - botConfig.priceMin) / botConfig.gridCount / ((botConfig.priceMax + botConfig.priceMin) / 2)) * 100).toFixed(2) : "N/D"}% per ciclo
` : "Nessun bot configurato."}

${triggers.entry ? `TRIGGER ENTRATA UTENTE: $${triggers.entry}` : ""}
${triggers.tp ? `TAKE PROFIT UTENTE: $${triggers.tp}` : ""}
${triggers.sl ? `STOP LOSS UTENTE: $${triggers.sl}` : ""}

Rispondi con:
1. SITUAZIONE ATTUALE (2-3 frasi)
2. COSA FARE ORA (consiglio diretto e specifico)
3. RISCHI DA MONITORARE (2 punti)
4. LIVELLI CHIAVE (supporto/resistenza/trigger suggeriti da te)

Sii diretto, professionale, usa numeri precisi. Max 250 parole.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  return data.content?.[0]?.text ?? "Analisi non disponibile.";
}

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 12,
    ...style
  }}>{children}</div>
);

const Label = ({ children }) => (
  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
    {children}
  </div>
);

const StatRow = ({ label, value, color, sub }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
    <span style={{ fontSize: 12, color: C.textSecondary }}>{label}</span>
    <div style={{ textAlign: "right" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || C.textPrimary }}>{value}</span>
      {sub && <div style={{ fontSize: 10, color: C.textDim }}>{sub}</div>}
    </div>
  </div>
);

const Input = ({ label, value, onChange, placeholder, type = "number", prefix }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4 }}>{label}</div>
    <div style={{ display: "flex", alignItems: "center", background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 8, overflow: "hidden" }}>
      {prefix && <span style={{ padding: "0 10px", color: C.textDim, fontSize: 12 }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          color: C.textPrimary, fontSize: 16, fontWeight: 600, padding: "10px 12px",
        }}
      />
    </div>
  </div>
);

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [coin, setCoin] = useState(COINS[0]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [signal, setSignal] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [fearGreed, setFearGreed] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [countdown, setCountdown] = useState(60);

  // Bot config
  const [botConfig, setBotConfig] = useState({ active: false, type: "spot", priceMin: "", priceMax: "", gridCount: "", capital: "" });
  // Triggers
  const [triggers, setTriggers] = useState({ entry: "", tp: "", sl: "" });

  const REFRESH = 60000;

  const fetchMarket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [priceRes, ohlcRes, fgRes] = await Promise.all([
        fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&community_data=false&developer_data=false`),
        fetch(`https://api.coingecko.com/api/v3/coins/${coin.id}/ohlc?vs_currency=usd&days=30`),
        fetch("https://api.alternative.me/fng/?limit=1"),
      ]);
      const priceData = await priceRes.json();
      const ohlcData = await ohlcRes.json();
      const fgData = await fgRes.json();

      const closes = ohlcData.map(c => c[4]);
      const price = priceData.market_data.current_price.usd;
      const change24h = priceData.market_data.price_change_percentage_24h;
      const volume24h = priceData.market_data.total_volume.usd;
      const high24h = priceData.market_data.high_24h.usd;
      const low24h = priceData.market_data.low_24h.usd;
      const marketCap = priceData.market_data.market_cap.usd;
      const fg = parseInt(fgData.data?.[0]?.value ?? "50");

      const rsi = calcRSI(closes);
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50);
      const ema200 = calcEMA(closes, Math.min(200, closes.length - 1));
      const macd = calcMACD(closes);
      const bb = calcBollinger(closes);
      const atr = calcATR(ohlcData);
      const sr = calcSupportResistance(closes);
      const regime = detectMarketRegime(closes, atr, price);

      const ind = { price, change24h, volume24h, high24h, low24h, marketCap, rsi, ema20, ema50, ema200, macd, bb, atr, sr, regime, fearGreed: fg };
      const sig = computeSignal(ind);

      setMarketData({ price, change24h, volume24h, high24h, low24h, marketCap });
      setIndicators(ind);
      setSignal(sig);
      setFearGreed(fg);
      setLastUpdate(new Date());
      setCountdown(60);

      setSignalHistory(prev => [{
        time: new Date().toLocaleTimeString("it-IT"),
        signal: sig.signal,
        price,
        score: sig.score,
        color: sig.color,
      }, ...prev.slice(0, 9)]);

    } catch (e) {
      setError("Errore dati. Riprovo tra poco...");
    } finally {
      setLoading(false);
    }
  }, [coin]);

  useEffect(() => { fetchMarket(); const i = setInterval(fetchMarket, REFRESH); return () => clearInterval(i); }, [fetchMarket]);
  useEffect(() => { if (loading) return; const i = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000); return () => clearInterval(i); }, [loading]);

  const handleAI = async () => {
    if (!indicators) return;
    setAiLoading(true);
    setAiAdvice(null);
    try {
      const advice = await getAIAdvice({ ...indicators, fearGreed }, botConfig, triggers, coin.symbol);
      setAiAdvice(advice);
    } catch {
      setAiAdvice("Errore nella generazione del consiglio AI.");
    }
    setAiLoading(false);
  };

  const fmt = n => n?.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-";
  const fmtB = n => n ? `$${(n / 1e9).toFixed(2)}B` : "-";

  const fgColor = fg => fg < 25 ? C.red : fg < 45 ? "#ff8c00" : fg < 55 ? C.yellow : fg < 75 ? C.green : "#00ff88";
  const fgLabel = fg => fg < 25 ? "Paura Estrema" : fg < 45 ? "Paura" : fg < 55 ? "Neutro" : fg < 75 ? "Greed" : "Greed Estremo";

  const regimeColor = r => ({ laterale: C.accent, trend_rialzista: C.green, trend_ribassista: C.red, volatile: C.yellow })[r] || C.textSecondary;
  const regimeLabel = r => ({ laterale: "LATERALE", trend_rialzista: "TREND ↑", trend_ribassista: "TREND ↓", volatile: "VOLATILE" })[r] || r;

  // ── CHECK TRIGGERS ──
  const triggerHit = triggers.entry && marketData?.price <= parseFloat(triggers.entry);
  const tpHit = triggers.tp && marketData?.price >= parseFloat(triggers.tp);
  const slHit = triggers.sl && marketData?.price <= parseFloat(triggers.sl);

  const TABS = [
    { id: "dashboard", label: "📊 Dashboard" },
    { id: "bot", label: "🤖 Bot Config" },
    { id: "triggers", label: "🎯 Trigger" },
    { id: "advisor", label: "🧠 AI Advisor" },
    { id: "history", label: "📋 Storico" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.textPrimary, maxWidth: 480, margin: "0 auto" }}>

      {/* HEADER */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 3, textTransform: "uppercase" }}>Crypto Advisor Pro</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{coin.symbol} / USDT</div>
          </div>
          {marketData && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>${fmt(marketData.price)}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: marketData.change24h >= 0 ? C.green : C.red }}>
                {marketData.change24h >= 0 ? "+" : ""}{marketData.change24h?.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Coin selector */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
          {COINS.map(c => (
            <button key={c.id} onClick={() => { setCoin(c); setAiAdvice(null); }}
              style={{
                background: coin.id === c.id ? C.accent : C.bg,
                color: coin.id === c.id ? "#000" : C.textSecondary,
                border: `1px solid ${coin.id === c.id ? C.accent : C.border}`,
                borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>{c.symbol}</button>
          ))}
        </div>
      </div>

      {/* ALERT TRIGGERS */}
      {tpHit && (
        <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, margin: "8px 12px 0", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: C.green }}>
          🎯 TAKE PROFIT RAGGIUNTO! Prezzo: ${fmt(marketData.price)} ≥ Target: ${triggers.tp}
        </div>
      )}
      {slHit && (
        <div style={{ background: C.redDim, border: `1px solid ${C.red}`, margin: "8px 12px 0", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: C.red }}>
          🛑 STOP LOSS RAGGIUNTO! Prezzo: ${fmt(marketData.price)} ≤ SL: ${triggers.sl}
        </div>
      )}
      {triggerHit && !slHit && (
        <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, margin: "8px 12px 0", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: C.accent }}>
          🔔 TRIGGER ENTRATA ATTIVATO! Prezzo: ${fmt(marketData.price)} ≤ ${triggers.entry}
        </div>
      )}

      {/* TABS */}
      <div style={{ display: "flex", background: C.panel, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: "0 0 auto", padding: "10px 14px", fontSize: 11, fontWeight: 700,
              color: tab === t.id ? C.accent : C.textDim,
              background: "transparent", border: "none", cursor: "pointer",
              borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
              whiteSpace: "nowrap",
            }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "12px 12px 80px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <>
            {loading && !marketData && (
              <div style={{ textAlign: "center", padding: 40, color: C.accent }}>⏳ Analisi in corso...</div>
            )}
            {error && (
              <Panel><div style={{ color: C.red, fontSize: 13 }}>{error}</div></Panel>
            )}

            {signal && (
              <>
                {/* SEMAFORO */}
                <div style={{
                  background: `linear-gradient(135deg, ${signal.color}12, ${signal.color}04)`,
                  border: `2px solid ${signal.color}50`,
                  borderRadius: 18, padding: "24px 20px", textAlign: "center", marginBottom: 12, position: "relative"
                }}>
                  <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: `linear-gradient(90deg, transparent, ${signal.color}, transparent)` }} />
                  <div style={{ fontSize: 48, marginBottom: 6 }}>{signal.emoji}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: signal.color, letterSpacing: 2 }}>{signal.signal}</div>
                  <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 6 }}>Score: {signal.score > 0 ? "+" : ""}{signal.score} / 8</div>

                  {/* Score bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 10, color: C.red }}>ESCI</span>
                    <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, position: "relative" }}>
                      <div style={{
                        position: "absolute",
                        left: `${Math.max(0, Math.min(100, ((signal.score + 6) / 12) * 100))}%`,
                        top: -4, width: 14, height: 14, borderRadius: "50%",
                        background: signal.color, transform: "translateX(-50%)",
                        boxShadow: `0 0 8px ${signal.color}`,
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: C.green }}>ENTRA</span>
                  </div>

                  {/* Regime */}
                  <div style={{
                    display: "inline-block", marginTop: 12,
                    background: `${regimeColor(signal.regime)}20`,
                    border: `1px solid ${regimeColor(signal.regime)}40`,
                    borderRadius: 20, padding: "4px 14px",
                    fontSize: 12, fontWeight: 700, color: regimeColor(signal.regime)
                  }}>
                    Mercato: {regimeLabel(signal.regime)}
                  </div>
                </div>

                {/* GRID BOT ADVICE */}
                {signal.gridAdvice && (
                  <Panel style={{ borderColor: C.accentDim }}>
                    <Label>Consiglio per il tuo Bot</Label>
                    <div style={{ fontSize: 13, color: C.textPrimary, lineHeight: 1.6 }}>{signal.gridAdvice}</div>
                  </Panel>
                )}

                {/* QUICK STATS */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { l: "RSI (14)", v: indicators?.rsi?.toFixed(1) ?? "-", c: indicators?.rsi < 35 ? C.green : indicators?.rsi > 70 ? C.red : C.yellow },
                    { l: "Fear & Greed", v: `${fearGreed ?? "-"}/100`, c: fgColor(fearGreed), s: fgLabel(fearGreed) },
                    { l: "ATR (volatilità)", v: indicators?.atr ? `$${indicators.atr.toFixed(2)}` : "-", c: C.purple },
                    { l: "Volume 24h", v: fmtB(marketData?.volume24h), c: C.accent },
                  ].map((item, i) => (
                    <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{item.l}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: item.c }}>{item.v}</div>
                      {item.s && <div style={{ fontSize: 11, color: item.c }}>{item.s}</div>}
                    </div>
                  ))}
                </div>

                {/* INDICATORI DETTAGLIO */}
                <Panel>
                  <Label>Indicatori Tecnici</Label>
                  <StatRow label="EMA 20" value={`$${fmt(indicators?.ema20)}`} color={indicators?.price > indicators?.ema20 ? C.green : C.red} sub={indicators?.price > indicators?.ema20 ? "Prezzo sopra" : "Prezzo sotto"} />
                  <StatRow label="EMA 50" value={`$${fmt(indicators?.ema50)}`} color={indicators?.ema20 > indicators?.ema50 ? C.green : C.red} sub={indicators?.ema20 > indicators?.ema50 ? "Golden Cross" : "Death Cross"} />
                  <StatRow label="EMA 200" value={`$${fmt(indicators?.ema200)}`} color={indicators?.price > indicators?.ema200 ? C.green : C.red} sub={indicators?.price > indicators?.ema200 ? "Zona Bull" : "Zona Bear"} />
                  <StatRow label="BB Upper" value={`$${fmt(indicators?.bb?.upper)}`} color={C.textSecondary} />
                  <StatRow label="BB Middle" value={`$${fmt(indicators?.bb?.middle)}`} color={C.textSecondary} />
                  <StatRow label="BB Lower" value={`$${fmt(indicators?.bb?.lower)}`} color={C.accent} />
                  <StatRow label="MACD" value={indicators?.macd?.macd?.toFixed(3) ?? "-"} color={indicators?.macd?.macd > 0 ? C.green : C.red} />
                  <StatRow label="Supporto" value={`$${fmt(indicators?.sr?.support)}`} color={C.green} />
                  <StatRow label="Resistenza" value={`$${fmt(indicators?.sr?.resistance)}`} color={C.red} />
                  <StatRow label="Midpoint S/R" value={`$${fmt(indicators?.sr?.midpoint)}`} color={C.yellow} />
                  <StatRow label="Min 24h" value={`$${fmt(marketData?.low24h)}`} color={C.red} />
                  <StatRow label="Max 24h" value={`$${fmt(marketData?.high24h)}`} color={C.green} />
                  <StatRow label="Market Cap" value={fmtB(marketData?.marketCap)} color={C.textSecondary} />
                </Panel>

                {/* MOTIVI SEGNALE */}
                <Panel>
                  <Label>Analisi Segnale</Label>
                  {signal.reasons.map((r, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "7px 0", borderBottom: i < signal.reasons.length - 1 ? `1px solid ${C.border}` : "none"
                    }}>
                      <span style={{ fontSize: 12, color: r.good === true ? C.green : r.good === false ? C.red : C.textSecondary }}>
                        {r.good === true ? "▲" : r.good === false ? "▼" : "●"} {r.t}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.good === true ? C.green : r.good === false ? C.red : C.yellow }}>{r.v}</span>
                    </div>
                  ))}
                </Panel>

                {/* UPDATE */}
                <div style={{ textAlign: "center", fontSize: 11, color: C.textDim, marginTop: 4 }}>
                  {lastUpdate && <>Aggiornato {lastUpdate.toLocaleTimeString("it-IT")} · refresh in {countdown}s</>}
                </div>
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <button onClick={fetchMarket} style={{
                    background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 10,
                    color: C.accent, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer"
                  }}>🔄 Aggiorna ora</button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── BOT CONFIG ── */}
        {tab === "bot" && (
          <Panel>
            <Label>Configurazione Grid Bot</Label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["spot", "futures"].map(t => (
                <button key={t} onClick={() => setBotConfig(b => ({ ...b, type: t }))}
                  style={{
                    flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700,
                    background: botConfig.type === t ? C.accent : C.bg,
                    color: botConfig.type === t ? "#000" : C.textSecondary,
                    border: `1px solid ${botConfig.type === t ? C.accent : C.border}`,
                    borderRadius: 8, cursor: "pointer", textTransform: "uppercase"
                  }}>{t}</button>
              ))}
            </div>
            <Input label="Prezzo Minimo Grid ($)" value={botConfig.priceMin} onChange={v => setBotConfig(b => ({ ...b, priceMin: v }))} placeholder="es. 2000" prefix="$" />
            <Input label="Prezzo Massimo Grid ($)" value={botConfig.priceMax} onChange={v => setBotConfig(b => ({ ...b, priceMax: v }))} placeholder="es. 3000" prefix="$" />
            <Input label="Numero di Griglie" value={botConfig.gridCount} onChange={v => setBotConfig(b => ({ ...b, gridCount: v }))} placeholder="es. 20" />
            <Input label="Capitale Investito ($)" value={botConfig.capital} onChange={v => setBotConfig(b => ({ ...b, capital: v }))} placeholder="es. 500" prefix="$" />

            {botConfig.priceMin && botConfig.priceMax && botConfig.gridCount && botConfig.capital && (
              <div style={{ background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 10, padding: 14, marginTop: 8 }}>
                <Label>Riepilogo Bot</Label>
                {(() => {
                  const range = parseFloat(botConfig.priceMax) - parseFloat(botConfig.priceMin);
                  const gridSpacing = range / parseFloat(botConfig.gridCount);
                  const midPrice = (parseFloat(botConfig.priceMax) + parseFloat(botConfig.priceMin)) / 2;
                  const profitPerGrid = (gridSpacing / midPrice) * 100;
                  const capitalPerGrid = parseFloat(botConfig.capital) / parseFloat(botConfig.gridCount);
                  const isInRange = marketData?.price >= parseFloat(botConfig.priceMin) && marketData?.price <= parseFloat(botConfig.priceMax);
                  return (<>
                    <StatRow label="Range totale" value={`$${range.toFixed(2)}`} />
                    <StatRow label="Spazio per griglia" value={`$${gridSpacing.toFixed(2)}`} />
                    <StatRow label="Profitto/griglia" value={`${profitPerGrid.toFixed(2)}%`} color={C.green} />
                    <StatRow label="Capitale/griglia" value={`$${capitalPerGrid.toFixed(2)}`} color={C.accent} />
                    <StatRow label="Prezzo nel range?" value={isInRange ? "✅ SÌ" : "❌ NO"} color={isInRange ? C.green : C.red} />
                    {marketData && <StatRow label="Prezzo attuale" value={`$${fmt(marketData.price)}`} color={isInRange ? C.green : C.yellow} />}
                  </>);
                })()}
              </div>
            )}

            <button onClick={() => setBotConfig(b => ({ ...b, active: !b.active }))} style={{
              width: "100%", marginTop: 14, padding: "13px 0", fontSize: 15, fontWeight: 800,
              background: botConfig.active ? C.greenDim : C.accentDim,
              color: botConfig.active ? C.green : C.accent,
              border: `1px solid ${botConfig.active ? C.green : C.accent}`,
              borderRadius: 10, cursor: "pointer",
            }}>
              {botConfig.active ? "✅ Bot Attivo — Clicca per disattivare" : "▶ Attiva Bot per l'analisi AI"}
            </button>
          </Panel>
        )}

        {/* ── TRIGGERS ── */}
        {tab === "triggers" && (
          <>
            <Panel>
              <Label>🎯 Trigger di Entrata</Label>
              <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
                Imposta il prezzo a cui vuoi entrare. L'app ti avviserà quando il prezzo scende a quel livello.
              </div>
              <Input label="Prezzo Entry ($)" value={triggers.entry} onChange={v => setTriggers(t => ({ ...t, entry: v }))} placeholder={`es. ${marketData ? (marketData.price * 0.95).toFixed(0) : "2800"}`} prefix="$" />
              {triggers.entry && marketData && (
                <div style={{ fontSize: 12, color: C.textSecondary, marginTop: -4, marginBottom: 8 }}>
                  Distanza: {((parseFloat(triggers.entry) - marketData.price) / marketData.price * 100).toFixed(2)}% dal prezzo attuale
                </div>
              )}
            </Panel>

            <Panel>
              <Label>🟢 Take Profit</Label>
              <Input label="Prezzo Take Profit ($)" value={triggers.tp} onChange={v => setTriggers(t => ({ ...t, tp: v }))} placeholder={`es. ${marketData ? (marketData.price * 1.15).toFixed(0) : "3500"}`} prefix="$" />
              {triggers.tp && triggers.entry && (
                <div style={{ fontSize: 12, color: C.green, marginTop: -4 }}>
                  Potenziale guadagno: +{((parseFloat(triggers.tp) - parseFloat(triggers.entry)) / parseFloat(triggers.entry) * 100).toFixed(2)}%
                </div>
              )}
            </Panel>

            <Panel>
              <Label>🔴 Stop Loss</Label>
              <Input label="Prezzo Stop Loss ($)" value={triggers.sl} onChange={v => setTriggers(t => ({ ...t, sl: v }))} placeholder={`es. ${marketData ? (marketData.price * 0.88).toFixed(0) : "2400"}`} prefix="$" />
              {triggers.sl && triggers.entry && (
                <div style={{ fontSize: 12, color: C.red, marginTop: -4 }}>
                  Rischio massimo: -{((parseFloat(triggers.entry) - parseFloat(triggers.sl)) / parseFloat(triggers.entry) * 100).toFixed(2)}%
                </div>
              )}
            </Panel>

            {triggers.entry && triggers.tp && triggers.sl && (
              <Panel style={{ borderColor: C.purple }}>
                <Label>📊 Risk/Reward Ratio</Label>
                {(() => {
                  const risk = Math.abs(parseFloat(triggers.entry) - parseFloat(triggers.sl));
                  const reward = Math.abs(parseFloat(triggers.tp) - parseFloat(triggers.entry));
                  const rr = reward / risk;
                  return (
                    <>
                      <div style={{ fontSize: 28, fontWeight: 900, color: rr >= 2 ? C.green : rr >= 1 ? C.yellow : C.red, textAlign: "center", margin: "8px 0" }}>
                        1 : {rr.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSecondary, textAlign: "center" }}>
                        {rr >= 3 ? "✅ Eccellente" : rr >= 2 ? "✅ Buono" : rr >= 1 ? "⚠️ Accettabile" : "❌ Troppo rischioso"}
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", marginTop: 4 }}>
                        I professionisti usano minimo 1:2
                      </div>
                    </>
                  );
                })()}
              </Panel>
            )}

            {/* Suggerimenti livelli */}
            {indicators?.sr && (
              <Panel>
                <Label>💡 Livelli Suggeriti dall'Analisi</Label>
                <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
                  Basati su supporto/resistenza calcolati sugli ultimi 30 giorni:
                </div>
                {[
                  { l: "Entry suggerito (vicino supporto)", v: `$${fmt(indicators.sr.support * 1.01)}`, c: C.green },
                  { l: "Take Profit suggerito (vicino resistenza)", v: `$${fmt(indicators.sr.resistance * 0.98)}`, c: C.green },
                  { l: "Stop Loss suggerito (sotto supporto)", v: `$${fmt(indicators.sr.support * 0.96)}`, c: C.red },
                  { l: "Midpoint neutro", v: `$${fmt(indicators.sr.midpoint)}`, c: C.yellow },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.textSecondary }}>{item.l}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: item.c }}>{item.v}</span>
                  </div>
                ))}
              </Panel>
            )}
          </>
        )}

        {/* ── AI ADVISOR ── */}
        {tab === "advisor" && (
          <>
            <Panel>
              <Label>🧠 Consigliere AI Personalizzato</Label>
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
                L'AI analizza tutti i tuoi dati (indicatori tecnici, configurazione bot, trigger impostati) e ti dà un consiglio su misura come un trader esperto.
              </div>
              <button onClick={handleAI} disabled={aiLoading || !indicators} style={{
                width: "100%", padding: "14px 0", fontSize: 16, fontWeight: 800,
                background: aiLoading ? C.bg : `linear-gradient(135deg, #6a00ff, #00d4ff)`,
                color: aiLoading ? C.textDim : "#fff",
                border: `1px solid ${aiLoading ? C.border : "#6a00ff"}`,
                borderRadius: 12, cursor: aiLoading ? "not-allowed" : "pointer",
              }}>
                {aiLoading ? "⏳ Analisi in corso..." : "🧠 Chiedi Consiglio all'AI"}
              </button>
            </Panel>

            {aiAdvice && (
              <Panel style={{ borderColor: C.purple }}>
                <Label>Analisi AI — {coin.symbol}/USDT</Label>
                <div style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {aiAdvice}
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  ⚠️ Questo non è consulenza finanziaria. Sempre DYOR.
                </div>
              </Panel>
            )}

            {/* Checklist professionale */}
            <Panel>
              <Label>📋 Checklist del Trader Pro</Label>
              {[
                { ok: indicators?.rsi < 50, t: "RSI sotto 50 (zona favorevole all'acquisto)" },
                { ok: indicators?.ema20 > indicators?.ema50, t: "EMA20 sopra EMA50 (trend positivo)" },
                { ok: indicators?.price > indicators?.ema200, t: "Prezzo sopra EMA200 (mercato bull)" },
                { ok: fearGreed < 50, t: "Fear & Greed sotto 50 (paura = opportunità)" },
                { ok: signal?.regime === "laterale", t: "Mercato laterale (ideale per grid bot)" },
                { ok: !!triggers.sl, t: "Stop Loss impostato (gestione rischio)" },
                { ok: triggers.tp && triggers.sl && triggers.entry && ((parseFloat(triggers.tp) - parseFloat(triggers.entry)) / (parseFloat(triggers.entry) - parseFloat(triggers.sl))) >= 2, t: "Risk/Reward ≥ 1:2" },
                { ok: botConfig.active && botConfig.priceMin && botConfig.priceMax, t: "Bot configurato con range definito" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 16 }}>{item.ok ? "✅" : "⬜"}</span>
                  <span style={{ fontSize: 12, color: item.ok ? C.textPrimary : C.textDim }}>{item.t}</span>
                </div>
              ))}
            </Panel>
          </>
        )}

        {/* ── STORICO ── */}
        {tab === "history" && (
          <Panel>
            <Label>Storico Segnali ({coin.symbol})</Label>
            {signalHistory.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 13, textAlign: "center", padding: 20 }}>
                Nessun segnale ancora. Torna alla Dashboard.
              </div>
            ) : signalHistory.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: h.color }}>{h.signal}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{h.time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>${h.price?.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: C.textSecondary }}>Score: {h.score > 0 ? "+" : ""}{h.score}</div>
                </div>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}