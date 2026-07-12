import { useSyncExternalStore } from "react";

type LockedDeposit = {
  id: string;
  name: string;
  amount: number;
  apy: number;
  days: number;
  total: number;
};

type Txn = {
  id: string;
  type: string;
  amount: number;
  date: string;
  status: "Completed" | "Pending";
};

type State = {
  available: number;
  locked: LockedDeposit[];
  transactions: Txn[];
};

const STORAGE_KEY = "pesaki:balance:v1";

const initial: State = {
  available: 84250,
  locked: [
    { id: "l1", name: "12-Month Growth Lock", amount: 120000, apy: 8,  days: 214, total: 365 },
    { id: "l2", name: "6-Month Balanced Lock", amount: 60000,  apy: 6,  days: 45,  total: 180 },
  ],
  transactions: [
    { id: "tx1", type: "Deposit",         amount: 15000,  date: "Today, 10:24", status: "Completed" },
    { id: "tx2", type: "Job Earnings",    amount: 4500,   date: "Today, 08:11", status: "Completed" },
    { id: "tx3", type: "Trading",         amount: -1200,  date: "Yesterday",    status: "Completed" },
    { id: "tx4", type: "Withdrawal",      amount: -8000,  date: "Yesterday",    status: "Pending"   },
    { id: "tx5", type: "Savings",         amount: -5000,  date: "Jun 18",       status: "Completed" },
    { id: "tx6", type: "Business Funding",amount: 50000,  date: "Jun 15",       status: "Completed" },
  ],
};

function load(): State {
  if (typeof window === "undefined") return initial;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    return { ...initial, ...JSON.parse(raw) } as State;
  } catch {
    return initial;
  }
}

let state: State = initial;
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (!hydrated && typeof window !== "undefined") {
    state = load();
    hydrated = true;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function set(next: State) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  ensureHydrated();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  ensureHydrated();
  return state;
}
function getServerSnapshot() {
  return initial;
}

function nowLabel() {
  return new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function addTxn(type: string, amount: number, status: Txn["status"] = "Completed") {
  const t: Txn = { id: `tx${Date.now()}`, type, amount, date: nowLabel(), status };
  set({ ...state, transactions: [t, ...state.transactions] });
}

/** M-Pesa tiered withdrawal fee (KES). Max 600. */
export function mpesaFee(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= 49) return 7;
  if (amount <= 499) return 13;
  if (amount <= 999) return 20;
  if (amount <= 2499) return 30;
  if (amount <= 4999) return 40;
  if (amount <= 9999) return 60;
  if (amount <= 19999) return 85;
  if (amount <= 49999) return 150;
  if (amount <= 249999) return 200;
  return Math.min(600, Math.round(amount * 0.02));
}

/** Bank withdrawal fee: 3%, min 50, max 1000. */
export function bankFee(amount: number): number {
  if (amount <= 0) return 0;
  return Math.max(50, Math.min(1000, Math.round(amount * 0.03)));
}

export function withdrawFee(amount: number, method: "M-Pesa" | "Bank"): number {
  return method === "M-Pesa" ? mpesaFee(amount) : bankFee(amount);
}

export const balanceStore = {
  deposit(amount: number, method: string) {
    if (amount <= 0) return;
    set({ ...state, available: state.available + amount });
    addTxn(`Deposit · ${method}`, amount);
  },
  withdraw(amount: number, method: "M-Pesa" | "Bank"): { ok: boolean; error?: string } {
    const fee = withdrawFee(amount, method);
    const total = amount + fee;
    if (total > state.available) return { ok: false, error: "Insufficient balance" };
    set({ ...state, available: state.available - total });
    addTxn(`Withdrawal · ${method}`, -amount);
    if (fee > 0) addTxn(`Withdrawal fee · ${method}`, -fee);
    return { ok: true };
  },
  transfer(phone: string, amount: number): { ok: boolean; error?: string } {
    if (amount <= 0) return { ok: false, error: "Enter an amount" };
    if (amount > state.available) return { ok: false, error: "Insufficient balance" };
    set({ ...state, available: state.available - amount });
    addTxn(`Transfer to ${phone}`, -amount);
    return { ok: true };
  },
  lock(name: string, amount: number, months: number, apy: number): { ok: boolean; error?: string } {
    if (amount <= 0) return { ok: false, error: "Enter an amount" };
    if (amount > state.available) return { ok: false, error: "Insufficient balance" };
    const totalDays = Math.round(months * 30);
    const deposit: LockedDeposit = {
      id: `l${Date.now()}`,
      name,
      amount,
      apy,
      days: 0,
      total: totalDays,
    };
    set({ ...state, available: state.available - amount, locked: [deposit, ...state.locked] });
    addTxn(`Locked · ${name}`, -amount);
    return { ok: true };
  },
};

export function useBalance() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function totalLocked(s: State = state) {
  ensureHydrated();
  return s.locked.reduce((sum, d) => sum + d.amount, 0);
}
