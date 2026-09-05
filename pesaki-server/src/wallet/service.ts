import { supabase } from '../lib/supabase';
import { WalletMode } from './types';
import { logger } from '../utils/logger';

const balanceFieldForMode = (mode: WalletMode) => mode === 'real' ? 'balance' : 'demo_balance';

const ensureWalletExists = async (userId: string) => {
  const { data, error } = await supabase
    .from('wallets')
    .select('user_id, balance, demo_balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) {
    return data;
  }

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const { data: created, error: createError } = await supabase
    .from('wallets')
    .insert([{
      user_id: userId,
      balance: 0,
      demo_balance: 10000,
    }])
    .select('user_id, balance, demo_balance')
    .single();

  if (createError) {
    throw createError;
  }

  return created;
};

/**
 * Service to handle atomic wallet transactions interacting via Supabase RPCs
 */

export const getBalance = async (userId: string, mode: WalletMode): Promise<number | null> => {
  const balanceField = balanceFieldForMode(mode);

  try {
    const wallet = await ensureWalletExists(userId);
    return (wallet as any)?.[balanceField] ?? 0;
  } catch (error: any) {
    logger.error({ error, userId, mode }, 'Failed to fetch wallet balance');
    return null;
  }
};

export const debit = async (
  userId: string,
  amount: number,
  mode: WalletMode,
  description: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> => {
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' };

  logger.info({ userId, amount, mode, description }, 'Initiating debit...');

  try {
    const balance = await getBalance(userId, mode);
    if (balance === null || balance < amount) {
      logger.warn({ userId, balance, amount, mode }, 'Debit blocked: Insufficient funds (redundant check)');
      return { success: false, error: 'Insufficient funds' };
    }

    const { data, error } = await supabase.rpc('debit_wallet', {
      p_user_id: userId,
      p_amount: amount,
      p_mode: mode,
      p_description: description
    });

    if (error) {
      logger.warn({ error, userId, amount, description }, 'Debit RPC failed');
      return { success: false, error: error.message };
    }

    if (data === null) {
      logger.error({ userId, amount, mode }, 'Debit RPC returned null without an error object');
      return { success: false, error: 'Insufficient funds' };
    }

    logger.info({ userId, amount, mode, newBalance: data }, 'Debit successful');
    return { success: true, newBalance: data as number };
  } catch (error: any) {
    logger.error(error, 'Exception in debit operation');
    return { success: false, error: 'Internal server error' };
  }
};

export const credit = async (
  userId: string,
  amount: number,
  mode: WalletMode,
  description: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> => {
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' };

  try {
    const { data, error } = await supabase.rpc('credit_wallet', {
      p_user_id: userId,
      p_amount: amount,
      p_mode: mode,
      p_description: description
    });

    if (error) {
      logger.warn({ error, userId, amount, description }, 'Credit failed');
      return { success: false, error: error.message };
    }

    return { success: true, newBalance: data as number };
  } catch (error: any) {
     logger.error(error, 'Exception in credit operation');
     return { success: false, error: 'Internal server error' };
  }
};

export const transfer = async (
  fromUserId: string,
  toUserId: string,
  amount: number,
  mode: WalletMode,
  description: string
): Promise<{ success: boolean; senderBalance?: number; recipientBalance?: number; error?: string }> => {
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' };
  if (fromUserId === toUserId) return { success: false, error: 'You cannot transfer to yourself' };

  try {
    const senderBalance = await getBalance(fromUserId, mode);
    if (senderBalance === null || senderBalance < amount) {
      return { success: false, error: 'Insufficient funds' };
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('transfer_wallet', {
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_amount: amount,
      p_mode: mode,
      p_description: description
    });

    if (!rpcError && rpcResult !== null) {
      const nextSenderBalance = Number(rpcResult);
      const recipientBalance = await getBalance(toUserId, mode);
      return {
        success: true,
        senderBalance: nextSenderBalance,
        recipientBalance: recipientBalance ?? 0,
      };
    }

    const senderWallet = await ensureWalletExists(fromUserId);
    const recipientWallet = await ensureWalletExists(toUserId);
    const balanceField = balanceFieldForMode(mode);
    const senderNewBalance = Number(senderWallet[balanceField]) - amount;
    const recipientNewBalance = Number(recipientWallet[balanceField]) + amount;

    const { error: debitError } = await supabase
      .from('wallets')
      .update({ [balanceField]: senderNewBalance })
      .eq('user_id', fromUserId);

    if (debitError) {
      logger.error({ error: debitError, fromUserId, toUserId, amount, mode }, 'Fallback debit transfer failed');
      return { success: false, error: debitError.message };
    }

    const { error: creditError } = await supabase
      .from('wallets')
      .update({ [balanceField]: recipientNewBalance })
      .eq('user_id', toUserId);

    if (creditError) {
      logger.error({ error: creditError, fromUserId, toUserId, amount, mode }, 'Fallback credit transfer failed');
      return { success: false, error: creditError.message };
    }

    const ledgerEntries = [
      {
        user_id: fromUserId,
        type: 'Transfer',
        mode: 'debit',
        amount,
        description,
      },
      {
        user_id: toUserId,
        type: 'Transfer',
        mode: 'credit',
        amount,
        description,
      },
    ];

    const { error: ledgerError } = await supabase
      .from('wallet_ledger')
      .insert(ledgerEntries);

    if (ledgerError) {
      logger.error({ error: ledgerError, fromUserId, toUserId, amount }, 'Fallback transfer ledger write failed');
    }

    return {
      success: true,
      senderBalance: senderNewBalance,
      recipientBalance: recipientNewBalance,
    };
  } catch (error: any) {
    logger.error({ error, fromUserId, toUserId, amount, mode }, 'Transfer failed');
    return { success: false, error: error.message || 'Internal server error' };
  }
};
