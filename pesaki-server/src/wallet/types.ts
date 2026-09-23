export type WalletMode = 'real' | 'demo';

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  mode: WalletMode;
  description: string;
  balance_after?: number;
  created_at: string;
}

export interface WalletResponse {
  success: boolean;
  newBalance?: number;
  error?: string;
}
