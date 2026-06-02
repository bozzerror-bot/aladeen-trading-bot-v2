import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/binance-server';

export async function POST(req: Request) {
  try {
    const { apiKey, apiSecret } = await req.json();
    if (!apiKey || !apiSecret) return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    const positions = await getPositions(apiKey, apiSecret);
    return NextResponse.json(positions);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch positions', debug: 'Binance may be rate-limiting. Wait 10s and retry.' }, { status: 500 });
  }
}
