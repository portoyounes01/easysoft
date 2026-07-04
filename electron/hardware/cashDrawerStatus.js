const DRAWER_SWITCH_HIGH_BIT = 0x04;

const parseCashDrawerStatus = (statusByte) => {
  const signalHigh = (statusByte & DRAWER_SWITCH_HIGH_BIT) !== 0;

  return {
    status: signalHigh ? 'closed' : 'open',
    signal: signalHigh ? 'high' : 'low',
    rawStatus: statusByte,
  };
};

module.exports = {
  DRAWER_SWITCH_HIGH_BIT,
  parseCashDrawerStatus,
};
