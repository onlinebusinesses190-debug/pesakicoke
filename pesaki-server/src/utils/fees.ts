export const MIN_DEPOSIT = 10;
export const MIN_TRANSFER = 10;
export const MIN_WITHDRAWAL = 10;

// Deposit fee is waived across all of PESAKI: users receive the full
// deposited amount.
export const calculateDepositFee = (_amount: number): number => {
  return 0;
};

// Transfer fee is free across all of PESAKI.
export const calculateTransferFee = (_amount: number): number => {
  return 0;
};

// Tiered transaction fee charged per successful payment (KES).
export const calculateWithdrawalFee = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount <= 10) return 0;
  if (amount <= 50) return 1;
  if (amount <= 499) return 6;
  if (amount <= 999) return 10;
  if (amount <= 1499) return 15;
  if (amount <= 2499) return 20;
  if (amount <= 3499) return 25;
  if (amount <= 4999) return 30;
  if (amount <= 7499) return 40;
  if (amount <= 9999) return 45;
  if (amount <= 14999) return 50;
  if (amount <= 19999) return 55;
  if (amount <= 34999) return 80;
  if (amount <= 49999) return 105;
  if (amount <= 149999) return 130;
  if (amount <= 249999) return 160;
  if (amount <= 349999) return 195;
  if (amount <= 549999) return 230;
  if (amount <= 749999) return 275;
  return 320;
};
