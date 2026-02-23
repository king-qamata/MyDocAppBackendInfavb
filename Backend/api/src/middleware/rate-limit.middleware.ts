import rateLimit from 'express-rate-limit';

export const rateLimiter = {
  consultationRequest() {
    return rateLimit({
      windowMs: 60 * 1000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many consultation requests, please try again later.' }
    });
  }
};
