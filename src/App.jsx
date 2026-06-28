import { useState, useEffect, useCallback, useRef } from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

const C = {
  bg: "#060810", panel: "#0b0e1a", border: "#141929", borderBright: "#1e2840",
  accent: "#00d4ff", accentDim: "#00d4ff22", green: "#00e676", greenDim: "#00e67622",
  red: "#ff3d5a", redDim: "#ff3d5a22", yellow: "#ffd600", yellowDim: "#ffd60022",
  purple: "#b388ff", purpleDim: "#b388ff22", textPrimary: "#e8edf8",
  textSecondary: "#7c8db5", textDim: "#3a4a6b",
};

const COINS = [
  { id: "ethereum", symbol: "ETH" }, { id: "bitcoin", symbol: "BTC" },
  { id: "solana", symbol: "SOL" }, { id: "binancecoin", symbol: "BNB" },
  { id: "ripple", symbol: "XRP" }, { id: "cardano", symbol: "ADA" },
  { id: "avalanche-2", symbol: "AVAX" }, { id: "dogecoin", symbol: "DOGE" },
  { id: "matic-network", symbol: "MATIC" }, { id: "chainlink", symbol: "LINK" },
];

const TIMEFRAMES = [
  { label: "1G", days: 1 },
  { label: "7G", days: 7 },
  { label: "30G", days: 30 },
  { label: "90G", days: 90 },
];

const proxy = (url) => `/api/proxy?url=${encodeURIComponent(url)}`;

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

function calcRSISeries(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - closes[j - 1];
      if (d > 0) gains += d; else losses += Math.abs(d);
    }
    const ag = gains / period, al = losses / period;
    result[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return result;
}

function calcEMASeries(closes, period) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period) return result;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcBollingerSeries(closes, period = 20) {
  const upper = new Array(closes.length).fill(null);
  const middle = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period);
    upper[i] = sma + 2 * std;
    middle[i] = sma;
    lower[i] = sma - 2 * std;
  }
  return { upper, middle, lower };
}

function calcBollinger(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period);
  return { upper: sma + 2 * std, middle: sma, lower: sma - 2 * std };
}

function calcMACDSeries(closes) {
  const ema12 = calcEMASeries(closes, 12);
  const ema26 = calcEMASeries(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null);
  const signalLine = new Array(closes.length).fill(null);
  const validMacd = macdLine.filter(v => v !== null);
  if (validMacd.length >= 9) {
    const startIdx = macdLine.findIndex(v => v !== null) + 8;
    let sig = validMacd.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    const k = 2 / 10;
    signalLine[startIdx] = sig;
    for (let i = startIdx + 1; i < closes.length; i++) {
      if (macdLine[i] !== null) { sig = macdLine[i] * k + sig * (1 - k); signalLine[i] = sig; }
    }
  }
  const histogram = closes.map((_, i) => macdLine[i] !== null && signalLine[i] !== null ? macdLine[i] - signalLine[i] : null);
  return { macdLine, signalLine, histogram };
}

function calcATR(ohlc, period = 14) {
  if (ohlc.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < ohlc.length; i++) {
    const high = ohlc[i][2], low = ohlc[i][3], pc = ohlc[i - 1][4];
    trs.push(Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcSR(closes) {
  const sorted = [...closes].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    support: sorted[Math.floor(n * 0.1)],
    resistance: sorted[Math.floor(n * 0.9)],
    midpoint: (sorted[Math.floor(n * 0.1)] + sorted[Math.floor(n * 0.9)]) / 2,
  };
}

function detectRegime(closes, atr, price) {
  if (!atr || closes.length < 20) return "sconosciuto";
  const atrPct = (atr / price) * 100;
  const ema20 = calcEMA(closes, 20), ema50 = calcEMA(closes, 50);
  if (atrPct > 4) return "volatile";
  if (ema20 && ema50) {
    const ts = Math.abs((ema20 - ema50) / ema50) * 100;
    if (ts > 2) return ema20 > ema50 ? "trend_rialzista" : "trend_ribassista";
  }
  return "laterale";
}

function computeSignal(ind) {
  const { rsi, ema20, ema50, ema200, macd, bb, price, change24h, regime } = ind;
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
    if (macd.macd > 0 && macd.macd > macd.signal) { score += 1; reasons.push({ t: "MACD positivo", v: "+", good: true }); }
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
  let gridAdvice = "";
  if (regime === "laterale") gridAdvice = "✅ Mercato LATERALE: condizioni IDEALI per grid bot.";
  else if (regime === "volatile") gridAdvice = "⚠️ Mercato VOLATILE: il grid bot può subire perdite rapide.";
  else if (regime === "trend_rialzista") gridAdvice = "📈 TREND RIALZISTA: grid asimmetrico verso l'alto.";
  else if (regime === "trend_ribassista") gridAdvice = "📉 TREND RIBASSISTA: rischio accumulo perdite. Valuta stop del bot.";
  let signal, color, emoji;
  if (score >= 4) { signal = "ENTRA"; color = C.green; emoji = "🟢"; }
  else if (score <= -3) { signal = "ESCI"; color = C.red; emoji = "🔴"; }
  else if (score >= 2) { signal = "POSSIBILE ENTRATA"; color = "#80ff80"; emoji = "🟡"; }
  else if (score <= -1) { signal = "ATTENZIONE"; color = C.yellow; emoji = "🟡"; }
  else { signal = "ATTENDI"; color = C.yellow; emoji = "🟡"; }
  return { signal, color, emoji, score, reasons, gridAdvice, regime };
}

async function getAIAdvice(indicators, botConfig, triggers, coinSymbol) {
  const prompt = `Sei un advisor professionale di trading crypto. Analizza e dai consigli in italiano.
COIN: ${coinSymbol}/USDT | PREZZO: $${indicators.price?.toFixed(2)} | VAR 24H: ${indicators.change24h?.toFixed(2)}%
RSI: ${indicators.rsi?.toFixed(1)} | EMA20: $${indicators.ema20?.toFixed(2)} | EMA50: $${indicators.ema50?.toFixed(2)} | EMA200: $${indicators.ema200?.toFixed(2)}
MACD: ${indicators.macd?.macd?.toFixed(2)} | BB upper: $${indicators.bb?.upper?.toFixed(2)}, lower: $${indicators.bb?.lower?.toFixed(2)}
ATR: $${indicators.atr?.toFixed(2)} | REGIME: ${indicators.regime} | F&G: ${indicators.fearGreed}/100
SUPPORTO: $${indicators.sr?.support?.toFixed(2)} | RESISTENZA: $${indicators.sr?.resistance?.toFixed(2)}
${botConfig.active ? `BOT: ${botConfig.type}, $${botConfig.priceMin}-$${botConfig.priceMax}, ${botConfig.gridCount} griglie, $${botConfig.capital}` : "Nessun bot."}
${triggers.entry ? `ENTRY: $${triggers.entry}` : ""} ${triggers.tp ? `TP: $${triggers.tp}` : ""} ${triggers.sl ? `SL: $${triggers.sl}` : ""}
Rispondi: 1.SITUAZIONE 2.COSA FARE ORA 3.RISCHI 4.LIVELLI CHIAVE. Max 250 parole.`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
  });
  const data = await response.json();
  return data.content?.[0]?.text ?? "Analisi non disponibile.";
}

// Candlestick custom shape
const CandleBar = (props) => {
  const { x, y, width, height, open, close, high, low, payload } = props;
  if (!payload) return null;
  const isUp = payload.close >= payload.open;
  const color = isUp ? "#00e676" : "#ff3d5a";
  const bodyTop = Math.min(payload.open, payload.close);
  const bodyBot = Math.max(payload.open, payload.close);
  const chartMin = props.yAxisMin || 0;
  const chartMax = props.yAxisMax || 1;
  const chartH = props.chartHeight || 300;
  const toY = (val) => chartH - ((val - chartMin) / (chartMax - chartMin)) * chartH;
  const bTop = toY(bodyTop);
  const bBot = toY(bodyBot);
  const hTop = toY(payload.high);
  const hBot = toY(payload.low);
  const cx = x + width / 2;
  const bH = Math.max(1, bBot - bTop);
  return (
    <g>
      <line x1={cx} y1={hTop} x2={cx} y2={hBot} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={bTop} width={Math.max(1, width - 2)} height={bH} fill={color} stroke={color} strokeWidth={0.5} opacity={0.9} />
    </g>
  );
};

const CustomTooltipPrice = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: "#0b0e1a", border: "1px solid #1e2840", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ color: "#7c8db5", marginBottom: 4 }}>{label}</div>
      {d.open && <div style={{ color: "#e8edf8" }}>O: <b>${d.open?.toFixed(2)}</b></div>}
      {d.high && <div style={{ color: "#00e676" }}>H: <b>${d.high?.toFixed(2)}</b></div>}
      {d.low && <div style={{ color: "#ff3d5a" }}>L: <b>${d.low?.toFixed(2)}</b></div>}
      {d.close && <div style={{ color: "#00d4ff" }}>C: <b>${d.close?.toFixed(2)}</b></div>}
      {d.ema20 && <div style={{ color: "#ffd600" }}>EMA20: <b>${d.ema20?.toFixed(2)}</b></div>}
      {d.ema50 && <div style={{ color: "#ff8c00" }}>EMA50: <b>${d.ema50?.toFixed(2)}</b></div>}
      {d.ema200 && <div style={{ color: "#b388ff" }}>EMA200: <b>${d.ema200?.toFixed(2)}</b></div>}
    </div>
  );
};

function CandleCanvas({ data, showEMA20, showEMA50, showEMA200, showBB, support, resistance, entryTrigger, tpTrigger, slTrigger }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data.length) return;
    canvas.width = container.clientWidth;
    canvas.height = 280;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const padL = 58, padR = 8, padT = 10, padB = 22;
    const chartW = W - padL - padR, chartH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b0e1a";
    ctx.fillRect(0, 0, W, H);

    const highs = data.map(d => d.high ?? d.close);
    const lows = data.map(d => d.low ?? d.close);
    const bbUppers = data.map(d => d.bbUpper).filter(Boolean);
    const bbLowers = data.map(d => d.bbLower).filter(Boolean);

    let priceMin = Math.min(...lows, ...bbLowers) * 0.999;
    let priceMax = Math.max(...highs, ...bbUppers) * 1.001;
    if (support) priceMin = Math.min(priceMin, support * 0.998);
    if (resistance) priceMax = Math.max(priceMax, resistance * 1.002);
    const priceRange = priceMax - priceMin || 1;

    const xPos = (i) => padL + (i + 0.5) * (chartW / data.length);
    const yP = (p) => padT + chartH - ((p - priceMin) / priceRange) * chartH;
    const cw = Math.max(1.5, chartW / data.length - 1.5);

    // Grid
    ctx.strokeStyle = "#141929"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = padT + (chartH / 5) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      const price = priceMax - (priceRange / 5) * i;
      ctx.fillStyle = "#3a4a6b"; ctx.font = "9px monospace"; ctx.textAlign = "right";
      ctx.fillText("$" + (price > 999 ? price.toFixed(0) : price.toFixed(2)), padL - 2, y + 3);
    }

    // BB Fill
    if (showBB) {
      ctx.beginPath();
      data.forEach((d, i) => { if (d.bbUpper) { i === 0 ? ctx.moveTo(xPos(i), yP(d.bbUpper)) : ctx.lineTo(xPos(i), yP(d.bbUpper)); }});
      data.slice().reverse().forEach((d, i) => { if (d.bbLower) ctx.lineTo(xPos(data.length - 1 - i), yP(d.bbLower)); });
      ctx.closePath(); ctx.fillStyle = "#00d4ff08"; ctx.fill();
      ["bbUpper", "bbMiddle", "bbLower"].forEach(key => {
        ctx.strokeStyle = "#00d4ff35"; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3]);
        ctx.beginPath();
        data.forEach((d, i) => { if (!d[key]) return; i === 0 ? ctx.moveTo(xPos(i), yP(d[key])) : ctx.lineTo(xPos(i), yP(d[key])); });
        ctx.stroke(); ctx.setLineDash([]);
      });
    }

    // EMA lines
    if (showEMA20) { ctx.strokeStyle = "#ffd600"; ctx.lineWidth = 1.2; ctx.beginPath(); data.forEach((d, i) => { if (!d.ema20) return; i === 0 ? ctx.moveTo(xPos(i), yP(d.ema20)) : ctx.lineTo(xPos(i), yP(d.ema20)); }); ctx.stroke(); }
    if (showEMA50) { ctx.strokeStyle = "#ff8c00"; ctx.lineWidth = 1.2; ctx.beginPath(); data.forEach((d, i) => { if (!d.ema50) return; i === 0 ? ctx.moveTo(xPos(i), yP(d.ema50)) : ctx.lineTo(xPos(i), yP(d.ema50)); }); ctx.stroke(); }
    if (showEMA200) { ctx.strokeStyle = "#b388ff"; ctx.lineWidth = 1.2; ctx.beginPath(); data.forEach((d, i) => { if (!d.ema200) return; i === 0 ? ctx.moveTo(xPos(i), yP(d.ema200)) : ctx.lineTo(xPos(i), yP(d.ema200)); }); ctx.stroke(); }

    // Linee orizzontali
    const hLines = [
      { v: support, c: "#00e676", label: "SUP" },
      { v: resistance, c: "#ff3d5a", label: "RES" },
      { v: entryTrigger, c: "#00d4ff", label: "ENTRY" },
      { v: tpTrigger, c: "#00e676", label: "TP" },
      { v: slTrigger, c: "#ff3d5a", label: "SL" },
    ];
    hLines.forEach(({ v, c, label }) => {
      if (!v) return;
      ctx.strokeStyle = c + "80"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yP(v)); ctx.lineTo(W - padR, yP(v)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c; ctx.font = "bold 9px monospace"; ctx.textAlign = "left";
      ctx.fillText(label, padL + 4, yP(v) - 2);
    });

    // CANDELE
    data.forEach((d, i) => {
      const open = d.open ?? d.close;
      const high = d.high ?? d.close;
      const low = d.low ?? d.close;
      const close = d.close;
      const isGreen = close >= open;
      const color = isGreen ? "#00e676" : "#ff3d5a";
      const x = xPos(i);

      // Stoppino
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yP(high)); ctx.lineTo(x, yP(low)); ctx.stroke();

      // Corpo
      const bodyTop = yP(Math.max(open, close));
      const bodyBot = yP(Math.min(open, close));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      ctx.fillStyle = isGreen ? "#00e676cc" : "#ff3d5acc";
      ctx.fillRect(x - cw / 2, bodyTop, cw, bodyH);
      ctx.strokeStyle = color; ctx.lineWidth = 0.5;
      ctx.strokeRect(x - cw / 2, bodyTop, cw, bodyH);
    });

    // Date labels
    ctx.fillStyle = "#3a4a6b"; ctx.font = "8px monospace"; ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(data.length / 6));
    data.forEach((d, i) => { if (i % step === 0) ctx.fillText(d.time, xPos(i), H - 5); });

  }, [data, showEMA20, showEMA50, showEMA200, showBB, support, resistance, entryTrigger, tpTrigger, slTrigger]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 280 }} />
    </div>
  );
}

const Panel = ({ children, style = {} }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12, ...style }}>{children}</div>
);
const Label = ({ children }) => (
  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>
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
const Input = ({ label, value, onChange, placeholder, prefix }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4 }}>{label}</div>
    <div style={{ display: "flex", alignItems: "center", background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 8, overflow: "hidden" }}>
      {prefix && <span style={{ padding: "0 10px", color: C.textDim, fontSize: 12 }}>{prefix}</span>}
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.textPrimary, fontSize: 16, fontWeight: 600, padding: "10px 12px" }} />
    </div>
  </div>
);

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
  const [chartData, setChartData] = useState([]);
  const [chartTF, setChartTF] = useState(TIMEFRAMES[2]);
  const [chartLoading, setChartLoading] = useState(false);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showBB, setShowBB] = useState(true);
  const [botConfig, setBotConfig] = useState({ active: false, type: "spot", priceMin: "", priceMax: "", gridCount: "", capital: "" });
  const [triggers, setTriggers] = useState({ entry: "", tp: "", sl: "" });

  const fetchChart = useCallback(async (coinId, days) => {
    setChartLoading(true);
    try {
      const ohlcRes = await fetch(proxy(`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`));
      const ohlcData = await ohlcRes.json();
      const closes = ohlcData.map(c => c[4]);
      const ema20s = calcEMASeries(closes, 20);
      const ema50s = calcEMASeries(closes, 50);
      const ema200s = calcEMASeries(closes, Math.min(200, closes.length - 1));
      const bbs = calcBollingerSeries(closes);
      const rsiSeries = calcRSISeries(closes);
      const macdSeries = calcMACDSeries(closes);

      const fmt = (ts) => {
        const d = new Date(ts);
        if (days <= 1) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        if (days <= 7) return d.toLocaleDateString("it-IT", { weekday: "short", hour: "2-digit", minute: "2-digit" });
        return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
      };

      const data = ohlcData.map((c, i) => ({
        time: fmt(c[0]),
        open: c[1], high: c[2], low: c[3], close: c[4],
        ema20: ema20s[i] ? parseFloat(ema20s[i].toFixed(2)) : null,
        ema50: ema50s[i] ? parseFloat(ema50s[i].toFixed(2)) : null,
        ema200: ema200s[i] ? parseFloat(ema200s[i].toFixed(2)) : null,
        bbUpper: bbs.upper[i] ? parseFloat(bbs.upper[i].toFixed(2)) : null,
        bbMiddle: bbs.middle[i] ? parseFloat(bbs.middle[i].toFixed(2)) : null,
        bbLower: bbs.lower[i] ? parseFloat(bbs.lower[i].toFixed(2)) : null,
        rsi: rsiSeries[i] ? parseFloat(rsiSeries[i].toFixed(2)) : null,
        macd: macdSeries.macdLine[i] ? parseFloat(macdSeries.macdLine[i].toFixed(4)) : null,
        macdSignal: macdSeries.signalLine[i] ? parseFloat(macdSeries.signalLine[i].toFixed(4)) : null,
        macdHist: macdSeries.histogram[i] ? parseFloat(macdSeries.histogram[i].toFixed(4)) : null,
        candleColor: c[4] >= c[1] ? "#00e676" : "#ff3d5a",
      }));
      setChartData(data);
    } catch (e) {
      console.error("Chart error", e);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [priceRes, ohlcRes, fgRes] = await Promise.all([
        fetch(proxy(`https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&community_data=false&developer_data=false`)),
        fetch(proxy(`https://api.coingecko.com/api/v3/coins/${coin.id}/ohlc?vs_currency=usd&days=30`)),
        fetch(proxy("https://api.alternative.me/fng/?limit=1")),
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
      const macdVal = (() => { const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26); if (!e12 || !e26) return null; const m = e12 - e26; return { macd: m, signal: m * 0.85 }; })();
      const bb = calcBollinger(closes);
      const atr = calcATR(ohlcData);
      const sr = calcSR(closes);
      const regime = detectRegime(closes, atr, price);
      const ind = { price, change24h, volume24h, high24h, low24h, marketCap, rsi, ema20, ema50, ema200, macd: macdVal, bb, atr, sr, regime, fearGreed: fg };
      const sig = computeSignal(ind);
      setMarketData({ price, change24h, volume24h, high24h, low24h, marketCap });
      setIndicators(ind);
      setSignal(sig);
      setFearGreed(fg);
      setLastUpdate(new Date());
      setCountdown(60);
      setSignalHistory(prev => [{ time: new Date().toLocaleTimeString("it-IT"), signal: sig.signal, price, score: sig.score, color: sig.color }, ...prev.slice(0, 9)]);
    } catch (e) {
      setError("Errore dati. Riprovo tra poco...");
    } finally {
      setLoading(false);
    }
  }, [coin]);

  useEffect(() => {
    fetchMarket();
    fetchChart(coin.id, chartTF.days);
    const i = setInterval(fetchMarket, 60000);
    return () => clearInterval(i);
  }, [fetchMarket, coin]);

  useEffect(() => {
    if (tab === "grafico") fetchChart(coin.id, chartTF.days);
  }, [chartTF, tab]);

  useEffect(() => { if (loading) return; const i = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000); return () => clearInterval(i); }, [loading]);

  const handleAI = async () => {
    if (!indicators) return;
    setAiLoading(true); setAiAdvice(null);
    try { setAiAdvice(await getAIAdvice({ ...indicators, fearGreed }, botConfig, triggers, coin.symbol)); }
    catch { setAiAdvice("Errore nella generazione del consiglio AI."); }
    setAiLoading(false);
  };

  const fmt = n => n?.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-";
  const fmtB = n => n ? `$${(n / 1e9).toFixed(2)}B` : "-";
  const fgColor = fg => fg < 25 ? C.red : fg < 45 ? "#ff8c00" : fg < 55 ? C.yellow : fg < 75 ? C.green : "#00ff88";
  const fgLabel = fg => fg < 25 ? "Paura Estrema" : fg < 45 ? "Paura" : fg < 55 ? "Neutro" : fg < 75 ? "Greed" : "Greed Estremo";
  const regimeColor = r => ({ laterale: C.accent, trend_rialzista: C.green, trend_ribassista: C.red, volatile: C.yellow })[r] || C.textSecondary;
  const regimeLabel = r => ({ laterale: "LATERALE", trend_rialzista: "TREND ↑", trend_ribassista: "TREND ↓", volatile: "VOLATILE" })[r] || r;
  const triggerHit = triggers.entry && marketData?.price <= parseFloat(triggers.entry);
  const tpHit = triggers.tp && marketData?.price >= parseFloat(triggers.tp);
  const slHit = triggers.sl && marketData?.price <= parseFloat(triggers.sl);

  const TABS = [
    { id: "dashboard", label: "📊 Dati" },
    { id: "grafico", label: "📈 Grafico" },
    { id: "bot", label: "🤖 Bot" },
    { id: "triggers", label: "🎯 Trigger" },
    { id: "advisor", label: "🧠 AI" },
    { id: "history", label: "📋 Log" },
  ];

  // Chart price domain
  const priceMin = chartData.length ? Math.min(...chartData.map(d => d.low)) * 0.998 : 0;
  const priceMax = chartData.length ? Math.max(...chartData.map(d => d.high)) * 1.002 : 1;
  const visibleData = chartData;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.textPrimary, maxWidth: 600, margin: "0 auto" }}>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: marketData.change24h >= 0 ? C.green : C.red }}>{marketData.change24h >= 0 ? "+" : ""}{marketData.change24h?.toFixed(2)}%</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
          {COINS.map(c => (
            <button key={c.id} onClick={() => { setCoin(c); setAiAdvice(null); }}
              style={{ background: coin.id === c.id ? C.accent : C.bg, color: coin.id === c.id ? "#000" : C.textSecondary, border: `1px solid ${coin.id === c.id ? C.accent : C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      {tpHit && <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, margin: "8px 12px 0", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: C.green }}>🎯 TAKE PROFIT! ${fmt(marketData.price)}</div>}
      {slHit && <div style={{ background: C.redDim, border: `1px solid ${C.red}`, margin: "8px 12px 0", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: C.red }}>🛑 STOP LOSS! ${fmt(marketData.price)}</div>}
      {triggerHit && !slHit && <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, margin: "8px 12px 0", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: C.accent }}>🔔 ENTRY TRIGGER! ${fmt(marketData.price)}</div>}

      <div style={{ display: "flex", background: C.panel, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: "0 0 auto", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: tab === t.id ? C.accent : C.textDim, background: "transparent", border: "none", cursor: "pointer", borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 12px 80px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <>
            {loading && !marketData && <div style={{ textAlign: "center", padding: 40, color: C.accent }}>⏳ Analisi in corso...</div>}
            {error && <Panel><div style={{ color: C.red, fontSize: 13 }}>{error}</div></Panel>}
            {signal && (
              <>
                <div style={{ background: `linear-gradient(135deg, ${signal.color}12, ${signal.color}04)`, border: `2px solid ${signal.color}50`, borderRadius: 18, padding: "24px 20px", textAlign: "center", marginBottom: 12, position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: `linear-gradient(90deg, transparent, ${signal.color}, transparent)` }} />
                  <div style={{ fontSize: 48, marginBottom: 6 }}>{signal.emoji}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: signal.color, letterSpacing: 2 }}>{signal.signal}</div>
                  <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 6 }}>Score: {signal.score > 0 ? "+" : ""}{signal.score} / 8</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 10, color: C.red }}>ESCI</span>
                    <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, position: "relative" }}>
                      <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, ((signal.score + 6) / 12) * 100))}%`, top: -4, width: 14, height: 14, borderRadius: "50%", background: signal.color, transform: "translateX(-50%)", boxShadow: `0 0 8px ${signal.color}` }} />
                    </div>
                    <span style={{ fontSize: 10, color: C.green }}>ENTRA</span>
                  </div>
                  <div style={{ display: "inline-block", marginTop: 12, background: `${regimeColor(signal.regime)}20`, border: `1px solid ${regimeColor(signal.regime)}40`, borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700, color: regimeColor(signal.regime) }}>
                    Mercato: {regimeLabel(signal.regime)}
                  </div>
                </div>
                {signal.gridAdvice && <Panel style={{ borderColor: C.accentDim }}><Label>Consiglio Bot</Label><div style={{ fontSize: 13, color: C.textPrimary, lineHeight: 1.6 }}>{signal.gridAdvice}</div></Panel>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { l: "RSI (14)", v: indicators?.rsi?.toFixed(1) ?? "-", c: indicators?.rsi < 35 ? C.green : indicators?.rsi > 70 ? C.red : C.yellow },
                    { l: "Fear & Greed", v: `${fearGreed ?? "-"}/100`, c: fgColor(fearGreed), s: fgLabel(fearGreed) },
                    { l: "ATR", v: indicators?.atr ? `$${indicators.atr.toFixed(2)}` : "-", c: C.purple },
                    { l: "Volume 24h", v: fmtB(marketData?.volume24h), c: C.accent },
                  ].map((item, i) => (
                    <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{item.l}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: item.c }}>{item.v}</div>
                      {item.s && <div style={{ fontSize: 11, color: item.c }}>{item.s}</div>}
                    </div>
                  ))}
                </div>
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
                  <StatRow label="Min 24h" value={`$${fmt(marketData?.low24h)}`} color={C.red} />
                  <StatRow label="Max 24h" value={`$${fmt(marketData?.high24h)}`} color={C.green} />
                  <StatRow label="Market Cap" value={fmtB(marketData?.marketCap)} color={C.textSecondary} />
                </Panel>
                <Panel>
                  <Label>Analisi Segnale</Label>
                  {signal.reasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < signal.reasons.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: 12, color: r.good === true ? C.green : r.good === false ? C.red : C.textSecondary }}>{r.good === true ? "▲" : r.good === false ? "▼" : "●"} {r.t}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.good === true ? C.green : r.good === false ? C.red : C.yellow }}>{r.v}</span>
                    </div>
                  ))}
                </Panel>
                <div style={{ textAlign: "center", fontSize: 11, color: C.textDim, marginTop: 4 }}>
                  {lastUpdate && <>Aggiornato {lastUpdate.toLocaleTimeString("it-IT")} · refresh in {countdown}s</>}
                </div>
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <button onClick={fetchMarket} style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 10, color: C.accent, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 Aggiorna</button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── GRAFICO ── */}
        {tab === "grafico" && (
          <>
            {/* Timeframe selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf.label} onClick={() => setChartTF(tf)}
                  style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 700, background: chartTF.label === tf.label ? C.accent : C.panel, color: chartTF.label === tf.label ? "#000" : C.textSecondary, border: `1px solid ${chartTF.label === tf.label ? C.accent : C.border}`, borderRadius: 8, cursor: "pointer" }}>
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Toggle indicatori */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                { label: "EMA20", state: showEMA20, set: setShowEMA20, color: "#ffd600" },
                { label: "EMA50", state: showEMA50, set: setShowEMA50, color: "#ff8c00" },
                { label: "EMA200", state: showEMA200, set: setShowEMA200, color: "#b388ff" },
                { label: "BB", state: showBB, set: setShowBB, color: "#00d4ff" },
              ].map(item => (
                <button key={item.label} onClick={() => item.set(!item.state)}
                  style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, background: item.state ? `${item.color}22` : C.panel, color: item.state ? item.color : C.textDim, border: `1px solid ${item.state ? item.color : C.border}`, borderRadius: 6, cursor: "pointer" }}>
                  {item.label}
                </button>
              ))}
            </div>

            {chartLoading && <div style={{ textAlign: "center", padding: 30, color: C.accent }}>⏳ Caricamento grafico...</div>}

            {!chartLoading && chartData.length > 0 && (
              <>
                {/* GRAFICO CANDELE CANVAS */}
                <Panel style={{ padding: "12px 8px" }}>
                  <div style={{ paddingLeft: 4 }}><Label>Candele + Indicatori — {coin.symbol}/USDT ({chartTF.label})</Label></div>
                  <CandleCanvas
                    data={visibleData}
                    showEMA20={showEMA20} showEMA50={showEMA50} showEMA200={showEMA200} showBB={showBB}
                    support={indicators?.sr?.support} resistance={indicators?.sr?.resistance}
                    entryTrigger={triggers.entry ? parseFloat(triggers.entry) : null}
                    tpTrigger={triggers.tp ? parseFloat(triggers.tp) : null}
                    slTrigger={triggers.sl ? parseFloat(triggers.sl) : null}
                  />
                </Panel>

                {/* RSI */}
                <Panel style={{ padding: "12px 4px" }}>
                  <div style={{ paddingLeft: 12 }}><Label>RSI (14) — Oversold &lt;30 | Overbought &gt;70</Label></div>
                  <ResponsiveContainer width="100%" height={120}>
                    <ComposedChart data={visibleData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#141929" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#3a4a6b" }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#3a4a6b" }} width={30} />
                      <Tooltip formatter={(v) => [v?.toFixed(1), "RSI"]} contentStyle={{ background: "#0b0e1a", border: "1px solid #1e2840", fontSize: 11 }} />
                      <ReferenceLine y={70} stroke="#ff3d5a" strokeDasharray="3 3" strokeWidth={1} label={{ value: "70", fill: "#ff3d5a", fontSize: 9 }} />
                      <ReferenceLine y={30} stroke="#00e676" strokeDasharray="3 3" strokeWidth={1} label={{ value: "30", fill: "#00e676", fontSize: 9 }} />
                      <ReferenceLine y={50} stroke="#3a4a6b" strokeDasharray="2 4" strokeWidth={1} />
                      <Line type="monotone" dataKey="rsi" stroke="#b388ff" strokeWidth={1.5} dot={false} isAnimationActive={false} name="RSI" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>

                {/* MACD */}
                <Panel style={{ padding: "12px 4px" }}>
                  <div style={{ paddingLeft: 12 }}><Label>MACD — Istogramma + Signal Line</Label></div>
                  <ResponsiveContainer width="100%" height={120}>
                    <ComposedChart data={visibleData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#141929" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#3a4a6b" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: "#3a4a6b" }} width={40} />
                      <Tooltip formatter={(v) => [v?.toFixed(4), ""]} contentStyle={{ background: "#0b0e1a", border: "1px solid #1e2840", fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#3a4a6b" strokeWidth={1} />
                      <Bar dataKey="macdHist" fill="#00d4ff" opacity={0.6} isAnimationActive={false} name="Hist"
                        label={false}
                        shape={(props) => {
                          const { x, y, width, height, value } = props;
                          return <rect x={x} y={value >= 0 ? y : y + height} width={width} height={Math.abs(height)} fill={value >= 0 ? "#00e676" : "#ff3d5a"} opacity={0.7} />;
                        }}
                      />
                      <Line type="monotone" dataKey="macd" stroke="#00d4ff" strokeWidth={1.2} dot={false} isAnimationActive={false} name="MACD" />
                      <Line type="monotone" dataKey="macdSignal" stroke="#ff8c00" strokeWidth={1.2} dot={false} isAnimationActive={false} name="Signal" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>

                {/* Legenda + Guida */}
                <Panel>
                  <Label>Legenda Indicatori</Label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                    {[
                      { color: "#00e676", label: "Candela verde (rialzo)" },
                      { color: "#ff3d5a", label: "Candela rossa (ribasso)" },
                      { color: "#ffd600", label: "EMA 20 (breve)" },
                      { color: "#ff8c00", label: "EMA 50 (medio)" },
                      { color: "#b388ff", label: "EMA 200 (lungo)" },
                      { color: "#00d4ff", label: "Bollinger Bands" },
                      { color: "#00e676", label: "Supporto (SUP)" },
                      { color: "#ff3d5a", label: "Resistenza (RES)" },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 20, height: 3, background: item.color, borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: C.textSecondary }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                {/* GUIDA COMPLETA */}
                <Panel style={{ borderColor: C.accentDim }}>
                  <Label>📖 Guida — Come Leggere il Grafico</Label>
                  {[
                    { emoji: "🕯️", titolo: "Candele Giapponesi", testo: "Ogni candela rappresenta un periodo. VERDE = il prezzo è salito (apertura → chiusura). ROSSA = il prezzo è sceso. Il corpo largo è il movimento principale. Le linee sottili (stoppini) sono i massimi e minimi del periodo." },
                    { emoji: "📊", titolo: "EMA 20 (gialla) — Breve termine", testo: "Media mobile delle ultime 20 candele. Segue il prezzo da vicino. Se il prezzo è SOPRA l'EMA20 → momentum positivo. Se è SOTTO → debolezza." },
                    { emoji: "🟠", titolo: "EMA 50 (arancio) — Medio termine", testo: "Trend delle ultime 50 candele. Quando EMA20 SUPERA EMA50 = Golden Cross → segnale rialzista. Quando EMA20 SCENDE sotto EMA50 = Death Cross → segnale ribassista." },
                    { emoji: "🟣", titolo: "EMA 200 (viola) — Lungo termine", testo: "La più importante. Se il prezzo è SOPRA l'EMA200 siamo in mercato BULL. Se è SOTTO siamo in mercato BEAR. I grandi investitori usano questa linea come riferimento principale." },
                    { emoji: "💠", titolo: "Bollinger Bands (azzurre tratteg.)", testo: "Tre linee che formano un canale di volatilità. Quando il prezzo tocca la banda INFERIORE → possibile rimbalzo (zona di acquisto). Quando tocca quella SUPERIORE → possibile inversione (zona di vendita). Bande strette = bassa volatilità, esplosione in arrivo." },
                    { emoji: "🟢", titolo: "Supporto (SUP — verde tratteggiato)", testo: "Livello di prezzo dove storicamente gli acquirenti intervengono. Se il prezzo ci torna, spesso rimbalza. Rompere il supporto verso il basso è un segnale negativo." },
                    { emoji: "🔴", titolo: "Resistenza (RES — rossa tratteggiata)", testo: "Livello dove i venditori storicamente intervengono. Il prezzo fa fatica a superarla. Se la rompe verso l'alto → forte segnale rialzista." },
                    { emoji: "📈", titolo: "RSI (pannello viola sotto)", testo: "Oscilla tra 0 e 100. SOTTO 30 = oversold (ipervenduto) → possibile rimbalzo, zona di acquisto. SOPRA 70 = overbought (ipercomprato) → possibile correzione. La linea 50 è il confine bull/bear." },
                    { emoji: "📉", titolo: "MACD (pannello sotto)", testo: "Mostra la forza del trend. Barre VERDI sopra lo zero = momentum rialzista. Barre ROSSE sotto zero = momentum ribassista. Quando la linea azzurra (MACD) supera quella arancio (Signal) → segnale di acquisto." },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: "10px 0", borderBottom: i < 8 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>{item.emoji} {item.titolo}</div>
                      <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6 }}>{item.testo}</div>
                    </div>
                  ))}
                </Panel>
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
                  style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, background: botConfig.type === t ? C.accent : C.bg, color: botConfig.type === t ? "#000" : C.textSecondary, border: `1px solid ${botConfig.type === t ? C.accent : C.border}`, borderRadius: 8, cursor: "pointer", textTransform: "uppercase" }}>
                  {t}
                </button>
              ))}
            </div>
            <Input label="Prezzo Minimo Grid ($)" value={botConfig.priceMin} onChange={v => setBotConfig(b => ({ ...b, priceMin: v }))} placeholder="es. 1400" prefix="$" />
            <Input label="Prezzo Massimo Grid ($)" value={botConfig.priceMax} onChange={v => setBotConfig(b => ({ ...b, priceMax: v }))} placeholder="es. 2000" prefix="$" />
            <Input label="Numero di Griglie" value={botConfig.gridCount} onChange={v => setBotConfig(b => ({ ...b, gridCount: v }))} placeholder="es. 20" />
            <Input label="Capitale Investito ($)" value={botConfig.capital} onChange={v => setBotConfig(b => ({ ...b, capital: v }))} placeholder="es. 500" prefix="$" />
            {botConfig.priceMin && botConfig.priceMax && botConfig.gridCount && botConfig.capital && (() => {
              const range = parseFloat(botConfig.priceMax) - parseFloat(botConfig.priceMin);
              const gridSpacing = range / parseFloat(botConfig.gridCount);
              const midPrice = (parseFloat(botConfig.priceMax) + parseFloat(botConfig.priceMin)) / 2;
              const profitPerGrid = (gridSpacing / midPrice) * 100;
              const capitalPerGrid = parseFloat(botConfig.capital) / parseFloat(botConfig.gridCount);
              const isInRange = marketData?.price >= parseFloat(botConfig.priceMin) && marketData?.price <= parseFloat(botConfig.priceMax);
              return (
                <div style={{ background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 10, padding: 14, marginTop: 8 }}>
                  <Label>Riepilogo Bot</Label>
                  <StatRow label="Range totale" value={`$${range.toFixed(2)}`} />
                  <StatRow label="Spazio per griglia" value={`$${gridSpacing.toFixed(2)}`} />
                  <StatRow label="Profitto/griglia" value={`${profitPerGrid.toFixed(2)}%`} color={C.green} />
                  <StatRow label="Capitale/griglia" value={`$${capitalPerGrid.toFixed(2)}`} color={C.accent} />
                  <StatRow label="Prezzo nel range?" value={isInRange ? "✅ SÌ" : "❌ NO"} color={isInRange ? C.green : C.red} />
                </div>
              );
            })()}
            <button onClick={() => setBotConfig(b => ({ ...b, active: !b.active }))} style={{ width: "100%", marginTop: 14, padding: "13px 0", fontSize: 15, fontWeight: 800, background: botConfig.active ? C.greenDim : C.accentDim, color: botConfig.active ? C.green : C.accent, border: `1px solid ${botConfig.active ? C.green : C.accent}`, borderRadius: 10, cursor: "pointer" }}>
              {botConfig.active ? "✅ Bot Attivo — Clicca per disattivare" : "▶ Attiva Bot per l'analisi AI"}
            </button>
          </Panel>
        )}

        {/* ── TRIGGERS ── */}
        {tab === "triggers" && (
          <>
            <Panel>
              <Label>🎯 Trigger di Entrata</Label>
              <Input label="Prezzo Entry ($)" value={triggers.entry} onChange={v => setTriggers(t => ({ ...t, entry: v }))} placeholder={`es. ${marketData ? (marketData.price * 0.95).toFixed(0) : "1500"}`} prefix="$" />
              {triggers.entry && marketData && <div style={{ fontSize: 12, color: C.textSecondary, marginTop: -4, marginBottom: 8 }}>Distanza: {((parseFloat(triggers.entry) - marketData.price) / marketData.price * 100).toFixed(2)}%</div>}
            </Panel>
            <Panel>
              <Label>🟢 Take Profit</Label>
              <Input label="Prezzo Take Profit ($)" value={triggers.tp} onChange={v => setTriggers(t => ({ ...t, tp: v }))} placeholder={`es. ${marketData ? (marketData.price * 1.15).toFixed(0) : "1800"}`} prefix="$" />
              {triggers.tp && triggers.entry && <div style={{ fontSize: 12, color: C.green, marginTop: -4 }}>Guadagno: +{((parseFloat(triggers.tp) - parseFloat(triggers.entry)) / parseFloat(triggers.entry) * 100).toFixed(2)}%</div>}
            </Panel>
            <Panel>
              <Label>🔴 Stop Loss</Label>
              <Input label="Prezzo Stop Loss ($)" value={triggers.sl} onChange={v => setTriggers(t => ({ ...t, sl: v }))} placeholder={`es. ${marketData ? (marketData.price * 0.88).toFixed(0) : "1300"}`} prefix="$" />
              {triggers.sl && triggers.entry && <div style={{ fontSize: 12, color: C.red, marginTop: -4 }}>Rischio: -{((parseFloat(triggers.entry) - parseFloat(triggers.sl)) / parseFloat(triggers.entry) * 100).toFixed(2)}%</div>}
            </Panel>
            {triggers.entry && triggers.tp && triggers.sl && (() => {
              const risk = Math.abs(parseFloat(triggers.entry) - parseFloat(triggers.sl));
              const reward = Math.abs(parseFloat(triggers.tp) - parseFloat(triggers.entry));
              const rr = reward / risk;
              return (
                <Panel style={{ borderColor: C.purple }}>
                  <Label>📊 Risk/Reward Ratio</Label>
                  <div style={{ fontSize: 28, fontWeight: 900, color: rr >= 2 ? C.green : rr >= 1 ? C.yellow : C.red, textAlign: "center", margin: "8px 0" }}>1 : {rr.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: C.textSecondary, textAlign: "center" }}>{rr >= 3 ? "✅ Eccellente" : rr >= 2 ? "✅ Buono" : rr >= 1 ? "⚠️ Accettabile" : "❌ Troppo rischioso"}</div>
                  <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", marginTop: 4 }}>I professionisti usano minimo 1:2</div>
                </Panel>
              );
            })()}
            {indicators?.sr && (
              <Panel>
                <Label>💡 Livelli Suggeriti</Label>
                {[
                  { l: "Entry suggerito", v: `$${fmt(indicators.sr.support * 1.01)}`, c: C.green },
                  { l: "Take Profit suggerito", v: `$${fmt(indicators.sr.resistance * 0.98)}`, c: C.green },
                  { l: "Stop Loss suggerito", v: `$${fmt(indicators.sr.support * 0.96)}`, c: C.red },
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
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>L'AI analizza tutto e ti dà un consiglio su misura come un trader esperto.</div>
              <button onClick={handleAI} disabled={aiLoading || !indicators} style={{ width: "100%", padding: "14px 0", fontSize: 16, fontWeight: 800, background: aiLoading ? C.bg : "linear-gradient(135deg, #6a00ff, #00d4ff)", color: aiLoading ? C.textDim : "#fff", border: `1px solid ${aiLoading ? C.border : "#6a00ff"}`, borderRadius: 12, cursor: aiLoading ? "not-allowed" : "pointer" }}>
                {aiLoading ? "⏳ Analisi in corso..." : "🧠 Chiedi Consiglio all'AI"}
              </button>
            </Panel>
            {aiAdvice && (
              <Panel style={{ borderColor: C.purple }}>
                <Label>Analisi AI — {coin.symbol}/USDT</Label>
                <div style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{aiAdvice}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>⚠️ Non è consulenza finanziaria. Sempre DYOR.</div>
              </Panel>
            )}
            <Panel>
              <Label>📋 Checklist del Trader Pro</Label>
              {[
                { ok: indicators?.rsi < 50, t: "RSI sotto 50 (zona favorevole)" },
                { ok: indicators?.ema20 > indicators?.ema50, t: "EMA20 sopra EMA50 (trend positivo)" },
                { ok: indicators?.price > indicators?.ema200, t: "Prezzo sopra EMA200 (mercato bull)" },
                { ok: fearGreed < 50, t: "Fear & Greed sotto 50 (paura = opportunità)" },
                { ok: signal?.regime === "laterale", t: "Mercato laterale (ideale per grid bot)" },
                { ok: !!triggers.sl, t: "Stop Loss impostato" },
                { ok: triggers.tp && triggers.sl && triggers.entry && ((parseFloat(triggers.tp) - parseFloat(triggers.entry)) / (parseFloat(triggers.entry) - parseFloat(triggers.sl))) >= 2, t: "Risk/Reward ≥ 1:2" },
                { ok: botConfig.active && botConfig.priceMin && botConfig.priceMax, t: "Bot configurato" },
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
              <div style={{ color: C.textDim, fontSize: 13, textAlign: "center", padding: 20 }}>Nessun segnale ancora.</div>
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