import React, { useState } from 'react';
import { useWalletContext } from '../contexts/WalletContext';

const WalletList = () => {
  const { wallets, handleDeleteWallet, handleUpdateNote, monitoringStatus, toggleMonitoring } = useWalletContext();
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [pendingMonitoring, setPendingMonitoring] = useState<string | null>(null);
  const [connectingWallets, setConnectingWallets] = useState<Set<string>>(new Set());

  const handleToggleMonitoring = async (address: string) => {
    if (pendingMonitoring === address || connectingWallets.has(address)) return; // 防止重复点击
    
    setPendingMonitoring(address);
    if (!monitoringStatus[address]) {
      // 开始连接时添加到连接中状态
      setConnectingWallets(prev => new Set(prev).add(address));
    }

    try {
      await toggleMonitoring(address);
      // 等待一段时间后再移除连接状态，以确保 WebSocket 完全建立
      if (!monitoringStatus[address]) {
        setTimeout(() => {
          setConnectingWallets(prev => {
            const next = new Set(prev);
            next.delete(address);
            return next;
          });
        }, 2000); // 等待2秒
      }
    } finally {
      setPendingMonitoring(null);
    }
  };

  const getMonitoringStatus = (address: string) => {
    if (pendingMonitoring === address) return 'pending';
    if (connectingWallets.has(address)) return 'connecting';
    return monitoringStatus[address] ? 'monitoring' : 'idle';
  };

  const getButtonStyles = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-600 text-gray-400 cursor-wait opacity-50';
      case 'connecting':
        return 'bg-blue-500/10 text-blue-500 cursor-wait';
      case 'monitoring':
        return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
      default:
        return 'bg-gray-600 text-gray-400 hover:bg-gray-500';
    }
  };

  const getButtonContent = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <>
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
            <span>处理中...</span>
          </>
        );
      case 'connecting':
        return (
          <>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span>连接中...</span>
          </>
        );
      case 'monitoring':
        return '监听中';
      default:
        return '未监听';
    }
  };

  return (
    <div className="space-y-2">
      {wallets.length === 0 ? (
        <div className="text-gray-500 text-center py-4">暂无监控钱包</div>
      ) : (
        wallets.map((wallet) => (
          <div key={wallet.address} className="bg-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <div className="text-white font-medium">
                  {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
                </div>
                {editingNote === wallet.address ? (
                  <input
                    type="text"
                    defaultValue={wallet.note}
                    autoFocus
                    className="mt-1 w-full px-2 py-1 bg-gray-600 rounded text-sm text-gray-200 
                      focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onBlur={(e) => {
                      handleUpdateNote(wallet.address, e.target.value);
                      setEditingNote(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUpdateNote(wallet.address, e.currentTarget.value);
                        setEditingNote(null);
                      }
                      if (e.key === 'Escape') {
                        setEditingNote(null);
                      }
                    }}
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
                <button
                  onClick={() => handleToggleMonitoring(wallet.address)}
                  disabled={pendingMonitoring === wallet.address || connectingWallets.has(wallet.address)}
                  className={`p-1.5 rounded transition-all duration-200 min-w-[80px] ${
                    getButtonStyles(getMonitoringStatus(wallet.address))
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {getButtonContent(getMonitoringStatus(wallet.address))}
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteWallet(wallet.address)}
                  className="text-red-400 hover:text-red-300"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default WalletList; 