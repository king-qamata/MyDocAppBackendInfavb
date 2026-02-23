import { NextFunction, Request, Response } from 'express';
import * as appInsights from 'applicationinsights';
import { TelemetryClient } from 'applicationinsights';

export class MonitoringMiddleware {
  private client?: TelemetryClient;

  constructor() {
    const instrumentationKey = process.env.APPINSIGHTS_INSTRUMENTATIONKEY;
    const connectionString =
      process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
      (instrumentationKey ? `InstrumentationKey=${instrumentationKey}` : undefined);

    if (connectionString) {
      appInsights
        .setup(connectionString)
        .setAutoDependencyCorrelation(true)
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(true)
        .setUseDiskRetryCaching(true)
        .start();

      this.client = appInsights.defaultClient;
    }
  }

  trackRequest() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.client?.trackRequest({
          name: `${req.method} ${req.path}`,
          url: req.originalUrl,
          duration,
          resultCode: String(res.statusCode),
          success: res.statusCode < 400,
          properties: {
            method: req.method,
            userId: req.user?.id,
            userRole: req.user?.role,
            tier: req.body?.tier
          }
        });
      });
      next();
    };
  }

  trackError() {
    return (err: unknown, req: Request, _res: Response, next: NextFunction) => {
      this.trackException({
        exception: err,
        properties: {
          path: req.path,
          method: req.method,
          userId: req.user?.id
        }
      });
      next(err);
    };
  }

  trackEvent(eventName: string, properties?: Record<string, unknown>) {
    this.client?.trackEvent({ name: eventName, properties });
  }

  trackMetric(name: string, value: number, properties?: Record<string, unknown>) {
    this.client?.trackMetric({ name, value, properties });
  }

  trackDependency(name: string, command: string, duration: number, success: boolean) {
    this.client?.trackDependency({
      name,
      data: command,
      duration,
      success,
      resultCode: success ? '0' : '1',
      dependencyTypeName: 'HTTP'
    });
  }

  trackException(params: { exception: unknown; properties?: Record<string, unknown> }) {
    const error = params.exception instanceof Error ? params.exception : new Error(String(params.exception));
    this.client?.trackException({ exception: error, properties: params.properties });
  }
}

export const monitoring = new MonitoringMiddleware();
