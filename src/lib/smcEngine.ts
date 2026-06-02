import type { Candle, SMCSignal, SwingPoint, SMCState, TrendAnalysis, VolumeAnalysis, ConfluenceScore } from './types';

export function findPivotHigh(c: Candle[], len: number): SwingPoint | null {
  if (c.length < 2 * len + 1) return null;
  const center = c.length - len - 1;
  if (center < len) return null;
  const ch = c[center].high;
  for (let i = 1; i <= len; i++) if (c[center - i].high > ch || c[center + i].high >= ch) return null;
  return { price: ch, index: center, type: 'high' };
}

export function findPivotLow(c: Candle[], len: number): SwingPoint | null {
  if (c.length < 2 * len + 1) return null;
  const center = c.length - len - 1;
  if (center < len) return null;
  const cl = c[center].low;
  for (let i = 1; i <= len; i++) if (c[center - i].low < cl || c[center + i].low <= cl) return null;
  return { price: cl, index: center, type: 'low' };
}

export function analyzeSMC(candles: Candle[], pivotLen = 3): SMCState {
  const state: SMCState = { signals: [], swingHighs: [], swingLows: [], trend: 0 };
  let lastSH: SwingPoint | null = null, lastSL: SwingPoint | null = null;
  let prevSH: SwingPoint | null = null, prevSL: SwingPoint | null = null;

  for (let i = pivotLen * 2 + 1; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const ph = findPivotHigh(slice, pivotLen);
    const pl = findPivotLow(slice, pivotLen);

    if (ph && (!lastSH || ph.price !== lastSH.price)) { prevSH = lastSH; lastSH = ph; state.swingHighs.push(ph); }
    if (pl && (!lastSL || pl.price !== lastSL.price)) { prevSL = lastSL; lastSL = pl; state.swingLows.push(pl); }

    const curr = candles[i], prev = candles[i - 1];
    if (!curr || !prev || !lastSH || !lastSL) continue;

    if (curr.close > lastSH.price && prev.close <= lastSH.price) {
      const isChoch = state.trend === -1 || state.trend === 0;
      const sig: SMCSignal = { type: isChoch ? 'CHoCH' : 'BoS', direction: 'bullish', price: lastSH.price, time: curr.time, index: i };
      state.signals.push(sig); state.trend = 1; state.lastSignal = sig;
    }
    if (curr.close < lastSL.price && prev.close >= lastSL.price) {
      const isChoch = state.trend === 1 || state.trend === 0;
      const sig: SMCSignal = { type: isChoch ? 'CHoCH' : 'BoS', direction: 'bearish', price: lastSL.price, time: curr.time, index: i };
      state.signals.push(sig); state.trend = -1; state.lastSignal = sig;
    }
  }
  return state;
}

function calcEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

function calcADX(candles: Candle[], period = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length < period + 2) return { adx: 0, plusDI: 0, minusDI: 0 };
  let trSum = 0, plusDMSum = 0, minusDMSum = 0;
  for (let i = candles.length - period - 1; i < candles.length - 1; i++) {
    const curr = candles[i + 1], prev = candles[i];
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
    const plusDM = curr.high - prev.high > prev.low - curr.low ? Math.max(curr.high - prev.high, 0) : 0;
    const minusDM = prev.low - curr.low > curr.high - prev.high ? Math.max(prev.low - curr.low, 0) : 0;
    trSum += tr; plusDMSum += plusDM; minusDMSum += minusDM;
  }
  const atr = trSum / period;
  const plusDI = atr > 0 ? (plusDMSum / period) / atr * 100 : 0;
  const minusDI = atr > 0 ? (minusDMSum / period) / atr * 100 : 0;
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  return { adx: dx, plusDI, minusDI };
}

export function analyzeTrend(candles: Candle[]): TrendAnalysis {
  if (candles.length < 50) return { ema20: 0, ema50: 0, adx: 0, trendDirection: 'neutral', strength: 0 };
  const closes = candles.map((c) => c.close);
  const ema20 = calcEMA(closes.slice(-20), 20);
  const ema50 = calcEMA(closes.slice(-50), 50);
  const { adx, plusDI, minusDI } = calcADX(candles);
  const lastClose = closes[closes.length - 1];
  let dir: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (lastClose > ema20 && ema20 > ema50 && plusDI > minusDI) dir = 'bullish';
  else if (lastClose < ema20 && ema20 < ema50 && minusDI > plusDI) dir = 'bearish';
  return { ema20, ema50, adx, trendDirection: dir, strength: Math.min(100, Math.round(adx)) };
}

export function analyzeVolume(candles: Candle[]): VolumeAnalysis {
  if (candles.length < 20) return { currentVolume: 0, avgVolume20: 0, volumeRatio: 0, obvSlope: 'flat', confirmation: false };
  const recent = candles.slice(-21, -1);
  const avgVol = recent.reduce((s, c) => s + c.volume, 0) / 20;
  const currVol = candles[candles.length - 1].volume;
  const ratio = avgVol > 0 ? currVol / avgVol : 0;
  let obv = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
  }
  const obvRecent = obv;
  let obvOld = 0;
  for (let i = 1; i < Math.max(2, candles.length - 10); i++) {
    if (candles[i].close > candles[i - 1].close) obvOld += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obvOld -= candles[i].volume;
  }
  const obvSlope: 'rising' | 'falling' | 'flat' = obvRecent > obvOld * 1.01 ? 'rising' : obvRecent < obvOld * 0.99 ? 'falling' : 'flat';
  return { currentVolume: currVol, avgVolume20: avgVol, volumeRatio: ratio, obvSlope, confirmation: ratio > 1.5 };
}

export function calculateConfluence(signal: SMCSignal, trend: TrendAnalysis, volume: VolumeAnalysis, entryPrice: number, tpPrice: number, slPrice: number, weights = { smc: 30, trend: 30, volume: 25, riskReward: 15 }): ConfluenceScore {
  let smcScore = 15;
  if (signal.type === 'BoS' && ((signal.direction === 'bullish' && trend.trendDirection === 'bullish') || (signal.direction === 'bearish' && trend.trendDirection === 'bearish'))) smcScore += 10;
  if (signal.type === 'CHoCH') smcScore += 5;
  smcScore = Math.min(30, smcScore);

  let trendScore = 0;
  if ((signal.direction === 'bullish' && trend.trendDirection === 'bullish') || (signal.direction === 'bearish' && trend.trendDirection === 'bearish')) trendScore += 15;
  else if (trend.trendDirection === 'neutral') trendScore += 8;
  if (trend.strength > 25) trendScore += 10;
  if (trend.strength > 40) trendScore += 5;
  trendScore = Math.min(30, trendScore);

  let volumeScore = 0;
  if (volume.confirmation) volumeScore += 15;
  if (volume.volumeRatio > 2) volumeScore += 5;
  if ((signal.direction === 'bullish' && volume.obvSlope === 'rising') || (signal.direction === 'bearish' && volume.obvSlope === 'falling')) volumeScore += 5;
  volumeScore = Math.min(25, volumeScore);

  const rr = Math.abs((tpPrice - entryPrice) / (entryPrice - slPrice));
  let rrScore = 0;
  if (rr >= 1.5) rrScore += 10;
  if (rr >= 2) rrScore += 5;
  rrScore = Math.min(15, rrScore);

  const total = smcScore + trendScore + volumeScore + rrScore;
  let verdict: ConfluenceScore['verdict'] = 'SKIP';
  if (total >= 85) verdict = 'FULL';
  else if (total >= 70) verdict = 'NORMAL';
  else if (total >= 50) verdict = 'SMALL';

  return { total, smcScore, trendScore, volumeScore, riskRewardScore: rrScore, verdict };
}

export function quickScore(signal: SMCSignal, trend: TrendAnalysis, volume: VolumeAnalysis): number {
  const score = calculateConfluence(signal, trend, volume, 0, 1, -1);
  return score.total;
}
