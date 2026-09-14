export interface AviatorRound {
  id: string;
  serverSeed: string; // The secret server seed
  clientSeed: string; // The combined or client-provided seed
  hash: string; // SHA256(serverSeed) broadcasted at start
  crashPoint: number; // calculated crash value
  startTime: number; // when the round started flying
  status: "WAITING" | "FLYING" | "CRASHED";
}

export interface AviatorBet {
  userId: string;
  slot: number; // 1 or 2 — the two allocation slots per round
  amount: number;
  mode: "real" | "demo";
  cashedOut: boolean;
  cashoutMultiplier?: number;
  cashoutAmount?: number;
}
