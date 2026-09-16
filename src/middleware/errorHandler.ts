import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound('ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// Single normalized error shape used by every endpoint, per assignment section 3.5.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const appError =
    err instanceof AppError ? err : AppError.internal('INTERNAL_ERROR', 'An unexpected error occurred');

  const logPayload = {
    requestId: req.requestId,
    errorType: appError.code,
    statusCode: appError.statusCode,
    stack: err instanceof Error ? err.stack : undefined,
  };

  if (appError.statusCode >= 500) {
    logger.error(logPayload, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: req.requestId,
    },
  });
}
