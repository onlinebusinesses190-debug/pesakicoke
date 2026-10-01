import { FastifyInstance } from "fastify";
// wallet removed – now registered directly in main index.ts
import { aviatorRoutes } from "./routes/aviator";
import { spinRoutes } from "./routes/spin";
import { predictionRoutes } from "./routes/prediction";
import { fxRoutes } from "./routes/fx";
import { healthRoutes } from "./routes/health";
import { marketRoutes } from "./routes/market";
import { nseRoutes } from "./routes/nse";
import { forexRoutes } from "./routes/forex";

export const registerRoutes = (fastify: FastifyInstance) => {
  fastify.register(healthRoutes); // /health is global
  fastify.register(marketRoutes, { prefix: "/market" });
  // wallet removed – registered in main index.ts to support optional 'mode'
  fastify.register(aviatorRoutes, { prefix: "/games/aviator" });
  fastify.register(spinRoutes, { prefix: "/games/spin" });
  fastify.register(predictionRoutes, { prefix: "/games/prediction" });
  fastify.register(fxRoutes, { prefix: "/games/fx" });
  fastify.register(nseRoutes, { prefix: "/games/nse" });
  // PESAKI Forex: own accounts/orders/positions/ledger and own data engine.
  // Kept separate from the binary prediction game at /games/fx.
  fastify.register(forexRoutes, { prefix: "/forex" });
};
