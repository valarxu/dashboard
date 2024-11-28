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
import CurrencySettings from './components/CurrencySettings';

// 添加常量配置
const TIMEFRAMES = {
  '15m': '15m',
  '4h': '4h',
  '24h': '1d'
};
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5分钟
const VOLUME_ALERT_THRESHOLD = 50; // 50%
const MAX_ALERTS = 5;

// 添加一些动画效果的样式
const matrixBg = {
  background: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,20,10,0.95) 100%)',
  backgroundSize: '400% 400%',
  animation: 'matrix-bg 15s ease infinite',
};

// 修改主文件中的相关代码
export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [coinData, setCoinData] = useState<CoinData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [symbols, setSymbols] = useState<string[]>(() => {
    // 如果在服务器端，返回默认值
    if (typeof window === 'undefined') {
      return ['BTC', 'ETH', 'SOL', 'DOGE', 'SUI', 'BONK', 'UNI', 'APT', 'NEAR', 'ATOM'];
    }
    
    // 如果在客户端，尝试从 localStorage 读取
    const savedSymbols = localStorage.getItem('watchlist_symbols');
    return savedSymbols ? JSON.parse(savedSymbols) : ['BTC', 'ETH', 'SOL', 'DOGE', 'SUI', 'BONK', 'UNI', 'APT', 'NEAR', 'ATOM'];
  });

  // 1. 先定义 checkForAlerts
  const checkForAlerts = useCallback((newData: CoinData[]) => {
    // 创建一个函数来生成警报的唯一标识
    const createAlertSignature = (alert: {
      symbol: string;
      timeframe: string;
      stage: 'current' | 'prev';
      volumeChange: number;
      priceChange: number;
    }) => {
      return `${alert.symbol}-${alert.timeframe}-${alert.stage}-${alert.volumeChange.toFixed(2)}-${alert.priceChange.toFixed(2)}`;
    };

    // 获取现有警报的签名集合
    const existingSignatures = new Set(
      alerts.map(alert => createAlertSignature(alert))
    );

    const newAlerts: Alert[] = [];
    
    newData.forEach(coin => {
      Object.entries(coin.klines).forEach(([timeframe, data]) => {
        // 检查前一根K线和当前K线的交易量变化
        const currentVol = parseVolumeString(data.volume);
        const prevVol = parseVolumeString(data.prevVolume);
        const currentVolChange = ((currentVol - prevVol) / prevVol) * 100;
        
        // 检查前前一根K线和前一根K线的交易量变化
        const prevPrevVol = parseVolumeString(data.prevPrevVolume);
        const prevVolChange = ((prevVol - prevPrevVol) / prevPrevVol) * 100;

        // 如果当前K线相比前一根K线的交易量增加超过阈值
        if (currentVolChange > VOLUME_ALERT_THRESHOLD) {
          const alertData = {
            symbol: coin.symbol,
            timeframe,
            stage: 'current' as const,
            volumeChange: currentVolChange,
            priceChange: data.change
          };
          
          const signature = createAlertSignature(alertData);
          
          if (!existingSignatures.has(signature)) {
            existingSignatures.add(signature);
            newAlerts.push({
              id: `${signature}-${Date.now()}`,
              ...alertData,
              timestamp: new Date()
            });
          }
        }

        // 如果前一根K线相比前前一根K线的交易量增加超过阈值
        if (prevVolChange > VOLUME_ALERT_THRESHOLD) {
          const alertData = {
            symbol: coin.symbol,
            timeframe,
            stage: 'prev' as const,
            volumeChange: prevVolChange,
            priceChange: data.prevChange
          };
          
          const signature = createAlertSignature(alertData);
          
          if (!existingSignatures.has(signature)) {
            existingSignatures.add(signature);
            newAlerts.push({
              id: `${signature}-${Date.now()}`,
              ...alertData,
              timestamp: new Date()
            });
          }
        }
      });
    });

    // 只在有新警报时更新状态
    if (newAlerts.length > 0) {
      setAlerts(prev => {
        // 创建一个新的警报数组，确保没有重复
        const uniqueAlerts = [...newAlerts, ...prev];
        const seen = new Set();
        const deduped = uniqueAlerts.filter(alert => {
          const signature = createAlertSignature(alert);
          if (seen.has(signature)) {
            return false;
          }
          seen.add(signature);
          return true;
        });
        
        return deduped.slice(0, MAX_ALERTS);
      });
    }
  }, [alerts]);

  // 2. 然后定义 fetchBinanceData
  const fetchBinanceData = async (symbol: string): Promise<CoinData> => {
    try {
      const [priceResponse, ...klineResponses] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`),
        ...Object.entries(TIMEFRAMES).map(([_, interval]) =>
          fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=3`)
        )
      ]);

      const priceData = await priceResponse.json();
      const klineResults = await Promise.all(klineResponses.map(r => r.json()));

      // 处理K线数据
      const klines = Object.fromEntries(
        Object.keys(TIMEFRAMES).map((timeframe, index) => {
          const klineData = klineResults[index];
          if (klineData.length < 3) {
            throw new Error(`无法获取${symbol}的${timeframe}数据`);
          }

          const [prevPrevKline, prevKline, currentKline] = klineData;
          const calculateChange = (kline: any[]) => {
            const openPrice = parseFloat(kline[1]);
            const closePrice = parseFloat(kline[4]);
            // 使用更精确的计算方式
            const change = ((closePrice - openPrice) / openPrice) * 100;
            // 根据数值大小返回不同精度
            if (Math.abs(change) < 0.001) {
              return parseFloat(change.toFixed(6));
            } else if (Math.abs(change) < 0.01) {
              return parseFloat(change.toFixed(4));
            } else if (Math.abs(change) < 0.1) {
              return parseFloat(change.toFixed(3));
            } else {
              return parseFloat(change.toFixed(2));
            }
          };

          return [timeframe, {
            change: calculateChange(currentKline),
            volume: formatVolume(currentKline[5]),
            prevChange: calculateChange(prevKline),
            prevVolume: formatVolume(prevKline[5]),
            prevPrevChange: calculateChange(prevPrevKline),
            prevPrevVolume: formatVolume(prevPrevKline[5])
          }];
        })
      );
      
      return {
        symbol,
        name: symbol,
        price: formatPrice(parseFloat(priceData.price), symbol),
        klines: klines as CoinData['klines']
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      throw error;
    }
  };

  // 3. 再定义 fetchData
  const fetchData = useCallback(async (showRefreshAnimation = false) => {
    if (showRefreshAnimation) {
      setIsRefreshing(true);
    }
    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => fetchBinanceData(symbol))
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
  }, [symbols, checkForAlerts]);

  // 4. 最后定义 handleSaveSymbols
  const handleSaveSymbols = useCallback((newSymbols: string[]) => {
    setSymbols(newSymbols);
    fetchData(true);
    localStorage.setItem('watchlist_symbols', JSON.stringify(newSymbols));
  }, [fetchData]);

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
  const formatPrice = (price: number, symbol: string) => {
    // 特殊处理 BONK 等小值币种
    if (price < 0.0001) {
      return price.toFixed(8);
    } else if (price < 0.01) {
      return price.toFixed(6);
    } else if (price < 1) {
      return price.toFixed(4);
    } else {
      return price.toFixed(2);
    }
  };

  return (
    <WalletProvider>
      <main className="flex flex-row h-screen w-full overflow-hidden bg-black text-green-500" style={matrixBg}>
        {/* 左侧区域 - 推特内容 */}
        <div className="w-1/4 border-r border-green-900/30 backdrop-blur-sm">
          <div className="p-4 border-b border-green-900/30">
            <h2 className="text-green-400 text-xl font-mono">推特监控</h2>
          </div>
          {/* 这里可以添加推特内容的组件 */}
        </div>

        {/* 中间区域 */}
        <div className="w-2/4 flex flex-col backdrop-blur-sm">
          {/* 警报区域 */}
          <div className="border-b border-green-900/30">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-green-400 text-sm font-mono">交易量警报</h3>
                <div className="flex items-center gap-3">
                  <span className="text-green-600 text-sm font-mono">
                    {lastUpdated && `最后更新: ${lastUpdated.toLocaleTimeString()}`}
                  </span>
                  <CurrencySettings 
                    symbols={symbols}
                    onSave={handleSaveSymbols}
                  />
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className={`p-2 rounded-lg bg-green-900/20 text-green-400 hover:bg-green-800/30 
                      transition-all ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <IoRefreshOutline className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {alerts.length === 0 ? (
                  <div className="text-gray-500 text-sm">暂无警报</div>
                ) : (
                  alerts.slice(0, 5).map(alert => (
                    <div 
                      key={alert.id} 
                      className="text-sm flex items-center justify-between bg-gray-750/50 rounded p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{alert.symbol}</span>
                        <span className="text-gray-400">{alert.timeframe}级别</span>
                        <span className="text-gray-400">
                          {alert.stage === 'prev' ? '前一根' : '当前'}K线
                        </span>
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
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-green-900/10 scrollbar-thumb-green-900/30">
            {/* 表头 */}
            <div className="sticky top-0 z-10 backdrop-blur-sm border-b border-green-900/30">
              <div className="px-4">
                <div className="bg-green-900/20 rounded-t p-3">
                  <div className="grid grid-cols-3 divide-x divide-green-900/30">
                    {['15分钟', '4小时', '24小时'].map((time) => (
                      <div key={time} className="px-3">
                        <div className="text-center">
                          <span className="text-sm font-mono text-green-400">{time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 币种数据表格 */}
            <div className="p-4 space-y-3">
              {isLoading ? (
                [...Array(10)].map((_, index) => (
                  <div key={index} className="bg-gray-800 p-3 rounded animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-6 w-14 bg-gray-700 rounded"></div>
                      <div className="h-6 w-20 bg-gray-700 rounded"></div>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-gray-700">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="px-3">
                          <div className="h-20 bg-gray-700 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                coinData.map(data => (
                  <div 
                    key={data.symbol} 
                    className={`bg-green-900/10 p-3 rounded hover:bg-green-900/20 
                      transition-all border border-green-900/30 backdrop-blur-sm`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg font-bold font-mono text-blue-400">{data.symbol}</span>
                      <span className="text-blue-500 font-mono">${data.price}</span>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-gray-700">
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
        <div className="w-1/4 border-l border-green-900/30 backdrop-blur-sm">
          <div className="p-4 border-b border-green-900/30 flex justify-between items-center">
            <h2 className="text-green-400 text-xl font-mono">钱包监控</h2>
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className={`px-3 py-1.5 bg-green-900/20 text-green-400 rounded-lg hover:bg-green-800/30 transition-all border border-green-900/30 font-mono`}
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

      {/* 添加全局样式 */}
      <style jsx global>{`
        @keyframes matrix-bg {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }

        /* 添加字体发光效果 */
        .text-glow {
          text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
        }

        /* 添加边框发光效果 */
        .border-glow {
          box-shadow: 0 0 10px rgba(74, 222, 128, 0.2);
        }
      `}</style>
    </WalletProvider>
  );
} 