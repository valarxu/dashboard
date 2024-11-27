'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { IoRefreshOutline } from 'react-icons/io5';
import WalletMonitor from './components/WalletMonitor';
import TimeframeCell from './components/TimeframeCell';
import { parseVolumeString, formatVolume } from './utils/formatters';
import { CoinData, Alert } from './types';
import Modal from './components/Modal';
import { WalletProvider } from './contexts/WalletContext';
import AddWalletForm from './components/AddWalletForm';
import WalletList from './components/WalletList';

// 添加常量配置
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'SUI', 'BONK', 'UNI', 'APT', 'NEAR', 'ATOM'];
const TIMEFRAMES = {
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '24h': '1d'
};
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5分钟
const VOLUME_ALERT_THRESHOLD = 50; // 50%
const MAX_ALERTS = 5;

// 修改主文件中的相关代码
export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [coinData, setCoinData] = useState<CoinData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // 修改检查警报的逻辑
  const checkForAlerts = useCallback((newData: CoinData[]) => {
    const newAlerts: Alert[] = [];
    
    newData.forEach(coin => {
      Object.entries(coin.klines).forEach(([timeframe, data]) => {
        const currentVol = parseVolumeString(data.volume);
        const prevVol = parseVolumeString(data.prevVolume);
        const volumeChange = ((currentVol - prevVol) / prevVol) * 100;
        
        // 只筛选成交量增加超过50%的情况
        if (volumeChange > VOLUME_ALERT_THRESHOLD) {  // 移除 Math.abs()，只检查正值
          newAlerts.push({
            id: `${coin.symbol}-${timeframe}-${Date.now()}`,
            symbol: coin.symbol,
            timeframe: timeframe,
            volumeChange: volumeChange,
            priceChange: data.change,
            timestamp: new Date(),
          });
        }
      });
    });

    // 将新警报添加到现有警报中，只保留最近5条
    setAlerts(prev => [...newAlerts, ...prev].slice(0, MAX_ALERTS));
  }, []);

  // 修改 fetchData 函数以包含警报检查
  const fetchData = useCallback(async (showRefreshAnimation = false) => {
    if (showRefreshAnimation) {
      setIsRefreshing(true);
    }
    try {
      const results = await Promise.allSettled(
        SYMBOLS.map(symbol => fetchBinanceData(symbol))
      );

      const successfulData = results
        .filter((result): result is PromiseFulfilledResult<CoinData> => 
          result.status === 'fulfilled'
        )
        .map(result => result.value);

      if (successfulData.length === 0) {
        throw new Error('无法获取任何币种数据');
      }

      setCoinData(successfulData);
      checkForAlerts(successfulData); // 检查警报
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError('获取数据失败，请稍后重试');
      console.error('Data fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [checkForAlerts]);

  // 初始加载和自动刷新
  useEffect(() => {
    fetchData();
    
    // 每5分钟刷新一次
    const intervalId = setInterval(() => {
      fetchData(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchData]);

  const handleManualRefresh = () => {
    fetchData(true);
  };

  // 优化 fetchBinanceData 函数
  const fetchBinanceData = async (symbol: string): Promise<CoinData> => {
    try {
      const [priceResponse, ...klineResponses] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`),
        ...Object.entries(TIMEFRAMES).map(([_, interval]) =>
          fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=2`)
        )
      ]);

      const priceData = await priceResponse.json();
      const klineResults = await Promise.all(klineResponses.map(r => r.json()));

      // 处理K线数据
      const klines = Object.fromEntries(
        Object.keys(TIMEFRAMES).map((timeframe, index) => {
          const klineData = klineResults[index];
          if (klineData.length < 2) {
            throw new Error(`无法获取${symbol}的${timeframe}数据`);
          }

          const [prevKline, currentKline] = klineData;
          const calculateChange = (kline: any[]) => {
            const openPrice = parseFloat(kline[1]);
            const closePrice = parseFloat(kline[4]);
            return ((closePrice - openPrice) / openPrice) * 100;
          };

          return [timeframe, {
            change: calculateChange(currentKline),
            volume: formatVolume(currentKline[5]),
            prevChange: calculateChange(prevKline),
            prevVolume: formatVolume(prevKline[5])
          }];
        })
      );
      
      return {
        symbol,
        name: symbol,
        price: parseFloat(priceData.price).toFixed(2),
        klines: klines as CoinData['klines']
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      throw error;
    }
  };

  return (
    <WalletProvider>
      <main className="flex flex-row h-screen w-full overflow-hidden">
        {/* 左侧区域 - 推特内容 */}
        <div className="w-1/4 bg-gray-900 border-r border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-gray-200 text-xl font-medium">推特内容</h2>
          </div>
          {/* 这里可以添加推特内容的组件 */}
        </div>

        {/* 中间区域保持不变 */}
        <div className="w-2/4 bg-gray-900 flex flex-col">
          {/* 警报区域 */}
          <div className="bg-gray-800 border-b border-gray-700">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-300 text-sm font-medium">交易量警报</h3>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm">
                    {lastUpdated && `最后更新: ${lastUpdated.toLocaleTimeString()}`}
                  </span>
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className={`p-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-750 
                      transition-all ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <IoRefreshOutline className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {alerts.length === 0 ? (
                  <div className="text-gray-500 text-sm">暂警报</div>
                ) : (
                  alerts.slice(0, 5).map(alert => (
                    <div 
                      key={alert.id} 
                      className="text-sm flex items-center justify-between bg-gray-750/50 rounded p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{alert.symbol}</span>
                        <span className="text-gray-400">{alert.timeframe}级别</span>
                        <span className="text-green-500 font-medium">
                          交易量增加 {alert.volumeChange.toFixed(2)}%
                        </span>
                        <span className={`${alert.priceChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          涨跌幅 {alert.priceChange > 0 ? '+' : ''}{alert.priceChange.toFixed(2)}%
                        </span>
                        <span className="text-gray-500">
                          ({alert.timestamp.toLocaleTimeString()})
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 数据区域 */}
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
            {/* 移除原来的刷新按钮区域 */}
            <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
              {/* 表头部分保持不变 */}
              <div className="px-4">
                <div className="bg-gray-800 rounded-t p-3">
                  <div className="grid grid-cols-5 divide-x divide-gray-700">
                    {['5分钟', '15分钟', '1小时', '4小时', '24小时'].map((time) => (
                      <div key={time} className="px-3">
                        <div className="text-center">
                          <span className="text-sm font-medium text-gray-300">{time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="px-4 py-2 text-red-500 text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* 币种数据表格部分保持不变 */}
            <div className="p-4 space-y-3">
              {isLoading ? (
                [...Array(10)].map((_, index) => (
                  <div key={index} className="bg-gray-800 p-3 rounded animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-6 w-14 bg-gray-700 rounded"></div>
                      <div className="h-6 w-20 bg-gray-700 rounded"></div>
                    </div>
                    <div className="grid grid-cols-5 divide-x divide-gray-700">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="px-3">
                          <div className="h-20 bg-gray-700 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                coinData.map(data => (
                  <div key={data.symbol} className="bg-gray-800 p-3 rounded hover:bg-gray-750 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg font-bold text-white">{data.symbol}</span>
                      <span className="text-white">${data.price}</span>
                    </div>
                    <div className="grid grid-cols-5 divide-x divide-gray-700">
                      {Object.keys(data.klines).map((timeframe) => (
                        <div key={timeframe} className="px-3">
                          <TimeframeCell data={data.klines[timeframe as keyof typeof data.klines]} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 右侧区域 - 钱包监控 */}
        <div className="w-1/4 bg-gray-900 border-l border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="text-gray-200 text-xl font-medium">钱包监控</h2>
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              管理钱包
            </button>
          </div>
          <WalletMonitor isModalOpen={isWalletModalOpen} />
        </div>

        {/* 钱包管理弹窗 */}
        <Modal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          title="钱包管理"
        >
          <div className="space-y-4">
            <AddWalletForm />
            <div className="space-y-3">
              <h3 className="text-gray-200 font-medium">已监控钱包</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <WalletList />
              </div>
            </div>
          </div>
        </Modal>
      </main>
    </WalletProvider>
  );
} 