async placeOrder(req: { symbol: string; type: OrderType; lots: number; price?: number; sl?: number; tp?: number; }): Promise<Result> {
  const s = this.spec(req.symbol);
  if (!s) return this.fail("Unknown symbol");
  const q = this.quotes[req.symbol];
  
  if (this.mode === "live") {
    try {
      const payloadSymbol = req.symbol.replace(/(...)(...)/, "$1/$2"); 
      
      // Convert PESAKI Lots to Margin USD (0.01 lot = $1)
      const marginUsd = req.lots * 100; 

      const res = await apiRequest<any>("/forex/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol: payloadSymbol,
          side: isBuyType(req.type) ? "buy" : "sell", 
          trade_amount: marginUsd, // 👈 Sending Margin ($1) to backend
          stop_loss: req.sl || null, 
          take_profit: req.tp || null, 
          account_type: "live"
        })
      });
      
      if (!res.success) return this.fail(res.error || "Backend rejected trade");
      
      this.fetchLiveBalance(); 
      this.log(`LIVE order #${res.order?.id} executed`);
      return { ok: true, ticket: res.order?.id };
    } catch (err: any) {
      return this.fail(err.message || "Network error placing live trade");
    }
  }
  
  // ... (demo logic)
