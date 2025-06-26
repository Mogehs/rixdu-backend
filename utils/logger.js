import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const errorLogPath = path.join(logsDir, "error.log");
const accessLogPath = path.join(logsDir, "access.log");

const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
};

const formatLogMessage = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [${level}] ${message}`;

  if (Object.keys(data).length > 0) {
    try {
      logMessage += ` ${JSON.stringify(data)}`;
    } catch (err) {
      logMessage += ` [Error serializing data: ${err.message}]`;
    }
  }

  return logMessage;
};

const writeToFile = (filePath, message) => {
  fs.appendFile(filePath, message + "\n", (err) => {
    if (err) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  });
};

export const logError = (message, error = {}) => {
  const errorData =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;

  const logMessage = formatLogMessage(LOG_LEVELS.ERROR, message, errorData);

  if (process.env.NODE_ENV !== "production") {
    console.error("\x1b[31m%s\x1b[0m", logMessage);
  }

  writeToFile(errorLogPath, logMessage);
};

export const logWarn = (message, data = {}) => {
  const logMessage = formatLogMessage(LOG_LEVELS.WARN, message, data);

  if (process.env.NODE_ENV !== "production") {
    console.warn("\x1b[33m%s\x1b[0m", logMessage);
  }

  writeToFile(accessLogPath, logMessage);
};

export const logInfo = (message, data = {}) => {
  const logMessage = formatLogMessage(LOG_LEVELS.INFO, message, data);

  if (
    process.env.NODE_ENV !== "production" ||
    process.env.VERBOSE_LOGGING === "true"
  ) {
    console.info("\x1b[36m%s\x1b[0m", logMessage);
  }

  writeToFile(accessLogPath, logMessage);
};

export const logDebug = (message, data = {}) => {
  if (process.env.NODE_ENV !== "production") {
    const logMessage = formatLogMessage(LOG_LEVELS.DEBUG, message, data);
    console.debug("\x1b[90m%s\x1b[0m", logMessage);
  }
};

export const logRequest = (req, res, responseTime) => {
  const data = {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.headers["user-agent"],
    ip:
      req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
  };

  logInfo(`HTTP ${req.method} ${req.originalUrl}`, data);
};

export const httpLogger = (tokens, req, res) => {
  const responseTime = tokens["response-time"](req, res);
  logRequest(req, res, responseTime);
  return null;
};

export default {
  error: logError,
  warn: logWarn,
  info: logInfo,
  debug: logDebug,
  request: logRequest,
  http: httpLogger,
};
