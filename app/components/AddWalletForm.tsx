import React, { useState } from 'react';
import { useWalletContext } from '../contexts/WalletContext';

const AddWalletForm = () => {
  const [newAddress, setNewAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { addWallet } = useWalletContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (!newAddress || newAddress.length < 32) {
        throw new Error('请输入有效的SOL钱包地址');
      }
      await addWallet(newAddress);
      setNewAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加钱包失败');
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-gray-200 font-medium">添加新钱包</h3>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          placeholder="输入SOL钱包地址"
          className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <button
          type="submit"
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          添加钱包
        </button>
      </form>
    </div>
  );
};

export default AddWalletForm; 