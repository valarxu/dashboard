import React from 'react';
import { KlineData } from '../types';
import { parseVolumeString } from '../utils/formatters';

interface TimeframeCellProps {
  data: KlineData;
}

const VOLUME_ALERT_THRESHOLD = 50;

const TimeframeCell = ({ data }: TimeframeCellProps) => {
  // 计算交易量变化百分比
  const currentVol = parseVolumeString(data.volume);
  const prevVol = parseVolumeString(data.prevVolume);
  const prevPrevVol = parseVolumeString(data.prevPrevVolume);
  
  const volChangePercent = ((currentVol - prevVol) / prevVol) * 100;
  const prevVolChangePercent = ((prevVol - prevPrevVol) / prevPrevVol) * 100;

  // 格式化涨跌幅，根据数值大小动态调整小数位数
  const formatChange = (change: number) => {
    if (Math.abs(change) < 0.001) {
      return change.toFixed(6);
    } else if (Math.abs(change) < 0.01) {
      return change.toFixed(4);
    } else if (Math.abs(change) < 0.1) {
      return change.toFixed(3);
    } else {
      return change.toFixed(2);
    }
  };

  const KlineBlock = ({ change, volume, className = "" }: { change: number; volume: string; className?: string }) => (
    <div className={`min-w-0 text-center ${className}`}>
      <span className={`text-base font-medium ${change > 0 ? 'text-green-500' : 'text-red-500'} block truncate`}>
        {change > 0 ? '+' : ''}{formatChange(change)}%
      </span>
      <div className="text-gray-400 text-xs leading-tight mt-0.5 truncate">
        vol: {volume}
      </div>
    </div>
  );

  const Arrow = ({ changePercent, volChangePercent }: { changePercent: number; volChangePercent: number }) => (
    <div className="flex flex-col items-center justify-center w-12 relative">
      <div className={`absolute -top-3 ${changePercent > 0 ? 'text-green-500' : 'text-red-500'} text-sm font-medium whitespace-nowrap`}>
        {changePercent > 0 ? '+' : ''}{formatChange(changePercent)}%
      </div>
      <span className={`text-lg ${changePercent > 0 ? 'text-green-500' : 'text-red-500'}`}>
        →
      </span>
      {volChangePercent > VOLUME_ALERT_THRESHOLD && (
        <div className="absolute -bottom-3 text-green-500 text-sm whitespace-nowrap">
          +{formatChange(volChangePercent)}%
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-gray-800/50 rounded-sm p-2 text-sm h-full">
      <div className="flex items-center justify-between gap-1">
        <KlineBlock 
          change={data.prevPrevChange} 
          volume={data.prevPrevVolume} 
        />
        <Arrow 
          changePercent={data.prevChange - data.prevPrevChange}
          volChangePercent={prevVolChangePercent}
        />
        <KlineBlock 
          change={data.prevChange} 
          volume={data.prevVolume} 
        />
        <Arrow 
          changePercent={data.change - data.prevChange}
          volChangePercent={volChangePercent}
        />
        <KlineBlock 
          change={data.change} 
          volume={data.volume} 
        />
      </div>
    </div>
  );
};

export default TimeframeCell; 