import { NextResponse } from 'next/server';
import { testConnection, getBalance } from '@/lib/binance-server';

export async function POST(req: Request) {
  try {
    const { apiKey, apiSecret } = await req.json();
    if (!apiKey || !apiSecret) return NextResponse.json({ error: 'Missing API key or secret' }, { status: 400 });
    const ok = await testConnection(apiKey);
    if (!ok) return NextResponse.json({ error: 'Cannot reach Binance Testnet', debug: 'Check your internet connection or try again later.' }, { status: 503 });
    const balance = await getBalance(apiKey, apiSecret);
    return NextResponse.json({ connected: true, balance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Connection test failed', debug: 'Your API key may not have Futures permissions. Go to demo.binance.com → API Management → Edit permissions → Enable Futures.' }, { status: 500 });
  }
}
