export const MIN_DEPOSIT = 10;
export const MIN_TRANSFER = 10;
export const MIN_WITHDRAWAL = 50;

export const calculateDepositFee = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount <= 100) return 2;
  if (amount <= 400) return 6;
  if (amount <= 1000) return 14;
  return 30;
};

export const calculateTransferFee = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount <= 100) return 2;
  return 5;
};

export const calculateWithdrawalFee = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount <= 100) return 6;
  if (amount <= 400) return 9;
  if (amount <= 800) return 20;
  if (amount <= 1500) return 25;
  if (amount <= 3000) return 30;
  if (amount <= 5000) return 40;
  if (amount <= 10000) return 55;
  if (amount <= 30000) return 65;
  if (amount <= 50000) return 140;
  if (amount <= 200000) return 210;
  if (amount <= 300000) return 1000;
  if (amount <= 500000) return 2500;
  return Math.round(amount * 0.04);
};
