import { Router } from 'express';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

const router = Router();

const bootstrapSchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().min(7).max(30),
  role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']).optional()
});

const registerPatientSchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().min(7).max(30),
  password: z.string().min(8).max(128),
  dateOfBirth: z.string().min(4),
  bloodGroup: z.string().max(10).optional(),
  allergies: z.array(z.string()).optional(),
  chronicConditions: z.array(z.string()).optional(),
  emergencyName: z.string().max(100).optional(),
  emergencyPhone: z.string().max(30).optional()
});

const registerDoctorSchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().min(7).max(30),
  password: z.string().min(8).max(128),
  mdcnNumber: z.string().min(4).max(50),
  specialization: z.string().min(2).max(100),
  yearsOfExperience: z.number().int().min(0).max(80),
  verifiedAt: z.string().optional(),
  canHandleVoiceText: z.boolean().optional(),
  canHandleVoiceCall: z.boolean().optional(),
  canHandleVideoCall: z.boolean().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128)
});

function assertBootstrapAllowed(req: { headers: Record<string, unknown> }) {
  const requiredKey = process.env.DEV_BOOTSTRAP_KEY;
  const providedKey = String(req.headers['x-dev-bootstrap-key'] || '');

  if (process.env.NODE_ENV === 'production' && !requiredKey) {
    throw new AppError('Bootstrap disabled in production', 403);
  }

  if (requiredKey && providedKey !== requiredKey) {
    throw new AppError('Invalid bootstrap key', 401);
  }
}

/**
 * @openapi
 * /api/v1/auth/dev-bootstrap:
 *   post:
 *     operationId: devBootstrapUser
 *     tags:
 *       - Auth
 *     summary: Create (or fetch) a user and return a JWT (dev/test use)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DevBootstrapInput'
 *     responses:
 *       200:
 *         description: User created and token issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthUserResponse'
 *       401:
 *         description: Invalid bootstrap key
 *       403:
 *         description: Bootstrap disabled in production
 */
function getAccessTokenTtlMinutes() {
  return Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15);
}

function getRefreshTokenTtlDays() {
  return Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
}

function getRefreshTokenSecret() {
  return process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-secret';
}

function hashRefreshToken(token: string) {
  return crypto.createHmac('sha256', getRefreshTokenSecret()).update(token).digest('hex');
}

function getRequestIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || undefined;
}

function getRequestUserAgent(req: Request) {
  return typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
}

async function writeAuthAuditLog(params: {
  userId?: string;
  action: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      resource: 'AUTH',
      resourceId: params.resourceId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: params.req ? getRequestIp(params.req) : undefined,
      userAgent: params.req ? getRequestUserAgent(params.req) : undefined
    }
  });
}

function signToken(user: { id: string; role?: string | null; tokenVersion?: number }) {
  return jwt.sign(
    { sub: user.id, role: user.role, tv: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET || 'dev-secret',
    {
      expiresIn: `${getAccessTokenTtlMinutes()}m`,
      issuer: process.env.JWT_ISSUER || undefined,
      audience: process.env.JWT_AUDIENCE || undefined
    }
  );
}

async function issueRefreshToken(userId: string, req?: Request) {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: req ? getRequestIp(req) : undefined,
      userAgent: req ? getRequestUserAgent(req) : undefined
    }
  });

  return { refreshToken: rawToken, refreshTokenExpiresAt: expiresAt };
}

router.post('/dev-bootstrap', async (req, res, next) => {
  try {
    assertBootstrapAllowed(req);
    const input = bootstrapSchema.parse(req.body);

    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {
        phoneNumber: input.phoneNumber,
        role: input.role || 'PATIENT'
      },
      create: {
        email: input.email,
        phoneNumber: input.phoneNumber,
        role: input.role || 'PATIENT'
      }
    });

    const token = signToken(user);
    const refresh = await issueRefreshToken(user.id, req);
    const { passwordHash, ...safeUser } = user;
    await writeAuthAuditLog({
      userId: user.id,
      action: 'AUTH_DEV_BOOTSTRAP',
      resourceId: user.id,
      metadata: { role: user.role },
      req
    });

    res.status(200).json({ token, ...refresh, user: safeUser });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/register/patient:
 *   post:
 *     operationId: registerPatient
 *     tags:
 *       - Auth
 *     summary: Register a patient user with password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterPatientInput'
 *     responses:
 *       200:
 *         description: Patient registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokenUserIdResponse'
 */
router.post('/register/patient', async (req, res, next) => {
  try {
    const input = registerPatientSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { phoneNumber: input.phoneNumber }] }
    });
    if (existing) throw new AppError('User already exists', 409);

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        phoneNumber: input.phoneNumber,
        role: 'PATIENT',
        passwordHash
      }
    });

    await prisma.patientProfile.create({
      data: {
        userId: user.id,
        dateOfBirth: new Date(input.dateOfBirth),
        bloodGroup: input.bloodGroup,
        allergies: input.allergies || [],
        chronicConditions: input.chronicConditions || [],
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone
      }
    });

    const token = signToken(user);
    const refresh = await issueRefreshToken(user.id, req);
    await writeAuthAuditLog({
      userId: user.id,
      action: 'AUTH_REGISTER_PATIENT',
      resourceId: user.id,
      metadata: { email: user.email },
      req
    });
    res.status(200).json({ token, ...refresh, userId: user.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/register/doctor:
 *   post:
 *     operationId: registerDoctor
 *     tags:
 *       - Auth
 *     summary: Register a doctor user with password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterDoctorInput'
 *     responses:
 *       200:
 *         description: Doctor registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokenUserIdResponse'
 */
router.post('/register/doctor', async (req, res, next) => {
  try {
    const input = registerDoctorSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { phoneNumber: input.phoneNumber }] }
    });
    if (existing) throw new AppError('User already exists', 409);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const verifiedAt = input.verifiedAt ? new Date(input.verifiedAt) : new Date();

    const user = await prisma.user.create({
      data: {
        email: input.email,
        phoneNumber: input.phoneNumber,
        role: 'DOCTOR',
        passwordHash
      }
    });

    await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        mdcnNumber: input.mdcnNumber,
        specialization: input.specialization,
        yearsOfExperience: input.yearsOfExperience,
        verifiedAt,
        canHandleVoiceText: input.canHandleVoiceText ?? true,
        canHandleVoiceCall: input.canHandleVoiceCall ?? false,
        canHandleVideoCall: input.canHandleVideoCall ?? false
      }
    });

    const token = signToken(user);
    const refresh = await issueRefreshToken(user.id, req);
    await writeAuthAuditLog({
      userId: user.id,
      action: 'AUTH_REGISTER_DOCTOR',
      resourceId: user.id,
      metadata: { email: user.email, mdcnNumber: input.mdcnNumber },
      req
    });
    res.status(200).json({ token, ...refresh, userId: user.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     operationId: loginUser
 *     tags:
 *       - Auth
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash) throw new AppError('Invalid credentials', 401);

    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) throw new AppError('Invalid credentials', 401);

    const token = signToken(user);
    const refresh = await issueRefreshToken(user.id, req);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    await writeAuthAuditLog({
      userId: user.id,
      action: 'AUTH_LOGIN',
      resourceId: user.id,
      metadata: { role: user.role },
      req
    });
    res.status(200).json({ token, ...refresh, userId: user.id, role: user.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     operationId: refreshAccessToken
 *     tags:
 *       - Auth
 *     summary: Exchange a refresh token for a new access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenInput'
 *     responses:
 *       200:
 *         description: Access token issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '');
    if (!refreshToken) throw new AppError('Invalid refresh token', 401);

    const tokenHash = hashRefreshToken(refreshToken);
    const record = await prisma.refreshToken.findFirst({ where: { tokenHash } });

    if (!record) throw new AppError('Invalid refresh token', 401);
    if (record.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await prisma.user.update({
        where: { id: record.userId },
        data: { tokenVersion: { increment: 1 } }
      });
      await writeAuthAuditLog({
        userId: record.userId,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        resourceId: record.id,
        metadata: { ipAddress: getRequestIp(req) },
        req
      });
      throw new AppError('Refresh token reuse detected', 401);
    }
    if (record.expiresAt <= new Date()) {
      await prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() }
      });
      await writeAuthAuditLog({
        userId: record.userId,
        action: 'AUTH_REFRESH_EXPIRED',
        resourceId: record.id,
        req
      });
      throw new AppError('Refresh token expired', 401);
    }

    const requestUserAgent = getRequestUserAgent(req);
    const strictIp = process.env.AUTH_STRICT_REFRESH_IP === 'true';
    const requestIp = getRequestIp(req);

    if (record.userAgent && requestUserAgent && record.userAgent !== requestUserAgent) {
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await prisma.user.update({
        where: { id: record.userId },
        data: { tokenVersion: { increment: 1 } }
      });
      await writeAuthAuditLog({
        userId: record.userId,
        action: 'AUTH_REFRESH_USER_AGENT_MISMATCH',
        resourceId: record.id,
        metadata: { storedUserAgent: record.userAgent, requestUserAgent },
        req
      });
      throw new AppError('Refresh token context mismatch', 401);
    }

    if (strictIp && record.ipAddress && requestIp && record.ipAddress !== requestIp) {
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await prisma.user.update({
        where: { id: record.userId },
        data: { tokenVersion: { increment: 1 } }
      });
      await writeAuthAuditLog({
        userId: record.userId,
        action: 'AUTH_REFRESH_IP_MISMATCH',
        resourceId: record.id,
        metadata: { storedIp: record.ipAddress, requestIp },
        req
      });
      throw new AppError('Refresh token context mismatch', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) throw new AppError('Invalid refresh token', 401);

    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() }
    });

    const token = signToken(user);
    const refresh = await issueRefreshToken(user.id, req);
    await writeAuthAuditLog({
      userId: user.id,
      action: 'AUTH_REFRESH',
      resourceId: record.id,
      req
    });
    res.status(200).json({ token, ...refresh });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     operationId: revokeRefreshToken
 *     tags:
 *       - Auth
 *     summary: Revoke a refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenInput'
 *     responses:
 *       200:
 *         description: Refresh token revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenericMessageResponse'
 */
router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '');
    if (!refreshToken) throw new AppError('Invalid refresh token', 401);

    const tokenHash = hashRefreshToken(refreshToken);
    const result = await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    if (result.count > 0) {
      const tokenRecord = await prisma.refreshToken.findFirst({ where: { tokenHash } });
      await writeAuthAuditLog({
        userId: tokenRecord?.userId,
        action: 'AUTH_LOGOUT',
        resourceId: tokenRecord?.id,
        req
      });
    }

    res.status(200).json({ message: 'Logged out' });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/logout-all:
 *   post:
 *     operationId: revokeAllRefreshTokens
 *     tags:
 *       - Auth
 *     summary: Revoke all refresh tokens for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All refresh tokens revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenericMessageResponse'
 *       401:
 *         description: Unauthenticated
 */
router.post('/logout-all', authMiddleware.authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } }
    });
    await writeAuthAuditLog({
      userId,
      action: 'AUTH_LOGOUT_ALL',
      resourceId: userId,
      req
    });

    res.status(200).json({ message: 'Logged out everywhere' });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/change-password:
 *   post:
 *     operationId: changePassword
 *     tags:
 *       - Auth
 *     summary: Change password and revoke existing sessions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordInput'
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenericMessageResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/change-password', authMiddleware.authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const input = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new AppError('Password login is not enabled for this user', 400);

    const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!matches) throw new AppError('Invalid credentials', 401);

    const passwordHash = await bcrypt.hash(input.newPassword, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 }
        }
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    });

    await writeAuthAuditLog({
      userId,
      action: 'AUTH_PASSWORD_CHANGED',
      resourceId: userId,
      req
    });

    res.status(200).json({ message: 'Password changed. Please sign in again.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    return next(error);
  }
});

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     operationId: getCurrentUser
 *     tags:
 *       - Auth
 *     summary: Get the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSummary'
 *       401:
 *         description: Unauthenticated
 */
router.get('/me', authMiddleware.authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthenticated', 401);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const { passwordHash, ...safeUser } = user;
    res.status(200).json(safeUser);
  } catch (error) {
    next(error);
  }
});

export default router;
