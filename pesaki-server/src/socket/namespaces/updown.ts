import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { placePosition, getUpDownState } from '../../games/updown/engine';

export const setupUpDownNamespace = (io: Server) => {
  const nsp = io.of('/updown');

  nsp.on('connection', (socket: Socket) => {
    const userId = socket.data?.user?.id;
    logger.info({ socketId: socket.id, userId }, 'User connected to /updown');

    // Sync current state immediately for mid-round joiners
    const state = getUpDownState();
    if (state.round) {
      // Calculate secondsLeft from current time vs locksAt
      const secondsLeft = Math.max(
        0,
        Math.ceil((new Date(state.round.locksAt).getTime() - Date.now()) / 1000)
      );
      socket.emit('SYNC_STATE', {
        round: state.round,
        secondsLeft,
        history: state.history,
      });
    } else {
      socket.emit('SYNC_STATE', { round: null, secondsLeft: 0, history: state.history });
    }

    // Handle position placement
    socket.on('PLACE_POSITION', async (payload: {
      roundId: string;
      direction: 'up' | 'down';
      amount: number;
      mode: 'real' | 'demo';
    }) => {
      try {
        const { roundId, direction, amount, mode } = payload;

        if (!userId) {
          socket.emit('ORDER_REJECTED', { error: 'Not authenticated' });
        } else if (!['up', 'down'].includes(direction)) {
          socket.emit('ORDER_REJECTED', { error: 'Invalid direction' });
        } else if (!amount || amount <= 0) {
          socket.emit('ORDER_REJECTED', { error: 'Invalid amount' });
        } else {
          const result = await placePosition(userId, roundId, direction, amount, mode);

          if (result.success) {
            socket.emit('POSITION_CONFIRMED', {
              roundId,
              direction,
              amount,
              newBalance: result.newBalance,
            });
            logger.info({ userId, roundId, direction, amount }, 'Position confirmed via socket');
          } else {
            socket.emit('ORDER_REJECTED', { error: result.error });
            logger.warn({ userId, roundId, error: result.error }, 'Order rejected');
          }
        }
      } catch (err: any) {
        logger.error(err, 'PLACE_POSITION socket handler error');
        socket.emit('ORDER_REJECTED', { error: 'Internal error' });
      }
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id, userId }, 'User disconnected from /updown');
    });
  });
};
