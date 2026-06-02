import { NextResponse } from 'next/server';
import { getBalance, testConnection } from '@/lib/binance-server';

export async function POST(req: Request) {
  try {
    const { apiKey, apiSecret } = await req.json();
    if (!apiKey || !apiSecret) return NextResponse.json({ error: 'API key and secret required' }, { status: 400 });
    const ok = await testConnection(apiKey);
    if (!ok) return NextResponse.json({ error: 'Cannot connect to Binance Testnet. Check your API key.' }, { status: 503 });
    const balance = await getBalance(apiKey, apiSecret);
    return NextResponse.json(balance);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch balance', debug: 'Check if your API key has Futures permissions enabled' }, { status: 500 });
  }
}
