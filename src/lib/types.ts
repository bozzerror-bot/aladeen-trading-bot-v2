export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
export interface SMCSignal { type: 'CHoCH' | 'BoS'; direction: 'bullish' | 'bearish'; price: number; time: number; index: number; }
export interface SwingPoint { price: number; index: number; type: 'high' | 'low'; }
export interface SMCState { signals: SMCSignal[]; swingHighs: SwingPoint[]; swingLows: SwingPoint[]; trend: number; lastSignal?: SMCSignal; }
export interface TrendAnalysis { ema20: number; ema50: number; adx: number; trendDirection: 'bullish' | 'bearish' | 'neutral'; strength: number; }
export interface VolumeAnalysis { currentVolume: number; avgVolume20: number; volumeRatio: number; obvSlope: 'rising' | 'falling' | 'flat'; confirmation: boolean; }
export interface ConfluenceScore { total: number; smcScore: number; trendScore: number; volumeScore: number; riskRewardScore: number; verdict: 'SKIP' | 'SMALL' | 'NORMAL' | 'FULL'; }
export interface Trade { id: string; botId: string; botName: string; market: string; side: 'LONG' | 'SHORT'; signalType: 'BoS' | 'CHoCH'; entryPrice: number; exitPrice?: number; quantity: number; leverage: number; tpPrice: number; slPrice: number; confluenceScore: number; pnl: number; pnlPercent: number; status: 'OPEN' | 'CLOSED'; result?: 'WIN' | 'LOSS' | 'BREAKEVEN'; entryTime: number; exitTime?: number; closeReason?: 'TP' | 'SL' | 'MANUAL'; binanceOrderId?: number; }
export interface BotConfig { id: string; name: string; enabled: boolean; market: string; strategy: string; running: boolean; trades: number; wins: number; losses: number; pnl: number; }
export interface Settings { password: string; paperBalance: number; balance: number; apiKey: string; apiSecret: string; maxRiskPerTrade: number; maxDailyLoss: number; leverage: number; tpSlRatio: number; confluenceWeights: { smc: number; trend: number; volume: number; riskReward: number }; minConfluenceScore: number; timeframe: string; bots: BotConfig[]; }
export interface LogEntry { id: string; timestamp: number; type: 'SIGNAL' | 'TRADE' | 'BOT' | 'ERROR' | 'INFO' | 'DEBUG'; message: string; market?: string; score?: number; details?: string; }
export interface BinancePosition { symbol: string; positionAmt: string; entryPrice: string; markPrice: string; unRealizedProfit: string; liquidationPrice: string; leverage: string; }

export const COINS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT'];
export const TIMEFRAMES = ['1m','5m','15m','1h','4h','1d'];
export const BINANCE_REST = 'https://testnet.binancefuture.com';
export const BINANCE_WS = 'wss://fstream.binancefuture.com/ws';
