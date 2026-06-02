import { NextResponse } from 'next/server';
import { closePosition } from '@/lib/binance-server';

export async function POST(req: Request) {
  try {
    const { apiKey, apiSecret, symbol, side, quantity } = await req.json();
    if (!apiKey || !apiSecret || !symbol || !side || !quantity) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const order = await closePosition(apiKey, apiSecret, symbol, side, String(quantity));
    return NextResponse.json({ success: true, orderId: order.orderId, status: order.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Close failed', debug: 'Position may already be closed or quantity mismatch.' }, { status: 500 });
  }
}
