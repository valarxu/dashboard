export interface KlineData {
  change: number;
  volume: string;
  prevChange: number;
  prevVolume: string;
  prevPrevChange: number;
  prevPrevVolume: string;
}

export interface CoinData {
  symbol: string;
  name: string;
  price: string;
  klines: {
    '15m': KlineData;
    '4h': KlineData;
    '24h': KlineData;
  };
}

export interface Alert {
  id: string;
  symbol: string;
  timeframe: string;
  volumeChange: number;
  priceChange: number;
  timestamp: Date;
  stage: 'current' | 'prev';
} 