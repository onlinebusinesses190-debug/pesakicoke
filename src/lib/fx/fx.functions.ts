// Pesaki FX backend: every trade is priced and settled on the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEMO_START, LEVERAGE, MAX_AMOUNT, MIN_AMOUNT, PAIRS, calcPnl, getPair, quoteAt, type Side } from "./market";

export interface Trade {
  id: string; mode: "demo" | "real"; symbol: string; side: Side;
  amount: number; margin: number; leverage: number; entry: number;
  exit: number | null; pnl: number | null; status: "open" | "closed";
  reason: string | null; openedAt: string; closedAt: string | null;
}

type Row = {
  id: string; mode: string; symbol: string; side: string; amount: number; margin: number; leverage: number;
  entry_price: number; exit_price: number | null; pnl: number | null; status: string;
  close_reason: string | null; opened_at: string; closed_at: string | null;
};
const norm = (r: Row): Trade => ({
  id: r.id, mode: r.mode as Trade["mode"], symbol: r.symbol, side: r.side as Side,
  amount: Number(r.amount), margin: Number(r.margin), leverage: r.leverage, entry: Number(r.entry_price),
  exit: r.exit_price == null ? null : Number(r.exit_price), pnl: r.pnl == null ? null : Number(r.pnl),
  status: r.status as Trade["status"], reason: r.close_reason, openedAt: r.opened_at, closedAt: r.closed_at,
});

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let { data: w } = await supabase.from("fx_wallets").select("demo_balance, real_balance").eq("user_id", userId).maybeSingle();
    if (!w) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("fx_wallets").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
      w = { demo_balance: DEMO_START, real_balance: 0 };
    }
    const [open, closed] = await Promise.all([
      supabase.from("fx_trades").select("*").eq("status", "open").order("opened_at", { ascending: false }),
      supabase.from("fx_trades").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(100),
    ]);
    return {
      wallet: { demo: Number(w.demo_balance), real: Number(w.real_balance) },
      open: ((open.data ?? []) as Row[]).map(norm),
      closed: ((closed.data ?? []) as Row[]).map(norm),
      serverNow: Date.now(),
    };
  });

export const openTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      mode: z.enum(["demo", "real"]),
      symbol: z.enum(PAIRS.map((p) => p.symbol) as [string, ...string[]]),
      side: z.enum(["buy", "sell"]),
      amount: z.number().min(MIN_AMOUNT).max(MAX_AMOUNT),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const pair = getPair(data.symbol)!;
    const q = quoteAt(pair, Date.now() / 1000);
    const entry = data.side === "buy" ? q.ask : q.bid;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("fx_open_trade", {
      _user: context.userId, _mode: data.mode, _symbol: data.symbol, _side: data.side,
      _amount: Math.round(data.amount * 100) / 100, _leverage: LEVERAGE, _entry: entry,
    });
    if (error) {
      if (error.message.includes("Insufficient")) return { ok: false as const, error: `Not enough money in your ${data.mode} wallet.` };
      console.error(error);
      return { ok: false as const, error: "Could not open the trade. Please try again." };
    }
    return { ok: true as const, id: id as string, entry };
  });

export const closeTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("fx_trades").select("*").eq("id", data.id).eq("status", "open").maybeSingle();
    if (!row) return { ok: false as const, error: "This trade is already closed." };
    const t = norm(row as Row);
    const pair = getPair(t.symbol)!;
    const { exit, pnl } = calcPnl(t, quoteAt(pair, Date.now() / 1000));
    const reason = pnl <= -t.margin ? "stopout" : "manual";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("fx_close_trade", {
      _user: context.userId, _trade: t.id, _exit: exit, _pnl: Math.max(pnl, -t.margin), _reason: reason,
    });
    if (error) { console.error(error); return { ok: false as const, error: "Could not close the trade." }; }
    return { ok: true as const, pnl: Math.max(pnl, -t.margin), exit };
  });

export const resetDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("fx_trades").delete().eq("user_id", context.userId).eq("mode", "demo");
    await supabaseAdmin.from("fx_wallets").upsert({ user_id: context.userId, demo_balance: DEMO_START }, { onConflict: "user_id" });
    return { ok: true };
  });
