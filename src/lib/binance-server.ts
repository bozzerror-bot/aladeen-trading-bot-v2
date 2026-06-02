'use server';
import { BINANCE_REST } from './types';

async function sign(query: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(query));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function binanceRequest(endpoint: string, apiKey: string, apiSecret: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', extraParams: Record<string, string> = {}) {
  const timestamp = Date.now().toString();
  const params = new URLSearchParams({ timestamp, ...extraParams });
  const query = params.toString();
  const signature = await sign(query, apiSecret);
  const url = `${BINANCE_REST}${endpoint}?${query}&signature=${signature}`;
  const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) { const err = await res.text(); throw new Error(`Binance ${res.status}: ${err.slice(0, 200)}`); }
  return res.json();
}

export async function getBalance(apiKey: string, apiSecret: string) {
  const data = await binanceRequest('/fapi/v2/account', apiKey, apiSecret);
  const usdt = data.assets?.find((a: any) => a.asset === 'USDT');
  return { available: parseFloat(usdt?.availableBalance || 0), total: parseFloat(usdt?.walletBalance || 0), unrealized: parseFloat(usdt?.unrealizedProfit || 0) };
}

export async function getPositions(apiKey: string, apiSecret: string) {
  const data = await binanceRequest('/fapi/v2/positionRisk', apiKey, apiSecret);
  return (data || []).filter((p: any) => parseFloat(p.positionAmt) !== 0);
}

export async function placeOrder(apiKey: string, apiSecret: string, params: { symbol: string; side: string; type?: string; quantity: string; stopPrice?: string; closePosition?: string; workingType?: string; timeInForce?: string; price?: string }) {
  const extra: Record<string, string> = { symbol: params.symbol, side: params.side, type: params.type || 'MARKET', quantity: params.quantity };
  if (params.stopPrice) extra.stopPrice = params.stopPrice;
  if (params.closePosition) extra.closePosition = params.closePosition;
  if (params.workingType) extra.workingType = params.workingType;
  if (params.timeInForce) extra.timeInForce = params.timeInForce;
  if (params.price) extra.price = params.price;
  return binanceRequest('/fapi/v1/order', apiKey, apiSecret, 'POST', extra);
}

export async function closePosition(apiKey: string, apiSecret: string, symbol: string, side: string, quantity: string) {
  return placeOrder(apiKey, apiSecret, { symbol, side: side === 'LONG' ? 'SELL' : 'BUY', type: 'MARKET', quantity });
}

export async function cancelOrder(apiKey: string, apiSecret: string, symbol: string, orderId: string) {
  return binanceRequest('/fapi/v1/order', apiKey, apiSecret, 'DELETE', { symbol, orderId });
}

export async function getOpenOrders(apiKey: string, apiSecret: string, symbol?: string) {
  const extra: Record<string, string> = {};
  if (symbol) extra.symbol = symbol;
  return binanceRequest('/fapi/v1/openOrders', apiKey, apiSecret, 'GET', extra);
}

export async function setLeverage(apiKey: string, apiSecret: string, symbol: string, leverage: number) {
  return binanceRequest('/fapi/v1/leverage', apiKey, apiSecret, 'POST', { symbol, leverage: leverage.toString() });
}

export async function changeMarginType(apiKey: string, apiSecret: string, symbol: string, marginType: 'ISOLATED' | 'CROSSED') {
  try { return await binanceRequest('/fapi/v1/marginType', apiKey, apiSecret, 'POST', { symbol, marginType }); } catch { return null; }
}

// Binance Algo Order API for TP/SL
export async function placeAlgoOrder(apiKey: string, apiSecret: string, params: {
  symbol: string; side: string; positionSide?: string;
  strategyType?: string; // 1 = TP/SL, 2 = Trailing Stop
  quantity?: string;
  stopPrice?: string; // trigger price
  price?: string; // limit price (optional)
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  reduceOnly?: string;
}) {
  const extra: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    strategyType: params.strategyType || '1',
    positionSide: params.positionSide || 'BOTH',
  };
  if (params.quantity) extra.quantity = params.quantity;
  if (params.stopPrice) extra.stopPrice = params.stopPrice;
  if (params.price) extra.price = params.price;
  if (params.workingType) extra.workingType = params.workingType;
  if (params.reduceOnly) extra.reduceOnly = params.reduceOnly;
  return binanceRequest('/fapi/v1/algoOrder', apiKey, apiSecret, 'POST', extra);
}

export async function testConnection(apiKey: string) {
  try { const res = await fetch(`${BINANCE_REST}/fapi/v1/time`, { headers: { 'X-MBX-APIKEY': apiKey } }); return res.ok; } catch { return false; }
}
