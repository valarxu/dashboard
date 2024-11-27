'use client';
import React from 'react';
import { useWalletContext } from '../contexts/WalletContext';

interface WalletMonitorProps {
  isModalOpen: boolean;
}

const WalletMonitor: React.FC<WalletMonitorProps> = ({ isModalOpen: parentModalOpen }) => {
  const { notifications, monitoringStatus } = useWalletContext();
  
  // 格式化地址显示
  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {notifications.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            暂无活动记录
          </div>
        ) : (
          notifications.map((notification) => (
            <div 
              key={notification.id}
              className="bg-gray-800/50 rounded-lg p-3 text-sm border border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-200 font-medium">
                  {formatAddress(notification.walletAddress)}
                </span>
                <span className="text-gray-400 text-xs">
                  {notification.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="text-gray-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">发送方:</span>
                  <span className="text-gray-200">{notification.details.fromAddress}</span>
                </div>
                {notification.details.fromToken && (
                  <div className="text-xs text-gray-400">
                    发送: {notification.details.fromToken.amount} {notification.details.fromToken.symbol}
                  </div>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gray-400 text-xs">接收方:</span>
                  <span className="text-gray-200">{notification.details.toAddress}</span>
                </div>
                {notification.details.toToken && (
                  <div className="text-xs text-gray-400">
                    接收: {notification.details.toToken.amount} {notification.details.toToken.symbol}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WalletMonitor; 