export const parseVolumeString = (volStr: string) => {
  const unit = volStr.slice(-1).toUpperCase();
  const value = parseFloat(volStr);
  
  switch(unit) {
    case 'K':
      return value * 1000;
    case 'M':
      return value * 1000000;
    case 'B':
      return value * 1000000000;
    default:
      return value;
  }
};

export const formatVolume = (volume: string) => {
  const vol = parseFloat(volume);
  
  const addUnit = (num: number, unit: string) => {
    if (num < 1) return num.toFixed(1);
    if (num < 10) return num.toFixed(1) + unit;
    return Math.round(num) + unit;
  };

  if (vol >= 1000000000) return addUnit(vol / 1000000000, 'B');
  if (vol >= 1000000) return addUnit(vol / 1000000, 'M');
  if (vol >= 1000) return addUnit(vol / 1000, 'K');
  
  if (vol < 1) return vol.toFixed(3);
  if (vol < 10) return vol.toFixed(2);
  if (vol < 100) return vol.toFixed(1);
  return Math.round(vol).toString();
}; 