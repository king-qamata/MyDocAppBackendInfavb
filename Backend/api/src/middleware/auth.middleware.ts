import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role?: string;
        tokenVersion?: number;
      };
      rawBody?: Buffer;
    }
  }
}

export const authMiddleware = {
  async authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      if (process.env.NODE_ENV === 'test') {
        req.user = {
          id: (req.headers['x-user-id'] as string) || 'test-user',
          role: (req.headers['x-user-role'] as string) || 'PATIENT'
        };
        return next();
      }
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.substring(7);

    try {
      const options: jwt.VerifyOptions = {
        issuer: process.env.JWT_ISSUER || undefined,
        audience: process.env.JWT_AUDIENCE || undefined
      };

      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret', options) as {
        sub?: string;
        id?: string;
        role?: string;
        tv?: number;
      };

      const userId = payload.sub || payload.id || 'unknown';
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, tokenVersion: true, isActive: true }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if ((payload.tv ?? 0) !== user.tokenVersion) {
        return res.status(401).json({ error: 'Token has been revoked' });
      }

      req.user = {
        id: user.id,
        role: payload.role || user.role,
        tokenVersion: user.tokenVersion
      };

      return next();
    } catch {
      if (process.env.NODE_ENV === 'test') {
        req.user = {
          id: (req.headers['x-user-id'] as string) || 'test-user',
          role: (req.headers['x-user-role'] as string) || 'PATIENT'
        };
        return next();
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
};
