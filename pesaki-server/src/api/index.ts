// ─── Routes loaded by registerRoutes() ──────────────────────────────
// NOTE: walletRoutes is now registered directly in index.ts
//       to avoid conflicts and support optional 'mode' parameter.

import { kaziRoutes } from './routes/kazi';
import { mpesaRoutes } from './routes/mpesa';

export { kaziRoutes, mpesaRoutes };

// ─── This function is called from the main index.ts ────────────────
import { FastifyInstance } from 'fastify';

export const registerRoutes = (server: FastifyInstance) => {
  // All routes from ./routes/* are auto‑registered here.
  // If you have other routes besides kazi and mpesa, add them below.
  server.register(kaziRoutes);
  server.register(mpesaRoutes);
};
