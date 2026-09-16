import { NextFunction, Request, Response } from 'express';
import { appConfig } from '../config';
import { AppError } from '../utils/AppError';

export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const providedKey = req.header('x-api-key');
  if (!providedKey || providedKey !== appConfig.apiKey) {
    next(AppError.unauthorized('UNAUTHORIZED', 'Missing or invalid API key'));
    return;
  }
  next();
}
