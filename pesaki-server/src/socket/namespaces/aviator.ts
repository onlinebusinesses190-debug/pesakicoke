import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { realizeGain, getAviatorState } from '../../games/aviator/engine';

export const setupAviatorNamespace = (io: Server) => {
  const nsp = io.of('/aviator');

  nsp.on('connection', (socket: Socket) => {
    logger.info({ 
      socketId: socket.id, 
      userId: socket.data?.user?.id 
    }, 'User connected to /aviator');

    // Send the current game state when user first joins
    socket.emit('SYNC_STATE', getAviatorState());

    // NOTE: PLACE_BET is handled via REST API to ensure atomic wallet transactions via HTTP correctly.
    // However, if we need it here, we just listen to it. The user requested API for bet and cashout, 
    // but the engine mentions "Accept CASHOUT events from clients" ... 
    // We'll implement CASHOUT here so it has zero latency.
    
    socket.on('CASHOUT', async () => {
      try {
        const userId = socket.data.user.id;
        const result = await realizeGain(userId);
        socket.emit('CASHED_OUT', result);
      } catch (error: any) {
        socket.emit('CASHOUT_FAILED', { error: error.message });
      }
    });

    socket.on('disconnect', () => {
        // cleanup maybe
    });
  });
};
