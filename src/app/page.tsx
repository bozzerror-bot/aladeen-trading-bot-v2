'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Candle, Trade, LogEntry, SMCState, TrendAnalysis, VolumeAnalysis, ConfluenceScore } from '@/lib/types';
import { COINS, TIMEFRAMES } from '@/lib/types';
import { analyzeSMC, analyzeTrend, analyzeVolume, calculateConfluence } from '@/lib/smcEngine';

// ─── Types ───
interface BotCfg { id: string; name: string; color: string; market: string; enabled: boolean; running: boolean; trades: number; wins: number; losses: number; pnl: number; }

// ─── Helpers ───
const fmtUSD = (n: number) => n >= 1000 ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$' + n.toFixed(2);
const fmtPrice = (n: number) => n >= 1000 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(4);
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ─── API Client ───
async function apiCall(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Canvas Chart ───
function CandleChart({ candles, signals, market, timeframe }: { candles: Candle[]; signals: Array<{type: string; direction: string; price: number; time: number}>; market: string; timeframe: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || candles.length < 2) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = { t: 20, r: 55, b: 25, l: 10 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const prices = candles.map(c => [c.low, c.high]).flat();
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const toX = (i: number) => pad.l + (i / (candles.length - 1)) * cw;
    const toY = (p: number) => pad.t + (1 - (p - minP) / range) * ch;
    ctx.clearRect(0, 0, w, h);
    // Grid
    ctx.strokeStyle = 'rgba(30,41,59,0.5)'; ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) { const y = pad.t + (ch / 4) * i; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke(); ctx.fillStyle = '#64748b'; ctx.font = '10px monospace'; ctx.textAlign = 'right'; ctx.fillText((maxP - (range / 4) * i).toFixed(0), pad.l + cw + 4, y + 3); }
    // Candles
    const barW = Math.max(1.5, (cw / candles.length) * 0.55);
    candles.forEach((c, i) => { const x = toX(i); const g = c.close >= c.open; ctx.strokeStyle = g ? '#10b981' : '#ef4444'; ctx.fillStyle = g ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke(); const bt = toY(Math.max(c.open, c.close)), bb = toY(Math.min(c.open, c.close)); ctx.fillRect(x - barW / 2, bt, barW, Math.max(1, bb - bt)); });
    // Signals
    signals.forEach((sig) => { const idx = candles.findIndex(c => c.time >= sig.time); if (idx < 0) return; const x = toX(idx), y = toY(sig.price); ctx.fillStyle = sig.type === 'CHoCH' ? '#a855f7' : '#06b6d4'; ctx.beginPath(); if (sig.direction === 'bullish') { ctx.moveTo(x, y - 14); ctx.lineTo(x - 5, y - 5); ctx.lineTo(x + 5, y - 5); } else { ctx.moveTo(x, y + 14); ctx.lineTo(x - 5, y + 5); ctx.lineTo(x + 5, y + 5); } ctx.fill(); });
  }, [candles, signals]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 340, display: 'block' }} />;
}

// ─── Main ───
export default function Dashboard() {
  const [apiKey, setApiKey] = useState(() => { if (typeof window !== 'undefined') return localStorage.getItem('aladeen_api_key') || ''; return ''; });
  const [apiSecret, setApiSecret] = useState(() => { if (typeof window !== 'undefined') return localStorage.getItem('aladeen_api_secret') || ''; return ''; });
  const [apiConnected, setApiConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [bots, setBots] = useState<BotCfg[]>(() => {
    if (typeof window === 'undefined') return [
      { id: 'trend', name: 'Trend Bot', color: '#3b82f6', market: 'BTCUSDT', enabled: false, running: false, trades: 0, wins: 0, losses: 0, pnl: 0 },
      { id: 'reversal', name: 'Reversal Bot', color: '#a855f7', market: 'BTCUSDT', enabled: false, running: false, trades: 0, wins: 0, losses: 0, pnl: 0 },
      { id: 'confluence', name: 'Confluence Bot', color: '#06b6d4', market: 'BTCUSDT', enabled: false, running: false, trades: 0, wins: 0, losses: 0, pnl: 0 },
    ];
    try {
      const saved = localStorage.getItem('aladeen_bots');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return [
      { id: 'trend', name: 'Trend Bot', color: '#3b82f6', market: 'BTCUSDT', enabled: false, running: false, trades: 0, wins: 0, losses: 0, pnl: 0 },
      { id: 'reversal', name: 'Reversal Bot', color: '#a855f7', market: 'BTCUSDT', enabled: false, running: false, trades: 0, wins: 0, losses: 0, pnl: 0 },
      { id: 'confluence', name: 'Confluence Bot', color: '#06b6d4', market: 'BTCUSDT', enabled: false, running: false, trades: 0, wins: 0, losses: 0, pnl: 0 },
    ];
  });
  const [timeframe, setTimeframe] = useState('15m');
  const [leverage, setLeverage] = useState(10);
  const [riskPerTrade, setRiskPerTrade] = useState(3);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [price, setPrice] = useState(0);
  const [smc, setSmc] = useState<SMCState | null>(null);
  const [trend, setTrend] = useState<TrendAnalysis | null>(null);
  const [vol, setVol] = useState<VolumeAnalysis | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [debug, setDebug] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const seenSignals = useRef<Set<number>>(new Set());
  const debugRef = useRef<HTMLDivElement>(null);

  // Auto-reconnect on page load if API keys exist
  useEffect(() => {
    const savedKey = localStorage.getItem('aladeen_api_key');
    const savedSecret = localStorage.getItem('aladeen_api_secret');
    if (savedKey && savedSecret) {
      addDebug('Found saved API keys. Auto-connecting...');
      handleAutoConnect(savedKey, savedSecret);
    }
  }, []);

  // Save bot states to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('aladeen_bots', JSON.stringify(bots));
  }, [bots]);

  // Save timeframe to localStorage
  useEffect(() => {
    localStorage.setItem('aladeen_timeframe', timeframe);
  }, [timeframe]);

  const handleAutoConnect = async (key: string, secret: string) => {
    try {
      const result = await apiCall('/api/test', { apiKey: key, apiSecret: secret });
      setApiKey(key); setApiSecret(secret);
      setApiConnected(true); setBalance(result.balance.available);
      addDebug(`Auto-reconnected! Balance: ${fmtUSD(result.balance.available)}`, 'success');
      addLog({ timestamp: Date.now(), type: 'INFO', message: 'API auto-reconnected on page load' });
    } catch (e: any) {
      addDebug(`Auto-connect failed: ${e.message}`, 'error');
      // Clear invalid keys
      localStorage.removeItem('aladeen_api_key');
      localStorage.removeItem('aladeen_api_secret');
    }
  };

  const addDebug = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const prefix = type === 'error' ? '[ERROR]' : type === 'success' ? '[OK]' : '[INFO]';
    const entry = `${prefix} ${msg}`;
    setDebug(prev => [entry, ...prev].slice(0, 100));
  }, []);

  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    const log: LogEntry = { ...entry, id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
    setLogs(prev => [log, ...prev].slice(0, 200));
  }, []);

  // Connect API
  const handleConnect = async () => {
    if (!apiKey || !apiSecret) { addDebug('Please enter both API Key and Secret', 'error'); return; }
    setLoading(true); addDebug('Testing connection to Binance Testnet...');
    try {
      const result = await apiCall('/api/test', { apiKey, apiSecret });
      setApiConnected(true);
      setBalance(result.balance.available);
      // SAVE KEYS TO localStorage
      localStorage.setItem('aladeen_api_key', apiKey);
      localStorage.setItem('aladeen_api_secret', apiSecret);
      addDebug(`Connected! Balance: ${fmtUSD(result.balance.available)}`, 'success');
      addLog({ timestamp: Date.now(), type: 'INFO', message: 'API connected to Binance Testnet', details: `Balance: ${fmtUSD(result.balance.available)}` });
    } catch (e: any) {
      addDebug(`Connection failed: ${e.message}`, 'error');
      if (e.message?.includes('permissions')) addDebug('Go to demo.binance.com → API Management → Enable Futures', 'info');
      if (e.message?.includes('IP')) addDebug('Remove IP whitelist from your API key settings', 'info');
    }
    setLoading(false);
  };

  // Refresh balance
  const refreshBal = useCallback(async () => {
    if (!apiConnected) return;
    try { const b = await apiCall('/api/balance', { apiKey, apiSecret }); setBalance(b.available); } catch (e: any) { addDebug(`Balance refresh failed: ${e.message}`, 'error'); }
  }, [apiConnected, apiKey, apiSecret, addDebug]);

  // Place REAL order via API
  const placeRealOrder = async (bot: BotCfg, side: 'BUY' | 'SELL', qty: number, tp: number, sl: number) => {
    if (!apiConnected || !apiKey || !apiSecret) { addDebug(`Cannot trade: API not connected`, 'error'); return null; }
    addDebug(`${bot.name} placing ${side} order on ${bot.market} (qty: ${qty.toFixed(4)})...`);
    try {
      // Set leverage
      try { await apiCall('/api/order', { apiKey, apiSecret, symbol: bot.market, side: 'BUY', quantity: '0', leverage }); } catch { /* leverage may already be set */ }
      // Place market order
      const order = await apiCall('/api/order', { apiKey, apiSecret, symbol: bot.market, side, quantity: qty.toFixed(4), leverage });
      addDebug(`Order #${order.orderId} placed successfully!`, 'success');
      // Place TP via Algo Order API
      try { await apiCall('/api/algo', { apiKey, apiSecret, symbol: bot.market, side: side === 'BUY' ? 'SELL' : 'BUY', quantity: qty.toFixed(4), stopPrice: tp.toFixed(1), workingType: 'MARK_PRICE', reduceOnly: 'true' }); addDebug(`TP set @ ${fmtPrice(tp)}`, 'success'); } catch (e: any) { addDebug(`TP algo failed: ${e.message}. Trying fallback...`, 'error'); try { await apiCall('/api/order', { apiKey, apiSecret, symbol: bot.market, side: side === 'BUY' ? 'SELL' : 'BUY', type: 'STOP_MARKET', quantity: qty.toFixed(4), stopPrice: tp.toFixed(1), closePosition: true }); addDebug(`TP fallback OK`, 'success'); } catch (e2: any) { addDebug(`TP fallback also failed: ${e2.message}`, 'error'); } }
      // Place SL via Algo Order API
      try { await apiCall('/api/algo', { apiKey, apiSecret, symbol: bot.market, side: side === 'BUY' ? 'SELL' : 'BUY', quantity: qty.toFixed(4), stopPrice: sl.toFixed(1), workingType: 'MARK_PRICE', reduceOnly: 'true' }); addDebug(`SL set @ ${fmtPrice(sl)}`, 'success'); } catch (e: any) { addDebug(`SL algo failed: ${e.message}. Trying fallback...`, 'error'); try { await apiCall('/api/order', { apiKey, apiSecret, symbol: bot.market, side: side === 'BUY' ? 'SELL' : 'BUY', type: 'STOP_MARKET', quantity: qty.toFixed(4), stopPrice: sl.toFixed(1), closePosition: true }); addDebug(`SL fallback OK`, 'success'); } catch (e2: any) { addDebug(`SL fallback also failed: ${e2.message}`, 'error'); } }
      return order;
    } catch (e: any) {
      addDebug(`Order failed: ${e.message}`, 'error');
      if (e.message?.includes('MIN_NOTIONAL')) addDebug('Order too small. Need minimum 5 USDT notional.', 'info');
      return null;
    }
  };

  // Fetch candles
  useEffect(() => {
    let mounted = true;
    const market = bots.find(b => b.running)?.market || 'BTCUSDT';
    const fetchCandles = async () => {
      try {
        const res = await fetch(`/api/klines?symbol=${market}&interval=${timeframe}&limit=200`);
        const data = await res.json();
        if (!mounted || data.error) return;
        setCandles(data);
        if (data.length > 0) setPrice(data[data.length - 1].close);
        const s = analyzeSMC(data); setSmc(s);
        const t = analyzeTrend(data); setTrend(t);
        const v = analyzeVolume(data); setVol(v);
      } catch (e: any) { addDebug(`Data fetch error: ${e.message}`, 'error'); }
    };
    fetchCandles();
    const iv = setInterval(fetchCandles, 10000);

    // WebSocket for live price
    const wsUrl = `wss://fstream.binancefuture.com/ws/${market.toLowerCase()}@markPrice@1s`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { setWsConnected(true); addDebug('WebSocket connected', 'success'); };
    ws.onmessage = (ev) => {
      try { const data = JSON.parse(ev.data); if (data.p) setPrice(parseFloat(data.p)); } catch { /* ignore */ }
    };
    ws.onerror = () => setWsConnected(false);
    ws.onclose = () => setWsConnected(false);

    return () => { mounted = false; clearInterval(iv); ws.close(); };
  }, [timeframe, bots]);

  // Balance refresh
  useEffect(() => {
    if (!apiConnected) return;
    refreshBal();
    const iv = setInterval(refreshBal, 30000);
    return () => clearInterval(iv);
  }, [apiConnected, refreshBal]);

  // Bot trading loop
  useEffect(() => {
    if (!smc?.lastSignal || !trend || !vol) return;
    const sig = smc.lastSignal;
    if (seenSignals.current.has(sig.time)) return;
    seenSignals.current.add(sig.time);

    addLog({ timestamp: Date.now(), type: 'SIGNAL', message: `${sig.type} ${sig.direction} @ ${fmtPrice(sig.price)}`, market: bots.find(b => b.running)?.market, score: undefined });

    bots.forEach(async (bot) => {
      if (!bot.running) return;
      const priceMove = (riskPerTrade / 100);
      const tpDist = price * priceMove * 2;
      const slDist = price * priceMove;
      const tp = sig.direction === 'bullish' ? price + tpDist : price - tpDist;
      const sl = sig.direction === 'bullish' ? price - slDist : price + slDist;
      const score = calculateConfluence(sig, trend, vol, price, tp, sl);

      let shouldTrade = false;
      if (bot.id === 'trend' && sig.type === 'BoS' && score.total >= 60) shouldTrade = true;
      if (bot.id === 'reversal' && sig.type === 'CHoCH' && score.total >= 65) shouldTrade = true;
      if (bot.id === 'confluence' && score.total >= 75) shouldTrade = true;

      addLog({ timestamp: Date.now(), type: 'BOT', message: `${bot.name} analyzing ${sig.type} ${sig.direction} (score: ${score.total})`, market: bot.market, score: score.total, details: shouldTrade ? 'TRADE' : 'SKIP' });

      if (!shouldTrade) { addDebug(`${bot.name} SKIPPED ${sig.type} (score ${score.total})`); return; }

      // Calculate position size
      const riskAmt = balance * (riskPerTrade / 100);
      const qty = Math.max(0.001, riskAmt / (price * (riskPerTrade / 100)) / price);
      const side: 'BUY' | 'SELL' = sig.direction === 'bullish' ? 'BUY' : 'SELL';

      addDebug(`${bot.name} EXECUTING ${side} ${bot.market} @ ${fmtPrice(price)} (qty: ${qty.toFixed(4)}, score: ${score.total})`);

      // Place REAL order
      const order = await placeRealOrder(bot, side, qty, tp, sl);
      if (order) {
        const trade: Trade = { id: `t-${Date.now()}-${bot.id}`, botId: bot.id, botName: bot.name, market: bot.market, side: sig.direction === 'bullish' ? 'LONG' : 'SHORT', signalType: sig.type, entryPrice: price, quantity: qty, leverage, tpPrice: tp, slPrice: sl, confluenceScore: score.total, pnl: 0, pnlPercent: 0, status: 'OPEN', entryTime: Date.now(), binanceOrderId: order.orderId };
        setTrades(prev => [...prev, trade]);
        setBots(prev => prev.map(b => b.id === bot.id ? { ...b, trades: b.trades + 1 } : b));
        addLog({ timestamp: Date.now(), type: 'TRADE', message: `${bot.name} OPENED ${side} ${bot.market} @ ${fmtPrice(price)} (Order #${order.orderId})`, market: bot.market, score: score.total });
        addDebug(`${bot.name} trade opened! Order #${order.orderId}`, 'success');
      }
    });
  }, [smc?.lastSignal?.time]);

  // Check TP/SL
  useEffect(() => {
    if (!price || trades.filter(t => t.status === 'OPEN').length === 0) return;
    setTrades(prev => prev.map(t => {
      if (t.status !== 'OPEN') return t;
      let hit: 'TP' | 'SL' | null = null;
      if (t.side === 'LONG') { if (price >= t.tpPrice) hit = 'TP'; else if (price <= t.slPrice) hit = 'SL'; }
      else { if (price <= t.tpPrice) hit = 'TP'; else if (price >= t.slPrice) hit = 'SL'; }
      if (!hit) return t;
      const pnlPct = t.side === 'LONG' ? ((price - t.entryPrice) / t.entryPrice) * 100 * leverage : ((t.entryPrice - price) / t.entryPrice) * 100 * leverage;
      const won = hit === 'TP';
      setBots(prev => prev.map(b => b.id === t.botId ? { ...b, pnl: b.pnl + pnlPct, wins: b.wins + (won ? 1 : 0), losses: b.losses + (won ? 0 : 1) } : b));
      addLog({ timestamp: Date.now(), type: 'TRADE', message: `${t.botName} CLOSED ${hit} @ ${fmtPrice(price)} PnL: ${pnlPct.toFixed(2)}%`, market: t.market });
      addDebug(`${t.botName} position closed via ${hit} @ ${fmtPrice(price)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`, won ? 'success' : 'error');
      return { ...t, status: 'CLOSED', exitPrice: price, exitTime: Date.now(), pnl: pnlPct, pnlPercent: pnlPct, result: won ? 'WIN' : 'LOSS', closeReason: hit };
    }));
  }, [price]);

  // Auto-scroll debug
  useEffect(() => { if (debugRef.current) debugRef.current.scrollTop = 0; }, [debug]);

  const activeMarket = bots.find(b => b.running)?.market || bots[0].market;
  const openTrades = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalWins = closedTrades.filter(t => t.result === 'WIN').length;

  // ─── RENDER ───
  return (
    <div className="flex h-screen bg-[#030712] text-[#f1f5f9] font-sans overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-[260px]' : 'w-[60px]'} flex-shrink-0 bg-[#0a0f1a] border-r border-[#1e293b] flex flex-col transition-all duration-300 overflow-y-auto`}>
        <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
          {sidebarOpen && <span className="font-mono font-bold text-[#06b6d4] text-lg tracking-wider" style={{ textShadow: '0 0 10px rgba(6,182,212,0.4)' }}>ALADEEN</span>}
          {!sidebarOpen && <span className="font-mono font-bold text-[#06b6d4] text-xl">A</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-[#64748b] hover:text-[#06b6d4] text-lg transition-colors">{sidebarOpen ? '«' : '»'}</button>
        </div>

        {/* API */}
        <div className="p-4 border-b border-[#1e293b]">
          {sidebarOpen && <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-2">Binance Testnet</div>}
          {!apiConnected ? (
            <div className="space-y-2">
              {sidebarOpen && <input className="adeen-input text-xs" placeholder="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} />}
              {sidebarOpen && <input className="adeen-input text-xs" type="password" placeholder="Secret" value={apiSecret} onChange={e => setApiSecret(e.target.value)} />}
              {sidebarOpen && <button className="adeen-btn w-full text-xs py-1.5" onClick={handleConnect} disabled={loading}>{loading ? 'Connecting...' : 'Connect'}</button>}
            </div>
          ) : (
            <div>
              {sidebarOpen && <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" /><span className="text-xs text-[#10b981]">Connected</span></div>}
              {sidebarOpen && <div className="font-mono text-sm text-[#06b6d4]">{fmtUSD(balance)}</div>}
              {sidebarOpen && <div className="flex items-center gap-2 mt-1">
                <button className="text-[10px] text-[#64748b] hover:text-[#06b6d4]" onClick={refreshBal}>Refresh</button>
                <button className="text-[10px] text-[#64748b] hover:text-[#ef4444]" onClick={() => {
                  localStorage.removeItem('aladeen_api_key');
                  localStorage.removeItem('aladeen_api_secret');
                  setApiKey(''); setApiSecret(''); setApiConnected(false); setBalance(0);
                  addDebug('API disconnected and keys cleared', 'info');
                }}>Disconnect</button>
              </div>}
            </div>
          )}
        </div>

        {/* Bots */}
        <div className="p-4 border-b border-[#1e293b] flex-1">
          {sidebarOpen && <div className="text-[10px] text-[#64748b] uppercase tracking-wider mb-3">Bots — Press START to trade</div>}
          {bots.map(bot => (
            <div key={bot.id} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: bot.color }} />
                  {sidebarOpen && <span className="text-xs font-semibold">{bot.name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {sidebarOpen && (
                    <button
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${bot.running ? 'bg-[#ef4444] text-white' : 'bg-[#10b981] text-[#030712]'}`}
                      onClick={() => {
                        if (!apiConnected && !bot.running) { addDebug(`Connect API first before starting ${bot.name}`, 'error'); return; }
                        setBots(prev => prev.map(b => b.id === bot.id ? { ...b, running: !b.running } : b));
                        addDebug(`${bot.name} ${bot.running ? 'STOPPED' : 'STARTED'}`, bot.running ? 'info' : 'success');
                        addLog({ timestamp: Date.now(), type: 'BOT', message: `${bot.name} ${bot.running ? 'stopped' : 'started'}`, market: bot.market });
                      }}
                    >
                      {bot.running ? 'STOP' : 'START'}
                    </button>
                  )}
                  <div className={`toggle-track${bot.running ? ' on' : ''}`} onClick={() => {
                    if (!apiConnected && !bot.running) { addDebug(`Connect API first!`, 'error'); return; }
                    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, running: !b.running } : b));
                  }}><div className="toggle-knob" /></div>
                </div>
              </div>
              {sidebarOpen && (
                <select className="adeen-input text-[10px] py-1" value={bot.market} onChange={e => setBots(prev => prev.map(b => b.id === bot.id ? { ...b, market: e.target.value } : b))}>
                  {COINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>

        {/* Settings */}
        <div className="p-4 border-t border-[#1e293b]">
          {sidebarOpen && (
            <button className="flex items-center gap-2 text-[#94a3b8] hover:text-[#06b6d4] text-xs transition-colors" onClick={() => setShowSettings(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.42 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
              Settings
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-5 bg-[#0a0f1a]/90 backdrop-blur border-b border-[#1e293b]">
          <div className="flex items-center gap-4">
            <span className="font-mono font-bold text-[#06b6d4] tracking-wider" style={{ textShadow: '0 0 8px rgba(6,182,212,0.3)' }}>ALADEEN <span className="text-[#64748b] text-xs font-normal">v2.0</span></span>
            <div className="h-5 w-px bg-[#1e293b]" />
            <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`} style={wsConnected ? { boxShadow: '0 0 8px rgba(16,185,129,0.4)' } : {}} /><span className="text-[10px] text-[#64748b]">{wsConnected ? 'LIVE' : 'OFFLINE'}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <select className="adeen-input text-xs py-1 w-28" value={timeframe} onChange={e => setTimeframe(e.target.value)}>{TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}</select>
            <span className="font-mono text-sm font-bold">{activeMarket}</span>
            <span className="font-mono text-sm text-[#06b6d4]">{fmtPrice(price)}</span>
            <span className={`badge ${apiConnected ? 'badge-green' : 'badge-gray'}`}>{apiConnected ? 'API ON' : 'API OFF'}</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="kpi"><div className="scan" /><div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#64748b] uppercase tracking-wider">Balance</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div><div className="font-mono text-xl font-bold text-[#06b6d4]">{apiConnected ? fmtUSD(balance) : '—'}</div><div className="text-[10px] text-[#64748b]">{apiConnected ? 'Testnet USDT' : 'Connect API'}</div></div>
            <div className="kpi"><div className="scan" /><div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#64748b] uppercase tracking-wider">Total P&L</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={totalPnl >= 0 ? '#10b981' : '#ef4444'} strokeWidth="1.5"><path d={totalPnl >= 0 ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' : 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6'} /></svg></div><div className={`font-mono text-xl font-bold ${totalPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{totalPnl === 0 ? '$0.00' : `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`}</div><div className="text-[10px] text-[#64748b]">{closedTrades.length} trades</div></div>
            <div className="kpi"><div className="scan" /><div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#64748b] uppercase tracking-wider">Win Rate</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div><div className={`font-mono text-xl font-bold ${closedTrades.length > 0 && totalWins / closedTrades.length >= 0.5 ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>{closedTrades.length > 0 ? `${((totalWins / closedTrades.length) * 100).toFixed(1)}%` : '—'}</div><div className="text-[10px] text-[#64748b]">{totalWins}W / {closedTrades.length - totalWins}L</div></div>
            <div className="kpi"><div className="scan" /><div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#64748b] uppercase tracking-wider">Open Positions</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div><div className={`font-mono text-xl font-bold ${openTrades.length > 0 ? 'text-[#06b6d4]' : 'text-[#64748b]'}`}>{openTrades.length}</div><div className="text-[10px] text-[#64748b]">{openTrades.length > 0 ? 'Monitoring TP/SL' : 'No positions'}</div></div>
          </div>

          {/* Chart + Right panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 glass" style={{ padding: 0 }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e293b]"><div className="flex items-center gap-2"><span className="text-[10px] text-[#64748b] uppercase">{activeMarket}</span><span className="text-[10px] text-[#06b6d4] font-mono">{timeframe}</span><span className={`badge ${wsConnected ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 9 }}>{wsConnected ? 'LIVE' : 'OFF'}</span></div><span className="text-[10px] text-[#64748b] font-mono">{candles.length} candles</span></div>
              <div className="p-2">{candles.length > 0 ? <CandleChart candles={candles} signals={smc?.signals || []} market={activeMarket} timeframe={timeframe} /> : <div className="flex items-center justify-center h-[340px] text-[#64748b] text-sm">Loading chart...</div>}</div>
            </div>
            <div className="space-y-3">
              {/* Trend */}
              <div className="glass">
                <div className="flex items-center gap-2 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg><span className="text-xs font-semibold">Market Analysis</span></div>
                {trend && <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Trend</span><span className="text-xs font-bold" style={{ color: trend.trendDirection === 'bullish' ? '#10b981' : trend.trendDirection === 'bearish' ? '#ef4444' : '#f59e0b' }}>{trend.trendDirection.toUpperCase()}</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Strength</span><span className="text-xs font-mono text-[#06b6d4]">{trend.strength}/100</span></div>
                  <div className="h-1.5 bg-[#1a2235] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${trend.strength}%`, background: trend.trendDirection === 'bullish' ? '#10b981' : trend.trendDirection === 'bearish' ? '#ef4444' : '#f59e0b' }} /></div>
                </div>}
                {vol && <div className="mt-2 pt-2 border-t border-[#1e293b] space-y-1">
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Volume</span><span className="text-xs font-mono" style={{ color: vol.confirmation ? '#10b981' : '#94a3b8' }}>{vol.volumeRatio.toFixed(2)}x</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Signal</span><span className="text-xs font-bold" style={{ color: vol.confirmation ? '#10b981' : '#ef4444' }}>{vol.confirmation ? 'CONFIRMED' : 'WEAK'}</span></div>
                </div>}
              </div>
              {/* Last Signal */}
              <div className="glass">
                <div className="flex items-center gap-2 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><span className="text-xs font-semibold">Last Signal</span></div>
                {smc?.lastSignal ? <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Type</span><span className="text-xs font-bold" style={{ color: smc.lastSignal.type === 'CHoCH' ? '#a855f7' : '#06b6d4' }}>{smc.lastSignal.type}</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Dir</span><span className="text-xs font-bold" style={{ color: smc.lastSignal.direction === 'bullish' ? '#10b981' : '#ef4444' }}>{smc.lastSignal.direction.toUpperCase()}</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[#64748b] uppercase">Price</span><span className="text-xs font-mono">{fmtPrice(smc.lastSignal.price)}</span></div>
                </div> : <div className="text-xs text-[#64748b] text-center py-2">Waiting...</div>}
              </div>
              {/* Bot Status */}
              {bots.map(bot => (
                <div key={bot.id} className="glass" style={{ borderLeft: `3px solid ${bot.color}` }}>
                  <div className="flex items-center justify-between"><span className="text-xs font-semibold">{bot.name}</span><span className={`badge ${bot.running ? 'badge-green' : 'badge-gray'}`}>{bot.running ? 'RUNNING' : 'IDLE'}</span></div>
                  <div className="flex justify-between mt-1"><span className="text-[10px] text-[#64748b]">{bot.market}</span><span className="text-[10px] font-mono" style={{ color: bot.pnl >= 0 ? '#10b981' : '#ef4444' }}>{bot.pnl >= 0 ? '+' : ''}{bot.pnl.toFixed(2)}%</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Debug + Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Debug */}
            <div className="glass" style={{ padding: 0 }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e293b]"><span className="text-xs font-semibold text-[#f59e0b]">Debug Log</span><span className="text-[10px] text-[#64748b]">{debug.length} entries</span></div>
              <div ref={debugRef} className="debug-box" style={{ maxHeight: 250, margin: 0, border: 'none', borderRadius: 0 }}>
                {debug.length === 0 && <div className="text-[#64748b] text-xs py-4 text-center">No debug messages yet...</div>}
                {debug.map((d, i) => (<div key={i} className={`py-0.5 ${d.startsWith('[ERROR]') ? 'text-[#ef4444]' : d.startsWith('[OK]') ? 'text-[#10b981]' : 'text-[#f59e0b]'}`} style={{ fontSize: 11 }}>{d}</div>))}
              </div>
            </div>
            {/* Signal Log */}
            <div className="glass" style={{ padding: 0 }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e293b]"><span className="text-xs font-semibold">Signal Log</span><span className="text-[10px] text-[#64748b]">{logs.length} entries</span></div>
              <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                <table className="log-table"><thead><tr><th>Time</th><th>Type</th><th>Message</th><th>Market</th></tr></thead>
                  <tbody>
                    {logs.slice(0, 30).map(l => (
                      <tr key={l.id}>
                        <td className="font-mono text-[10px] text-[#64748b] whitespace-nowrap">{fmtTime(l.timestamp)}</td>
                        <td><span className={`badge ${l.type === 'SIGNAL' ? 'badge-purple' : l.type === 'TRADE' ? 'badge-cyan' : l.type === 'ERROR' ? 'badge-red' : 'badge-gray'}`} style={{ fontSize: 9 }}>{l.type}</span></td>
                        <td className="max-w-[200px] truncate" style={{ color: l.type === 'TRADE' ? '#06b6d4' : '#94a3b8' }}>{l.message}</td>
                        <td className="font-mono text-[10px] text-[#64748b]">{l.market || '-'}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={4} className="text-center text-[#64748b] py-4 text-xs">No signals yet...</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Trades Table */}
          {trades.length > 0 && (
            <div className="glass" style={{ padding: 0 }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e293b]"><span className="text-xs font-semibold">Trade History</span><span className="text-[10px] text-[#64748b]">{trades.length} trades</span></div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="log-table"><thead><tr><th>Bot</th><th>Market</th><th>Side</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Status</th></tr></thead>
                  <tbody>
                    {trades.slice().reverse().map(t => (
                      <tr key={t.id}>
                        <td className="text-xs font-semibold" style={{ color: bots.find(b => b.id === t.botId)?.color }}>{t.botName}</td>
                        <td className="font-mono text-[10px] text-[#64748b]">{t.market}</td>
                        <td><span className={`badge ${t.side === 'LONG' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 9 }}>{t.side}</span></td>
                        <td className="font-mono text-xs">{fmtPrice(t.entryPrice)}</td>
                        <td className="font-mono text-xs">{t.exitPrice ? fmtPrice(t.exitPrice) : '—'}</td>
                        <td className={`font-mono text-xs ${(t.pnl || 0) >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{(t.pnl || 0) >= 0 ? '+' : ''}{(t.pnl || 0).toFixed(2)}%</td>
                        <td><span className={`badge ${t.status === 'OPEN' ? 'badge-cyan' : t.result === 'WIN' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 9 }}>{t.status === 'OPEN' ? 'OPEN' : t.result}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="glass max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            {!settingsUnlocked ? (
              <>
                <h3 className="text-lg font-bold mb-4">Settings</h3>
                <p className="text-xs text-[#64748b] mb-3">Enter password to access settings</p>
                <input className="adeen-input mb-3" type="password" placeholder="Password" value={pwInput} onChange={e => setPwInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { if (pwInput === 'Bozzerror') setSettingsUnlocked(true); else addDebug('Wrong password!', 'error'); } }} />
                <button className="adeen-btn w-full" onClick={() => { if (pwInput === 'Bozzerror') setSettingsUnlocked(true); else addDebug('Wrong password!', 'error'); }}>Unlock</button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-4 text-[#06b6d4]">Settings</h3>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                  <div><label className="text-[10px] text-[#64748b] uppercase">Leverage</label><input className="adeen-input" type="number" value={leverage} onChange={e => setLeverage(Math.min(125, Math.max(1, Number(e.target.value))))} min={1} max={125} /></div>
                  <div><label className="text-[10px] text-[#64748b] uppercase">Risk Per Trade (%)</label><input className="adeen-input" type="number" value={riskPerTrade} onChange={e => setRiskPerTrade(Math.min(100, Math.max(0.1, Number(e.target.value))))} min={0.1} max={100} step={0.1} /></div>
                  <div><label className="text-[10px] text-[#64748b] uppercase">API Key</label><input className="adeen-input text-xs" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Binance Testnet API Key" /></div>
                  <div><label className="text-[10px] text-[#64748b] uppercase">Secret Key</label><input className="adeen-input text-xs" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Secret Key" /></div>
                  <button className="adeen-btn w-full text-xs" onClick={() => { handleConnect(); }} disabled={loading}>{loading ? 'Testing...' : 'Test & Save API'}</button>
                  <div className="pt-2 border-t border-[#1e293b]"><p className="text-[10px] text-[#64748b] leading-relaxed"><strong className="text-[#94a3b8]">SMC Strategy:</strong> Detects Break of Structure (BoS) and Change of Character (CHoCH) signals based on swing highs/lows.<br/><br/><strong className="text-[#94a3b8]">Trend Filter:</strong> Uses EMA20/50 crossover + ADX strength. Only trades with trend for Trend Bot.<br/><br/><strong className="text-[#94a3b8]">Volume Filter:</strong> Requires 1.5x average volume for confirmation.<br/><br/><strong className="text-[#94a3b8]">Risk:</strong> Each trade risks the set % of your balance with 2:1 R/R ratio.</p></div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
