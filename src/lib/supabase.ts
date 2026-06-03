// ============================================================
// ALADEEN Cloud Sync — Supabase Client
// Encrypts API secrets client-side before storing in Supabase
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ─── Client Setup ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function isSupabaseReady(): boolean {
  return SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;
}

export function getSupabaseStatus(): { ready: boolean; message: string } {
  if (!SUPABASE_URL || SUPABASE_URL.length < 10) {
    return { ready: false, message: 'Supabase URL not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local' };
  }
  if (!SUPABASE_KEY || SUPABASE_KEY.length < 10) {
    return { ready: false, message: 'Supabase key not configured. Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local' };
  }
  return { ready: true, message: 'Supabase connected' };
}

// ─── Crypto Helpers ───
// Derive encryption key from API key using a simple hash
async function deriveKey(apiKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // Use first 32 bytes of SHA-256 hash of apiKey as the AES key
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
  return crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(plainText: string, apiKey: string): Promise<string> {
  const key = await deriveKey(apiKey);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptSecret(cipherText: string, apiKey: string): Promise<string> {
  const key = await deriveKey(apiKey);
  const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

// ─── User ID ───
export function getUserId(apiKey: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(apiKey.length, 30); i++) {
    const char = apiKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `al_${Math.abs(hash).toString(36)}_${apiKey.slice(0, 6)}`;
}

// ─── Types ───
export interface CloudSettings {
  bots_json: any[];
  timeframe: string;
  leverage: number;
  risk_per_trade: number;
  settings_json: Record<string, any>;
  updated_at?: string;
}

export interface CloudTrade {
  trade_id: string;
  bot_id: string;
  bot_name: string;
  market: string;
  side: string;
  signal_type: string;
  entry_price: number;
  exit_price?: number;
  quantity: number;
  leverage: number;
  tp_price: number;
  sl_price: number;
  confluence_score: number;
  pnl: number;
  pnl_percent: number;
  status: string;
  result?: string;
  entry_time: number;
  exit_time?: number;
  close_reason?: string;
  binance_order_id?: number;
  created_at?: string;
}

export interface CloudLog {
  log_type: string;
  message: string;
  market?: string;
  score?: number;
  details?: string;
  timestamp: number;
  created_at?: string;
}

// ─── SAVE / LOAD API ───

/**
 * Save all settings + encrypted API credentials to Supabase.
 * Call this after successful API connection.
 */
export async function saveCredentials(
  apiKey: string,
  apiSecret: string,
  bots: any[],
  timeframe: string,
  leverage: number,
  riskPerTrade: number,
  settings: Record<string, any> = {}
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase not configured' };

  try {
    const userId = getUserId(apiKey);
    const encryptedSecret = await encryptSecret(apiSecret, apiKey);

    const { error } = await supabase
      .from('aladeen_bots')
      .upsert({
        user_id: userId,
        api_key: apiKey,
        api_secret: encryptedSecret,
        bots_json: bots,
        timeframe,
        leverage,
        risk_per_trade: riskPerTrade,
        settings_json: settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Load credentials from Supabase using just the API key.
 * Returns decrypted secret + all saved settings.
 */
export async function loadCredentials(
  apiKey: string
): Promise<{
  success: boolean;
  apiSecret?: string;
  bots?: any[];
  timeframe?: string;
  leverage?: number;
  riskPerTrade?: number;
  settings?: Record<string, any>;
  error?: string;
}> {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase not configured' };

  try {
    const userId = getUserId(apiKey);
    const { data, error } = await supabase
      .from('aladeen_bots')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return { success: false, error: 'No saved data for this API key. Connect with your secret to save.' };
      return { success: false, error: error.message };
    }

    if (!data) return { success: false, error: 'No data found' };

    const decryptedSecret = await decryptSecret(data.api_secret, apiKey);

    return {
      success: true,
      apiSecret: decryptedSecret,
      bots: data.bots_json || [],
      timeframe: data.timeframe || '15m',
      leverage: data.leverage || 10,
      riskPerTrade: parseFloat(data.risk_per_trade) || 3,
      settings: data.settings_json || {},
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Check if credentials exist for this API key (without needing the secret).
 * Used to show "saved" status in the UI.
 */
export async function hasSavedCredentials(apiKey: string): Promise<boolean> {
  if (!isSupabaseReady()) return false;
  try {
    const userId = getUserId(apiKey);
    const { data, error } = await supabase
      .from('aladeen_bots')
      .select('user_id')
      .eq('user_id', userId)
      .single();
    return !error && !!data;
  } catch { return false; }
}

/**
 * Update bot states without touching API credentials.
 * Call whenever bots change (start/stop, market change).
 */
export async function updateBotsState(
  apiKey: string,
  bots: any[],
  timeframe?: string,
  leverage?: number,
  riskPerTrade?: number
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase not configured' };

  try {
    const userId = getUserId(apiKey);
    const update: Record<string, any> = { bots_json: bots, updated_at: new Date().toISOString() };
    if (timeframe !== undefined) update.timeframe = timeframe;
    if (leverage !== undefined) update.leverage = leverage;
    if (riskPerTrade !== undefined) update.risk_per_trade = riskPerTrade;

    const { error } = await supabase.from('aladeen_bots').update(update).eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Save a trade to cloud.
 */
export async function saveTrade(
  apiKey: string,
  trade: CloudTrade
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase not configured' };

  try {
    const userId = getUserId(apiKey);
    const { error } = await supabase.from('aladeen_trades').upsert(
      { user_id: userId, ...trade, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,trade_id' }
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Load trades from cloud.
 */
export async function loadTrades(apiKey: string): Promise<CloudTrade[]> {
  if (!isSupabaseReady()) return [];
  try {
    const userId = getUserId(apiKey);
    const { data, error } = await supabase
      .from('aladeen_trades')
      .select('*')
      .eq('user_id', userId)
      .order('entry_time', { ascending: false })
      .limit(200);
    if (error) return [];
    return (data || []).map((d: any) => ({ ...d, entry_price: parseFloat(d.entry_price), exit_price: d.exit_price ? parseFloat(d.exit_price) : undefined, quantity: parseFloat(d.quantity), tp_price: parseFloat(d.tp_price), sl_price: parseFloat(d.sl_price), pnl: parseFloat(d.pnl), pnl_percent: parseFloat(d.pnl_percent) }));
  } catch { return []; }
}

/**
 * Add a log entry to cloud.
 */
export async function addCloudLog(
  apiKey: string,
  log: CloudLog
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase not configured' };

  try {
    const userId = getUserId(apiKey);
    const { error } = await supabase.from('aladeen_logs').insert({
      user_id: userId,
      ...log,
      created_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Load logs from cloud.
 */
export async function loadCloudLogs(apiKey: string): Promise<CloudLog[]> {
  if (!isSupabaseReady()) return [];
  try {
    const userId = getUserId(apiKey);
    const { data, error } = await supabase
      .from('aladeen_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(200);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

// ─── REAL-TIME SUBSCRIPTIONS ───

export type SyncCallback = (payload: { table: string; data: any }) => void;

export function subscribeToUserData(apiKey: string, callback: SyncCallback) {
  if (!isSupabaseReady()) return { unsubscribe: () => {} };
  const userId = getUserId(apiKey);

  const channel = supabase.channel(`aladeen_sync_${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aladeen_bots', filter: `user_id=eq.${userId}` }, (payload) => {
      callback({ table: 'aladeen_bots', data: payload });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aladeen_trades', filter: `user_id=eq.${userId}` }, (payload) => {
      callback({ table: 'aladeen_trades', data: payload });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'aladeen_logs', filter: `user_id=eq.${userId}` }, (payload) => {
      callback({ table: 'aladeen_logs', data: payload });
    })
    .subscribe();

  return {
    unsubscribe: () => { supabase.removeChannel(channel); },
  };
}

/**
 * Delete all cloud data for a user (disconnect).
 */
export async function deleteAllUserData(apiKey: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase not configured' };
  try {
    const userId = getUserId(apiKey);
    await supabase.from('aladeen_trades').delete().eq('user_id', userId);
    await supabase.from('aladeen_logs').delete().eq('user_id', userId);
    await supabase.from('aladeen_bots').delete().eq('user_id', userId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
