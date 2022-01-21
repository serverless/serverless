import type { Request as ExpressRequest, Response } from 'express';
import { logger } from '@libs/logs';
import { httpErrorHandler } from '@libs/error-handler';

type Body = {
  message: string;
};
type Request = ExpressRequest<Record<string, string>, void, Body>;

export const httpHello = httpErrorHandler(async (req: Request, res: Response): Promise<void> => {
  const {
    body: { message },
  } = req;
  logger.log({ message });

  res.status(200).send();
});
