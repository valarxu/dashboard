import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { openDB } from 'idb';
import { Connection, PublicKey } from '@solana/web3.js';

interface Wallet {
  address: string;
  note?: string;
  lastQueried?: number;
  isLoading?: boolean;
  isMonitoring?: boolean;
  tokens?: {
    symbol: string;
    amount: string;
    value: string;
  }[];
}

interface WalletNotification {
  id: string;
  walletAddress: string;
  type: string;
  details: any;
  timestamp: Date;
}

interface WalletContextType {
  wallets: Wallet[];
  monitoringStatus: Record<string, boolean>;
  handleDeleteWallet: (address: string) => void;
  handleUpdateNote: (address: string, note: string) => void;
  toggleMonitoring: (address: string) => Promise<void>;
  addWallet: (address: string) => Promise<void>;
  notifications: WalletNotification[];
  addNotification: (notification: WalletNotification) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [monitoringStatus, setMonitoringStatus] = useState<Record<string, boolean>>({});
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  const processedSignatures = useRef<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<WalletNotification[]>([]);
  const monitoringTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const MONITORING_TIMEOUT = 4 * 60 * 60 * 1000; // 4小时的监听时间限制

  // 初始化时从 IndexedDB 加载钱包
  useEffect(() => {
    const loadWallets = async () => {
      const db = await openDB('wallet-monitor', 2);
      const savedWallets = await db.getAll('wallets');
      setWallets(savedWallets);
      
      // 自动为所有钱包开启监听
      savedWallets.forEach(wallet => {
        startWalletMonitoring(wallet.address);
      });
    };
    loadWallets();

    // 清理函数
    return () => {
      wsRefs.current.forEach(ws => ws.close());
      wsRefs.current.clear();
      processedSignatures.current.clear();
      // 清除所有定时器
      monitoringTimers.current.forEach(timer => clearTimeout(timer));
      monitoringTimers.current.clear();
    };
  }, []);

  const startWalletMonitoring = (address: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 如果已经在监听，就不要重复创建连接
      if (wsRefs.current.has(address)) {
        resolve();
        return;
      }

      const HELIUS_API_KEY = 'c69b9774-3a39-486c-9b7b-06b979e09115';
      const ws = new WebSocket(`wss://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`);

      ws.onopen = () => {
        console.log(`WebSocket连接已建立: ${address}`);
        setMonitoringStatus(prev => ({ ...prev, [address]: true }));
        
        // 设置监听时间限制
        const timer = setTimeout(() => {
          console.log(`监听时间到期，自动关闭连接: ${address}`);
          ws.close();
          wsRefs.current.delete(address);
          setMonitoringStatus(prev => ({ ...prev, [address]: false }));
          monitoringTimers.current.delete(address);
        }, MONITORING_TIMEOUT);

        monitoringTimers.current.set(address, timer);
        
        const subscribeMessage = {
          jsonrpc: '2.0',
          id: 1,
          method: 'accountSubscribe',
          params: [
            address,
            {
              encoding: 'jsonParsed',
              commitment: 'finalized',
            }
          ]
        };
        ws.send(JSON.stringify(subscribeMessage));
        resolve(); // WebSocket 连接成功时 resolve
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.result !== undefined) return;

          if (data.method === 'accountNotification') {
            console.log(`收到钱包 ${address} 的活动通知:`, data);
            
            // 处理通知并添加到状态中
            const notification: WalletNotification = {
              id: Date.now().toString(),
              walletAddress: address,
              type: 'transfer',
              details: {
                fromAddress: 'Unknown',
                toAddress: 'Unknown',
                // ... 其他详细信息
              },
              timestamp: new Date(),
            };

            addNotification(notification);
          }
        } catch (err) {
          console.error('处理WebSocket消息时出错:', err);
        }
      };

      ws.onerror = (error) => {
        console.error(`WebSocket错误 (${address}):`, error);
        reject(error); // WebSocket 连接失败时 reject
      };

      ws.onclose = () => {
        console.log(`WebSocket连接已关闭 (${address})`);
        wsRefs.current.delete(address);
        setMonitoringStatus(prev => ({ ...prev, [address]: false }));
        
        // 清除定时器
        const timer = monitoringTimers.current.get(address);
        if (timer) {
          clearTimeout(timer);
          monitoringTimers.current.delete(address);
        }
      };

      wsRefs.current.set(address, ws);
    });
  };

  const addWallet = async (address: string) => {
    if (wallets.some(w => w.address === address)) {
      throw new Error('钱包已存在');
    }

    const newWallet: Wallet = {
      address,
      isMonitoring: false,
    };

    setWallets(prev => [...prev, newWallet]);

    // 保存到 IndexedDB
    const db = await openDB('wallet-monitor', 2);
    await db.put('wallets', newWallet);

    // 自动开启监听
    startWalletMonitoring(address);
  };

  const handleDeleteWallet = async (address: string) => {
    // 关闭 WebSocket 连接
    const ws = wsRefs.current.get(address);
    if (ws) {
      ws.close();
      wsRefs.current.delete(address);
    }

    setWallets(prev => prev.filter(w => w.address !== address));
    setMonitoringStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[address];
      return newStatus;
    });

    // 从 IndexedDB 删除
    const db = await openDB('wallet-monitor', 2);
    await db.delete('wallets', address);
  };

  const handleUpdateNote = async (address: string, note: string) => {
    const updatedWallets = wallets.map(w => 
      w.address === address ? { ...w, note } : w
    );
    setWallets(updatedWallets);

    // 更新 IndexedDB
    const db = await openDB('wallet-monitor', 2);
    const wallet = updatedWallets.find(w => w.address === address);
    if (wallet) {
      await db.put('wallets', wallet);
    }
  };

  const toggleMonitoring = async (address: string): Promise<void> => {
    if (monitoringStatus[address]) {
      // 关闭监听
      const ws = wsRefs.current.get(address);
      if (ws) {
        ws.close();
        wsRefs.current.delete(address);
        setMonitoringStatus(prev => ({ ...prev, [address]: false }));
        
        // 清除定时器
        const timer = monitoringTimers.current.get(address);
        if (timer) {
          clearTimeout(timer);
          monitoringTimers.current.delete(address);
        }
      }
    } else {
      // 开启监听
      await startWalletMonitoring(address);
    }
  };

  const addNotification = (notification: WalletNotification) => {
    setNotifications(prev => [notification, ...prev].slice(0, 10));
  };

  const value = {
    wallets,
    monitoringStatus,
    handleDeleteWallet,
    handleUpdateNote,
    toggleMonitoring,
    addWallet,
    notifications,
    addNotification,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
}; 