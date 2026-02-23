import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { monitoring } from './middleware/monitoring.middleware';
import { errorHandler } from './middleware/error.middleware';
import { faceService } from './services/face.service';
import { healthService } from './services/health.service';
import { redisService } from './services/redis.service';
import { swaggerSpec } from './docs/swagger';

import consultationRoutes from './routes/consultation.routes';
import doctorRoutes from './routes/doctor.routes';
import patientRoutes from './routes/patient.routes';
import paymentRoutes from './routes/payment.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRoutes from './routes/health.routes';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  })
);

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(monitoring.trackRequest());

app.get('/health', async (_req, res, next) => {
  try {
    const health = await healthService.checkHealth();
    res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /health:
 *   get:
 *     operationId: getRootHealth
 *     tags:
 *       - Health
 *     summary: Get overall API health
 *     responses:
 *       200:
 *         description: API is healthy or degraded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: API is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.use('/api/v1/consultations', consultationRoutes);
app.use('/api/v1/doctors', doctorRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/api-docs.json', (_req, res) => {
  res.status(200).json(swaggerSpec);
});

app.use(monitoring.trackError());
app.use(errorHandler);

async function initialize() {
  await faceService.initializePersonGroup();
  await redisService.connect();

  app.listen(PORT, () => {
    monitoring.trackEvent('ServerStarted', { port: PORT });
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  initialize().catch((error) => {
    monitoring.trackException({ exception: error, properties: { stage: 'startup' } });
    process.exit(1);
  });
}

process.on('SIGTERM', async () => {
  await redisService.disconnect();
  process.exit(0);
});

export default app;
