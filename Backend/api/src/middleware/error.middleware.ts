import { NextFunction, Request, Response } from 'express';
import { monitoring } from './monitoring.middleware';

export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const known = err instanceof AppError;
  const statusCode = known ? err.statusCode : 500;
  const message = known ? err.message : 'Internal server error';

  monitoring.trackException({
    exception: err,
    properties: {
      path: req.path,
      method: req.method,
      statusCode
    }
  });

  res.status(statusCode).json({
    error: message,
    details: known ? err.details : undefined
  });
}
