import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/AppError';

type RequestPart = 'body' | 'params' | 'query';

// Validates the given request part against a zod schema, replacing it with the parsed value.
export function validate(schema: ZodType, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || part,
        message: issue.message,
      }));
      next(AppError.badRequest('VALIDATION_ERROR', 'Request validation failed', fieldErrors));
      return;
    }
    req[part] = result.data;
    next();
  };
}
