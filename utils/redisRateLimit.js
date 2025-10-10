import redis from "../config/redis.js";
import logger from "./logger.js";

/**
 * Simple Redis-based rate limiter
 * Uses sliding window approach with Redis EXPIRE for automatic cleanup
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    keyGenerator = (req) => `rate_limit:${req.ip}`,
    message = "Too many requests from this IP, please try again later.",
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const windowInSeconds = Math.ceil(windowMs / 1000);

      // Use Redis pipeline for atomic operations
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, windowInSeconds);

      const results = await pipeline.exec();

      if (!results || results.some(([err]) => err)) {
        logger.warn("Redis rate limiter error, allowing request");
        return next();
      }

      const current = results[0][1]; // Get the incremented value

      // Set headers for rate limit info
      res.set({
        "X-RateLimit-Limit": max,
        "X-RateLimit-Remaining": Math.max(0, max - current),
        "X-RateLimit-Reset": new Date(Date.now() + windowMs).toISOString(),
      });

      if (current > max) {
        logger.warn(
          `Rate limit exceeded for key: ${key}, current: ${current}, max: ${max}`
        );

        return res.status(429).json({
          status: "error",
          message,
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      // Skip counting for successful/failed requests if configured
      if (skipSuccessfulRequests && res.statusCode < 400) {
        await redis.decr(key);
      }

      if (skipFailedRequests && res.statusCode >= 400) {
        await redis.decr(key);
      }

      next();
    } catch (error) {
      logger.error("Rate limiter error:", error);
      // Fail open - allow request if Redis is down
      next();
    }
  };
};

/**
 * Pre-configured rate limiters for different use cases
 */
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
});

export const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
});

export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  keyGenerator: (req) =>
    `auth_limit:${req.ip}:${req.body.email || req.body.phone || "unknown"}`,
  message: "Too many authentication attempts, please try again later.",
});
