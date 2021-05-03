import { logger } from '@libs/logs';
import { eventErrorHandler } from '@libs/errorHandler';

type Event = {
  message: string;
};

export const eventHello = eventErrorHandler(
  async (event: Event): Promise<void> => {
    const { message } = event;
    logger.log({ message });
  }
);
