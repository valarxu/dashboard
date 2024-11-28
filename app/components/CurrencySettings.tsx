import React, { useState } from 'react';
import { IoSettingsOutline, IoAddOutline, IoTrashOutline } from 'react-icons/io5';

interface CurrencySettingsProps {
  symbols: string[];
  onSave: (symbols: string[]) => void;
}

const CurrencySettings: React.FC<CurrencySettingsProps> = ({ symbols: initialSymbols, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [newSymbol, setNewSymbol] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddSymbol = () => {
    setError(null);
    const symbol = newSymbol.trim().toUpperCase();
    
    if (!symbol) {
      setError('请输入货币符号');
      return;
    }
    
    if (symbols.includes(symbol)) {
      setError('该货币已存在');
      return;
    }

    setSymbols([...symbols, symbol]);
    setNewSymbol('');
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    setSymbols(symbols.filter(s => s !== symbolToRemove));
  };

  const handleSave = () => {
    onSave(symbols);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="p-2 rounded-lg bg-green-900/20 text-green-400 hover:bg-green-800/30 
          transition-all border border-green-900/30"
      >
        <IoSettingsOutline className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg w-full max-w-md mx-4 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-green-400 font-mono">货币设置</h2>
          <button
            onClick={() => setIsEditing(false)}
            className="text-gray-400 hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* 添加新货币 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="输入货币符号 (如: BTC)"
              className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 
                focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={handleAddSymbol}
              className="p-2 bg-green-900/20 text-green-400 rounded-lg hover:bg-green-800/30 
                transition-all border border-green-900/30"
            >
              <IoAddOutline className="w-5 h-5" />
            </button>
          </div>
          {error && <div className="text-red-500 text-sm">{error}</div>}

          {/* 货币列表 */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {symbols.map((symbol) => (
              <div
                key={symbol}
                className="flex items-center justify-between p-2 bg-gray-700 rounded-lg"
              >
                <span className="text-white font-mono">{symbol}</span>
                <button
                  onClick={() => handleRemoveSymbol(symbol)}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <IoTrashOutline className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 
              transition-colors font-mono"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};

export default CurrencySettings; 