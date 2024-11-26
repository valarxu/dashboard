'use client';
import React, { useState, useEffect, useRef } from 'react';
import { IoTrashOutline, IoCopyOutline, IoCheckmarkOutline, IoEyeOutline, IoEyeOffOutline } from 'react-icons/io5';
import { openDB, IDBPDatabase } from 'idb';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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

interface TokenData {
  address: string;  // 钱包地址
  symbol: string;
  amount: string;
  value: string;
  timestamp: number;
}

// 添加代币符号映射接口
interface TokenInfo {
  symbol: string;
  address: string;
}

// 添加代币列表存储相关的接口
interface TokenListMetadata {
  lastUpdated: number;
  version: number;
}

// 修改通知接口
interface WalletNotification {
  id: string;
  walletAddress: string;
  type: 'transfer' | 'unknown';
  details: {
    fromAddress: string;
    toAddress: string;
    fromToken?: {
      symbol: string;
      amount: string;
    };
    toToken?: {
      symbol: string;
      amount: string;
    };
  };
  timestamp: Date;
}

// 添加 Modal 组件
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[480px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-gray-200 font-medium">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

const WalletMonitor: React.FC = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [tokenData, setTokenData] = useState<Record<string, TokenData[]>>({});
  const [db, setDB] = useState<IDBPDatabase | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tokenList, setTokenList] = useState<Record<string, TokenInfo>>({});
  const [notifications, setNotifications] = useState<WalletNotification[]>([]);
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  const [monitoringStatus, setMonitoringStatus] = useState<Record<string, boolean>>({});
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 添加一个 Set 来存储已处理的交易签名
  const processedSignatures = useRef<Set<string>>(new Set());

  // 初始化 IndexedDB
  useEffect(() => {
    const initDatabase = async () => {
      const database = await openDB('wallet-monitor', 2, { // 增加版本
        upgrade(db, oldVersion, newVersion, transaction) {
          // 原有的存储保持不变
          if (!db.objectStoreNames.contains('wallets')) {
            db.createObjectStore('wallets', { keyPath: 'address' });
          }
          if (!db.objectStoreNames.contains('tokens')) {
            const tokenStore = db.createObjectStore('tokens', { 
              keyPath: ['address', 'symbol'] 
            });
            tokenStore.createIndex('by-address', 'address');
            tokenStore.createIndex('by-timestamp', 'timestamp');
          }

          // 添加代币列表存储
          if (!db.objectStoreNames.contains('tokenList')) {
            const tokenListStore = db.createObjectStore('tokenList', { keyPath: 'address' });
            tokenListStore.createIndex('by-symbol', 'symbol');
          }

          // 添加元数据存储
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'key' });
          }
        },
      });
      setDB(database);
      
      // 加载已保存的钱包
      const savedWallets = await database.getAll('wallets');
      setWallets(savedWallets);

      // 加载代币列表
      await loadTokenList(database);
    };

    initDatabase();
  }, []);

  // 加载代币列表
  const loadTokenList = async (database: IDBPDatabase) => {
    try {
      // 获取元数据
      const metadata = await database.get('metadata', 'tokenList') as TokenListMetadata | undefined;
      const currentTime = Date.now();
      
      // 如果没有元数据或数据过期（24小时），则重新获取完整列表
      if (!metadata || (currentTime - metadata.lastUpdated) > 24 * 60 * 60 * 1000) {
        await fetchFullTokenList(database);
        return;
      }

      // 加载缓存的代币列表
      const cachedTokens = await database.getAll('tokenList');
      const tokenMap: Record<string, TokenInfo> = {};
      cachedTokens.forEach(token => {
        tokenMap[token.address] = token;
      });
      setTokenList(tokenMap);

      // 后台更新代币列表
      fetchIncrementalUpdate(database, metadata.version);
    } catch (err) {
      console.error('Error loading token list:', err);
    }
  };

  // 获取完整的代币列表
  const fetchFullTokenList = async (database: IDBPDatabase) => {
    try {
      console.log('获取完整代币列表...');
      const response = await fetch('https://token.jup.ag/all');
      const data = await response.json();

      // 开始事务
      const tx = database.transaction(['tokenList', 'metadata'], 'readwrite');
      
      // 清除旧数据
      await tx.objectStore('tokenList').clear();

      // 创建地址到符号的映射
      const tokenMap: Record<string, TokenInfo> = {};
      
      // 保存新数据
      for (const token of data) {
        // 使用原始地址作为键
        tokenMap[token.address] = {
          symbol: token.symbol,
          address: token.address,
        };
        
        // 同时保存小写版本
        tokenMap[token.address.toLowerCase()] = {
          symbol: token.symbol,
          address: token.address,
        };

        await tx.objectStore('tokenList').put({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
        });
      }

      // 更新元数据
      await tx.objectStore('metadata').put({
        key: 'tokenList',
        lastUpdated: Date.now(),
        version: Date.now(),
      });

      // 提交事务
      await tx.done;

      // 更新状态
      setTokenList(tokenMap);
      console.log('代币列表更新完成，共加载', Object.keys(tokenMap).length / 2, '个代币');

    } catch (err) {
      console.error('Error fetching full token list:', err);
    }
  };

  // 增量更新代币列表
  const fetchIncrementalUpdate = async (database: IDBPDatabase, lastVersion: number) => {
    try {
      console.log('检查代币列表更新...');
      // 这里可以实现检查更新的逻辑
      // 实际项目中可能需要调用特定的API来获取更新
      
      // 示例：每天更新一次完整列表
      const currentTime = Date.now();
      if (currentTime - lastVersion > 24 * 60 * 60 * 1000) {
        await fetchFullTokenList(database);
      }
    } catch (err) {
      console.error('Error updating token list:', err);
    }
  };

  // 保存钱包信息
  const saveWallet = async (wallet: Wallet) => {
    if (!db) return;
    await db.put('wallets', wallet);
    
    // 同时保存到 localStorage 作为备份
    const basicData = {
      address: wallet.address,
      note: wallet.note
    };
    localStorage.setItem(`wallet_${wallet.address}`, JSON.stringify(basicData));
  };

  // 保存代币数据
  const saveTokenData = async (address: string, tokens: TokenData[]) => {
    if (!db) return;
    const tx = db.transaction('tokens', 'readwrite');
    
    // 删旧数据
    const index = tx.store.index('by-address');
    const oldTokens = await index.getAllKeys(address);
    for (const key of oldTokens) {
      await tx.store.delete(key);
    }
    
    // 添加新数据
    for (const token of tokens) {
      await tx.store.put({
        ...token,
        address,
        timestamp: Date.now()
      });
    }
  };

  // 获取代币数据
  const getTokenData = async (address: string) => {
    if (!db) return null;
    
    const index = db.transaction('tokens').store.index('by-address');
    const tokens = await index.getAll(address);
    
    // 如果数据超过10分钟，则返回 null
    const isExpired = tokens.some(t => 
      Date.now() - t.timestamp > 10 * 60 * 1000
    );
    
    return isExpired ? null : tokens;
  };

  // 清理旧数据
  const cleanupOldData = async () => {
    if (!db) return;
    
    const tx = db.transaction('tokens', 'readwrite');
    const index = tx.store.index('by-timestamp');
    const oldTokens = await index.getAllKeys(IDBKeyRange.upperBound(
      Date.now() - 7 * 24 * 60 * 60 * 1000  // 7天前的数据
    ));
    
    for (const key of oldTokens) {
      await tx.store.delete(key);
    }
  };

  // 格式化地址显示
  const formatAddress = (address: string | undefined) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // 复制地址
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    setTimeout(() => setCopied(null), 2000);
  };

  // 添加新钱包
  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newAddress || newAddress.length < 32) {
      setError('请输入有效的SOL钱包地址');
      return;
    }

    if (wallets.some(w => w.address === newAddress)) {
      setError('该钱包已在监控列表中');
      return;
    }

    const newWallet = { address: newAddress };
    setWallets(prev => [...prev, newWallet]);
    setNewAddress('');
    setError(null);

    // 保存到数据库
    await saveWallet(newWallet);

    // 开始监听新钱包
    startWalletMonitoring(newAddress);
  };

  // 添加钱包监听函数
  const startWalletMonitoring = (address: string) => {
    const HELIUS_API_KEY = 'c69b9774-3a39-486c-9b7b-06b979e09115';
    const ws = new WebSocket(`wss://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`);

    ws.onopen = () => {
      console.log(`WebSocket连接已建立: ${address}`);
      setMonitoringStatus(prev => ({ ...prev, [address]: true }));
      
      // 使用 accountSubscribe
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
      console.log('发送订阅消息:', subscribeMessage);
      ws.send(JSON.stringify(subscribeMessage));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 处理订阅确认消息
        if (data.result !== undefined) return;

        // 处理通知消息
        if (data.method === 'accountNotification') {
          const accountInfo = data.params?.result?.value;
          if (accountInfo) {
            try {
              const connection = new Connection(
                `https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`
              );

              // 获取最近的交易
              const signatures = await connection.getSignaturesForAddress(
                new PublicKey(address),
                { limit: 1 }
              );

              if (signatures.length > 0) {
                const signature = signatures[0].signature;
                
                // 检查是否已经处理过这个交易
                if (processedSignatures.current.has(signature)) {
                  return;
                }
                
                // 添加到已处理集合
                processedSignatures.current.add(signature);
                
                // 限制已处理签名的数量，防止内存泄漏
                if (processedSignatures.current.size > 100) {
                  const oldestSignature = Array.from(processedSignatures.current)[0];
                  processedSignatures.current.delete(oldestSignature);
                }

                const response = await fetch(
                  `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactions: [signature] })
                  }
                );

                const txDetails = await response.json();
                console.log('解析到的交易详情:', txDetails);

                if (txDetails && txDetails[0]) {
                  const tx = txDetails[0];
                  console.log('交易类型:', tx.type);
                  console.log('交易描述:', tx.description);
                  
                  // 检查是否是 Jupiter swap 交易
                  const isJupiterSwap = tx.instructions.some((ix: any) => 
                    ix.programId === "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB" || // Jupiter v6
                    ix.programId === "JUP6LkbZbjS1jKKwapdHF3G3KYoFeJqGJxKJqhXqP9b"    // Jupiter v4
                  );

                  if (isJupiterSwap) {
                    // 获取下一个交易的详情，因为 Jupiter 的 swap 通常分为两个交易
                    const nextSignature = (await connection.getSignaturesForAddress(
                      new PublicKey(address),
                      { limit: 2 }
                    ))[1]?.signature;

                    if (nextSignature) {
                      const nextTxResponse = await fetch(
                        `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ transactions: [nextSignature] })
                        }
                      );
                      const nextTxDetails = await nextTxResponse.json();
                      
                      if (nextTxDetails && nextTxDetails[0]) {
                        const nextTx = nextTxDetails[0];
                        
                        // 合并两个交易的 token 变化
                        let fromToken, toToken;
                        
                        // 解析账户数据变化
                        [...tx.accountData, ...(nextTx.accountData || [])].forEach(account => {
                          if (account.tokenBalanceChanges) {
                            account.tokenBalanceChanges.forEach(change => {
                              const amount = Math.abs(parseFloat(change.rawTokenAmount.tokenAmount));
                              if (change.rawTokenAmount.tokenAmount.startsWith('-')) {
                                fromToken = {
                                  symbol: change.symbol || 'SOL',
                                  amount: amount.toString()
                                };
                              } else {
                                toToken = {
                                  symbol: change.symbol || 'USDC',
                                  amount: amount.toString()
                                };
                              }
                            });
                          }
                          
                          // 处理 SOL 转账
                          if (account.nativeBalanceChange) {
                            const solAmount = Math.abs(account.nativeBalanceChange) / 1e9;
                            if (account.nativeBalanceChange < 0 && solAmount > 0.01) { // 忽略小额手续费
                              fromToken = {
                                symbol: 'SOL',
                                amount: solAmount.toFixed(4)
                              };
                            }
                          }
                        });

                        // 创建 swap 通知
                        const notification: WalletNotification = {
                          id: Date.now().toString(),
                          walletAddress: address,
                          type: 'transfer',
                          details: {
                            fromAddress: formatAddress(tx.sourceAddress || address),
                            toAddress: formatAddress(tx.destinationAddress || 'Jupiter'),
                            fromToken,
                            toToken
                          },
                          timestamp: new Date(),
                        };

                        console.log('创建 Jupiter swap 通知:', notification);
                        setNotifications(prev => [notification, ...prev].slice(0, 10));
                        return;
                      }
                    }
                  }

                  // 解析账户数据变化
                  let fromToken, toToken;
                  
                  if (tx.accountData) {
                    console.log('账户数据变化:', tx.accountData);
                    tx.accountData.forEach(account => {
                      if (account.tokenBalanceChanges) {
                        account.tokenBalanceChanges.forEach(change => {
                          const amount = Math.abs(parseFloat(change.rawTokenAmount.tokenAmount));
                          if (change.rawTokenAmount.tokenAmount.startsWith('-')) {
                            // 代币减少的是发送方
                            fromToken = {
                              symbol: change.symbol || change.mint.slice(0, 8),
                              amount: amount.toString()
                            };
                          } else {
                            // 代币增加的是接收方
                            toToken = {
                              symbol: change.symbol || change.mint.slice(0, 8),
                              amount: amount.toString()
                            };
                          }
                        });
                      }
                      
                      // 处理 SOL 转账
                      if (account.nativeBalanceChange) {
                        const solAmount = Math.abs(account.nativeBalanceChange) / 1e9;
                        if (account.nativeBalanceChange < 0) {
                          fromToken = {
                            symbol: 'SOL',
                            amount: solAmount < 0.001 
                              ? solAmount.toFixed(9)  // 非常小的金额显示9位小数
                              : solAmount < 1 
                                ? solAmount.toFixed(4) // 小于1的金额显示4位小数
                                : solAmount.toFixed(2)  // 大于1的金额显示2位小数
                          };
                        } else if (account.nativeBalanceChange > 0) {
                          toToken = {
                            symbol: 'SOL',
                            amount: solAmount < 0.001 
                              ? solAmount.toFixed(9)
                              : solAmount < 1 
                                ? solAmount.toFixed(4)
                                : solAmount.toFixed(2)
                          };
                        }
                      }
                    });
                  }

                  // 创建通知
                  const notification: WalletNotification = {
                    id: Date.now().toString(),
                    walletAddress: address,
                    type: 'transfer',
                    details: {
                      fromAddress: formatAddress(tx.sourceAddress || tx.accountData?.[0]?.account),
                      toAddress: formatAddress(tx.destinationAddress || tx.accountData?.[1]?.account),
                      fromToken,
                      toToken
                    },
                    timestamp: new Date(),
                  };

                  console.log('创建新通知:', notification);
                  // 更新通知列表
                  setNotifications(prev => [notification, ...prev].slice(0, 10));
                }
              }
            } catch (err) {
              console.error('获取交易详情失败:', err);
            }
          }
        }
      } catch (err) {
        console.error('处理WebSocket消息时出错:', err);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket错误 (${address}):`, error);
    };

    ws.onclose = (event) => {
      console.log(`WebSocket连接已关闭 (${address}):`, event.code, event.reason);
      wsRefs.current.delete(address);
      setMonitoringStatus(prev => ({ ...prev, [address]: false }));
    };

    // 保存WebSocket引用
    wsRefs.current.set(address, ws);
    return ws;
  };

  // 在组件卸载时清理WebSocket连接
  useEffect(() => {
    return () => {
      // 关闭所有 WebSocket 连接
      wsRefs.current.forEach((ws, address) => {
        ws.close();
      });
      wsRefs.current.clear();
      // 清理已处理的签名集合
      processedSignatures.current.clear();
    };
  }, []);

  // 删除钱包
  const handleDeleteWallet = async (address: string) => {
    setWallets(prev => prev.filter(w => w.address !== address));
    
    // 从数据库中删除
    if (db) {
      await db.delete('wallets', address);
      localStorage.removeItem(`wallet_${address}`);
    }
  };

  // 更新钱包备注
  const handleUpdateNote = async (address: string, note: string) => {
    const updatedWallets = wallets.map(w => 
      w.address === address ? { ...w, note } : w
    );
    setWallets(updatedWallets);
    setEditingNote(null);

    // 保存更新到数据库
    const updatedWallet = updatedWallets.find(w => w.address === address);
    if (updatedWallet) {
      await saveWallet(updatedWallet);
    }
  };

  // 修改 RPC 节点列表
  const RPC_ENDPOINTS = [
    'https://rpc.helius.xyz/?api-key=1aec2f9d-1111-2222-3333-444444444444', // Helius 免费节点
    'https://api.devnet.solana.com', // Solana Devnet
    'https://solana-mainnet.rpc.extrnode.com', // Extrnode
    'https://solana.public-rpc.com', // Triton
  ];

  // 修改 getWorkingConnection 函数，添加更多配置
  const getWorkingConnection = async () => {
    for (const endpoint of RPC_ENDPOINTS) {
      try {
        const connection = new Connection(endpoint, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 60000,
          disableRetryOnRateLimit: false,
        });
        
        // 测试连接
        await connection.getSlot();
        console.log('成功连接到 RPC 节点:', endpoint);
        return connection;
      } catch (err) {
        console.warn(`RPC 节点 ${endpoint} 连接失败:`, err);
        continue;
      }
    }
    throw new Error('无法连接到任何 RPC 节点');
  };

  // 修改代币格式化逻辑
  const formatTokens = (tokenAccounts: any, publicKey: PublicKey) => {
    const otherTokens = tokenAccounts.value
      .filter((account: any) => {
        const amount = account.account.data.parsed.info.tokenAmount;
        return amount.uiAmount > 0; // 只显示余额大于0的代币
      })
      .map((account: any) => {
        const tokenData = account.account.data.parsed.info;
        const mintAddress = tokenData.mint;
        
        // 打印调试信息
        console.log('Token List:', tokenList);
        console.log('Processing token mint address:', mintAddress);
        console.log('Token info from list:', tokenList[mintAddress]);
        
        // 尝试不同的地址格式
        const tokenInfo = tokenList[mintAddress] || 
                         tokenList[mintAddress.toLowerCase()] || 
                         tokenList[mintAddress.toUpperCase()];

        if (!tokenInfo) {
          console.log('未找到代币信息:', mintAddress);
        } else {
          console.log('找到代币信息:', tokenInfo);
        }
        
        return {
          address: publicKey.toString(),
          symbol: tokenInfo?.symbol || `Unknown (${mintAddress.slice(0, 6)}...)`,
          amount: tokenData.tokenAmount.uiAmount.toLocaleString(undefined, {
            maximumFractionDigits: 4
          }),
          value: '$ --',
          timestamp: Date.now()
        };
      });

    return otherTokens;
  };

  // 查询钱包代币
  const fetchWalletTokens = async (address: string) => {
    console.log('开始查询钱包:', address);
    
    setWallets(prev => prev.map(w => 
      w.address === address ? { ...w, isLoading: true } : w
    ));

    try {
      // 使用你的 Helius API key
      const HELIUS_API_KEY = 'c69b9774-3a39-486c-9b7b-06b979e09115';
      const connection = new Connection(
        `https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`,
        {
          commitment: 'confirmed',
          wsEndpoint: `wss://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`,
        }
      );

      // 验证地址格式
      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(address);
      } catch (err) {
        throw new Error('无效的钱包地址');
      }

      console.log('正在查询钱包余额...');
      // 获取 SOL 余额
      const solBalance = await connection.getBalance(publicKey);
      console.log('SOL余额:', solBalance / 1e9);

      // 获取所有代币账户
      console.log('正在查询代币账户...');
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });
      console.log('找到代币账户数量:', tokenAccounts.value.length);

      // 格式化代币数据
      let formattedTokens: TokenData[] = [
        // SOL 余额
        {
          address,
          symbol: 'SOL',
          amount: (solBalance / 1e9).toLocaleString(undefined, {
            maximumFractionDigits: 4
          }),
          value: '$ --',
          timestamp: Date.now()
        }
      ];

      // 使用新的格式化函数处理其他代币
      const otherTokens = formatTokens(tokenAccounts, publicKey);
      formattedTokens = [...formattedTokens, ...otherTokens];

      console.log('格式化后的代币数据:', formattedTokens);

      if (formattedTokens.length > 0) {
        // 更新状态
        const updatedWallet = {
          ...wallets.find(w => w.address === address)!,
          tokens: formattedTokens,
          isLoading: false
        };
        setWallets(prev => prev.map(w => 
          w.address === address ? updatedWallet : w
        ));
        
        // 打开弹窗显示结果
        setSelectedWallet(updatedWallet);
        setIsModalOpen(true);

        // 更新缓存
        await saveTokenData(address, formattedTokens);
      } else {
        throw new Error('No tokens found');
      }

    } catch (err) {
      console.error('Error fetching wallet data:', err);
      let errorMessage = '获取钱包数据失败';
      
      if (err instanceof Error) {
        if (err.message.includes('Invalid public key')) {
          errorMessage = '无效的钱包地址';
        } else if (err.message.includes('Network request failed')) {
          errorMessage = '网络请求失败，请稍后重试';
        } else if (err.message.includes('无法连接到任何 RPC 节点')) {
          errorMessage = '无法连接到 Solana 网络，请稍后重试';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setWallets(prev => prev.map(w => 
        w.address === address ? { ...w, isLoading: false } : w
      ));
    }
  };

  // 添加开启/关闭监听的函数
  const toggleMonitoring = (address: string) => {
    if (monitoringStatus[address]) {
      // 关闭监听
      const ws = wsRefs.current.get(address);
      if (ws) {
        ws.close();
        wsRefs.current.delete(address);
        setMonitoringStatus(prev => ({ ...prev, [address]: false }));
      }
    } else {
      // 开启监听
      startWalletMonitoring(address);
    }
  };

  // 修改通知显示部分
  const renderNotificationDetails = (notification: WalletNotification) => {
    const { details } = notification;
    return (
      <div className="text-gray-300 mt-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs">发送方:</span>
          <span className="text-gray-200">{details.fromAddress}</span>
        </div>
        {details.fromToken && (
          <div className="text-xs text-gray-400">
            发送: {details.fromToken.amount} {details.fromToken.symbol}
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-gray-400 text-xs">接收方:</span>
          <span className="text-gray-200">{details.toAddress}</span>
        </div>
        {details.toToken && (
          <div className="text-xs text-gray-400">
            接收: {details.toToken.amount} {details.toToken.symbol}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* 监听状态指示器 */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${Object.values(monitoringStatus).some(status => status) 
              ? 'bg-green-500 animate-pulse' 
              : 'bg-gray-500'}`} 
            />
            <span className="text-gray-300 text-sm">
              {Object.values(monitoringStatus).some(status => status) 
                ? '监听中' 
                : '未监听'}
            </span>
          </div>
          <span className="text-gray-400 text-xs">
            {Object.values(monitoringStatus).filter(status => status).length} 个钱包在线
          </span>
        </div>
      </div>

      {/* 通知区域 */}
      {notifications.length > 0 && (
        <div className="bg-gray-800 border-b border-gray-700">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-300 text-sm font-medium">钱包动态</h3>
              <span className="text-gray-400 text-xs">实时监控中</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {notifications.map((notification) => (
                <div 
                  key={notification.id}
                  className="bg-gray-750/50 rounded p-2 text-sm border border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-200 font-medium">
                      {formatAddress(notification.walletAddress)}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {notification.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  {renderNotificationDetails(notification)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-4 border-b border-gray-700">
        <form onSubmit={handleAddWallet} className="space-y-2">
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="输入SOL钱包地址"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 
              placeholder-gray-500 focus:outline-none focus:border-gray-600"
          />
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-750 text-gray-200 
              rounded transition-colors"
          >
            添加监控
          </button>
        </form>
      </div>

      {/* 修改钱包卡片，添加监听状态指示 */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:none]">
        <div className="space-y-4 p-4">
          {wallets.map((wallet) => (
            <div key={wallet.address} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {/* 监听状态指示器 */}
                    <div className={`w-2 h-2 rounded-full ${
                      monitoringStatus[wallet.address] 
                        ? 'bg-green-500 animate-pulse' 
                        : 'bg-gray-500'}`} 
                    />
                    <span className="text-gray-200 font-medium">
                      {formatAddress(wallet.address)}
                    </span>
                    <button
                      onClick={() => copyAddress(wallet.address)}
                      className="text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      {copied === wallet.address ? (
                        <IoCheckmarkOutline className="w-4 h-4" />
                      ) : (
                        <IoCopyOutline className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {editingNote === wallet.address ? (
                    <input
                      type="text"
                      defaultValue={wallet.note}
                      onBlur={(e) => handleUpdateNote(wallet.address, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateNote(wallet.address, e.currentTarget.value)}
                      className="mt-1 w-full px-2 py-1 bg-gray-700 rounded text-sm text-gray-200 
                        focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <div
                      onClick={() => setEditingNote(wallet.address)}
                      className="text-gray-400 text-sm mt-1 cursor-pointer hover:text-gray-300"
                    >
                      {wallet.note || '添加备注...'}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* 监听开关按钮 */}
                  <button
                    onClick={() => toggleMonitoring(wallet.address)}
                    className={`p-1.5 rounded-lg text-sm flex items-center gap-1 ${
                      monitoringStatus[wallet.address]
                        ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                    }`}
                    title={monitoringStatus[wallet.address] ? '关闭监听' : '开启监听'}
                  >
                    {monitoringStatus[wallet.address] ? (
                      <>
                        <IoEyeOutline className="w-5 h-5" />
                        <span className="text-xs">监听中</span>
                      </>
                    ) : (
                      <>
                        <IoEyeOffOutline className="w-5 h-5" />
                        <span className="text-xs">未监听</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => fetchWalletTokens(wallet.address)}
                    disabled={wallet.isLoading}
                    className={`px-3 py-1 rounded text-sm ${
                      wallet.isLoading 
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
                  >
                    {wallet.isLoading ? '加载中...' : '查询'}
                  </button>
                  <button
                    onClick={() => handleDeleteWallet(wallet.address)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <IoTrashOutline className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 添加代币详情弹窗 */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`钱包代币详情 - ${selectedWallet ? formatAddress(selectedWallet.address) : ''}`}
      >
        {selectedWallet?.tokens && (
          <div className="space-y-3">
            {selectedWallet.tokens.map((token) => (
              <div 
                key={token.symbol}
                className="bg-gray-750/50 rounded p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-gray-200 font-medium">{token.symbol}</div>
                  <div className="text-gray-400 text-sm mt-1">{token.amount}</div>
                </div>
                <div className="text-gray-200">{token.value}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 底部统计 */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">监控中的钱包</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-200 font-medium">{wallets.length} 个</span>
            <span className="text-gray-400">
              ({Object.values(monitoringStatus).filter(status => status).length} 个在线)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletMonitor; 