import logger from "../utils/logger.js";

export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime();

  const initialMemUsage = process.memoryUsage();

  res.on("finish", () => {
    const elapsed = process.hrtime(start);
    const responseTimeMs = (elapsed[0] * 1000 + elapsed[1] / 1e6).toFixed(2);

    const finalMemUsage = process.memoryUsage();

    const memoryIncrease = {
      rss: (finalMemUsage.rss - initialMemUsage.rss) / 1024 / 1024,
      heapTotal:
        (finalMemUsage.heapTotal - initialMemUsage.heapTotal) / 1024 / 1024,
      heapUsed:
        (finalMemUsage.heapUsed - initialMemUsage.heapUsed) / 1024 / 1024,
      external:
        (finalMemUsage.external - initialMemUsage.external) / 1024 / 1024,
    };

    if (responseTimeMs > 500) {
      logger.warn(`Slow request detected: ${req.method} ${req.originalUrl}`, {
        responseTime: `${responseTimeMs}ms`,
        statusCode: res.statusCode,
        memoryIncreaseMB: memoryIncrease,
        user: req.user ? req.user._id : "unauthenticated",
      });
    } else {
      logger.debug(`Request performance: ${req.method} ${req.originalUrl}`, {
        responseTime: `${responseTimeMs}ms`,
        statusCode: res.statusCode,
      });
    }
  });

  next();
};

export default performanceMonitor;
