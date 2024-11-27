import React from 'react';
import { KlineData } from '../types';
import { parseVolumeString } from '../utils/formatters';

interface TimeframeCellProps {
  data: {
    change: number;
    volume: string;
    prevChange: number;
    prevVolume: string;
  }
}

const TimeframeCell = ({ data }: TimeframeCellProps) => {
  return (
    <div className="space-y-2">
      <div className={`text-center ${data.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
        {data.change > 0 ? '+' : ''}{data.change.toFixed(2)}%
      </div>
      <div className="text-gray-400 text-center text-sm">
        {data.volume}
      </div>
    </div>
  );
};

export default TimeframeCell; 