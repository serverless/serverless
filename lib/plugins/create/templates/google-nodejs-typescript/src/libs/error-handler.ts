import type { Request, Response } from 'express';
import { logger } from '@libs/logs';

type HttpHandler = (req: Request, res: Response) => unknown | Promise<unknown>;
export const httpErrorHandler = (handler: HttpHandler) => async (
  req: Request,
  res: Response
): Promise<void> => {
  logger.init(req);
  try {
    await handler(req, res);
  } catch (error) {
    logger.error(error);
    res.status(500).send();
  }
};

type EventHandler<E> = (event: E) => void | Promise<void>;

export const HANDLER_ERROR_MESSAGE = 'An error occurred during the handle of the event';
export const eventErrorHandler = <E>(handler: EventHandler<E>) => async (
  event: E
): Promise<void> => {
  try {
    await handler(event);
  } catch (error) {
    logger.error(error);
    throw new Error(HANDLER_ERROR_MESSAGE);
  }
};
