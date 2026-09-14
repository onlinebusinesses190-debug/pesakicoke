import { Server, Socket } from "socket.io";
import { logger } from "../../utils/logger";
import { realizeGain, getAviatorState } from "../../games/aviator/engine";

export const setupAviatorNamespace = (io: Server) => {
  const nsp = io.of("/aviator");

  nsp.on("connection", (socket: Socket) => {
    logger.info(
      {
        socketId: socket.id,
        userId: socket.data?.user?.id,
      },
      "User connected to /aviator",
    );

    // Send the current game state when user first joins
    socket.emit("SYNC_STATE", getAviatorState());

    // CASHOUT is keyed by slot so the user can cash out allocation 1 and
    // allocation 2 independently in the same round.
    socket.on("CASHOUT", async (data?: { slot?: number }) => {
      try {
        const userId = socket.data.user.id;
        const slot = data?.slot === 2 ? 2 : 1;
        const result = await realizeGain(userId, slot);
        socket.emit("CASHED_OUT", { ...result, slot });
      } catch (error: any) {
        socket.emit("CASHOUT_FAILED", { error: error.message });
      }
    });

    socket.on("disconnect", () => {
      // cleanup maybe
    });
  });
};
