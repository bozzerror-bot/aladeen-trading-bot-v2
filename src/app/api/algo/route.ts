import { NextResponse } from 'next/server';
import { placeAlgoOrder } from '@/lib/binance-server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, apiSecret, symbol, side, quantity, stopPrice, workingType, reduceOnly } = body;
    if (!apiKey || !apiSecret || !symbol || !side || !stopPrice) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const order = await placeAlgoOrder(apiKey, apiSecret, { symbol, side, quantity, stopPrice, workingType: workingType || 'MARK_PRICE', reduceOnly: reduceOnly || 'true' });
    return NextResponse.json({ success: true, algoId: order.algoId, status: order.status });
  } catch (e: any) {
    const msg = e.message || 'Algo order failed';
    let debug = msg;
    if (msg.includes('-4120')) debug = 'Binance Testnet Algo Orders may require special permissions. Try using regular STOP_MARKET orders with closePosition instead.';
    return NextResponse.json({ error: msg, debug }, { status: 500 });
  }
}
