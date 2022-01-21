import { logger } from '@libs/logs';
import { eventErrorHandler } from '@libs/error-handler';

type Event = {
  message: string;
};

export const eventHello = eventErrorHandler(async (event: Event): Promise<void> => {
  const { message } = event;
  logger.log({ message });
});
