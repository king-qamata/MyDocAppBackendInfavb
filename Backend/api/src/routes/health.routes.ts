import { Router } from 'express';
import { healthService } from '../services/health.service';

const router = Router();

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     operationId: getApiHealth
 *     tags:
 *       - Health
 *     summary: Get service health details
 *     responses:
 *       200:
 *         description: Health details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Service unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get('/', async (_req, res, next) => {
  try {
    const health = await healthService.checkHealth();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/health/metrics:
 *   get:
 *     operationId: getApiMetrics
 *     tags:
 *       - Health
 *     summary: Get API runtime metrics
 *     responses:
 *       200:
 *         description: Metrics payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MetricsResponse'
*/
router.get('/metrics', async (_req, res, next) => {
  try {
    const metrics = await healthService.getMetrics();
    res.status(200).json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;
