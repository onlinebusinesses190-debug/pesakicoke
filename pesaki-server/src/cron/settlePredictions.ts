import { settlePredictions } from '../games/prediction/engine';
import { logger } from '../utils/logger';

export const runSettlePredictions = async () => {
    try {
        await settlePredictions();
    } catch (err: any) {
        logger.error(err, 'Failed to run prediction settling job');
    }
};
