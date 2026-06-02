import { NextResponse } from 'next/server';
import { placeOrder, setLeverage, changeMarginType } from '@/lib/binance-server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, apiSecret, symbol, side, quantity, type, stopPrice, closePosition, leverage } = body;
    if (!apiKey || !apiSecret || !symbol || !side || !quantity) {
      return NextResponse.json({ error: 'Missing required fields: apiKey, apiSecret, symbol, side, quantity' }, { status: 400 });
    }

    // Set leverage first
    if (leverage) {
      try { await setLeverage(apiKey, apiSecret, symbol, leverage); } catch (e: any) {
        if (!e.message?.includes('leverage')) return NextResponse.json({ error: e.message, debug: 'Leverage setting failed. Try a lower leverage (1-20x).' }, { status: 500 });
      }
    }

    // Set isolated margin
    try { await changeMarginType(apiKey, apiSecret, symbol, 'ISOLATED'); } catch { /* may already be isolated */ }

    // Place the order
    const order = await placeOrder(apiKey, apiSecret, { symbol, side, type: type || 'MARKET', quantity: String(quantity), stopPrice: stopPrice ? String(stopPrice) : undefined, closePosition: closePosition ? 'true' : undefined, workingType: stopPrice ? 'MARK_PRICE' : undefined });

    return NextResponse.json({ success: true, orderId: order.orderId, status: order.status, clientOrderId: order.clientOrderId });
  } catch (e: any) {
    const msg = e.message || 'Order failed';
    let debug = 'Unknown error';
    if (msg.includes('insufficient')) debug = 'Insufficient margin. Reduce position size or increase balance.';
    else if (msg.includes('MIN_NOTIONAL')) debug = 'Order too small. Minimum notional value is ~5 USDT. Increase quantity.';
    else if (msg.includes('leverage')) debug = 'Leverage error. Try 1-10x first.';
    else if (msg.includes('precision')) debug = 'Wrong quantity precision. Check symbol requirements.';
    else if (msg.includes('API-key')) debug = 'Invalid API key. Get new keys from demo.binance.com';
    else if (msg.includes('IP')) debug = 'IP restriction on API key. Remove IP whitelist in Binance settings.';
    else debug = `Full error: ${msg}`;
    return NextResponse.json({ error: msg, debug }, { status: 500 });
  }
}
