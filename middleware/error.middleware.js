export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
export const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path} - ${err.stack}`);

  err.statusCode = err.statusCode || 500;

  if (process.env.NODE_ENV === "development") {
    sendDevError(err, res);
  } else {
    sendProdError(err, res);
  }
};
const sendDevError = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    error: err,
    stack: err.stack,
  });
};

const sendProdError = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
    });
  } else {
    console.error("ERROR 💥", err);
    res.status(500).json({
      success: false,
      status: "error",
      message: "Something went wrong",
    });
  }
};

// OPTIMIZATION: Handle specific error types
export const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

export const handleDuplicateFieldsDB = (err) => {
  const value = err.message.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value.`;
  return new AppError(message, 400);
};

export const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data: ${errors.join(". ")}`;
  return new AppError(message, 400);
};

export const handleJWTError = () =>
  new AppError("Invalid token. Please log in again.", 401);

export const handleJWTExpiredError = () =>
  new AppError("Your token has expired. Please log in again.", 401);

// OPTIMIZATION: Not Found error handler
export const notFound = (req, res, next) => {
  const error = new AppError(
    `API endpoint not found: ${req.method} ${req.originalUrl}`,
    404
  );
  next(error);
};

// Export default error handler for use in server.js
export default errorHandler;
