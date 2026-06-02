import { NextResponse } from 'next/server';
import { BINANCE_REST } from '@/lib/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const interval = searchParams.get('interval') || '15m';
    const limit = searchParams.get('limit') || '150';
    const res = await fetch(`${BINANCE_REST}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!res.ok) return NextResponse.json({ error: 'Binance API error' }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data.map((d: any[]) => ({
      time: Math.floor(d[0] / 1000), open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]),
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
