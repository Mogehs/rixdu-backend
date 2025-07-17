import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import process from 'process';

export const protect = async (req, res, next) => {
  try {
    // 🚨 DEVELOPMENT ONLY - Remove in production
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.SKIP_AUTH === 'true'
    ) {
      // Create a mock user for testing
      req.user = {
        id: '60d5ecb74f7d2b2b8c8b4567', // Mock user ID
        _id: '60d5ecb74f7d2b2b8c8b4567',
        name: 'Test User',
        email: 'test@example.com',
      };
      console.log('🚨 Auth bypassed for development testing');
      return next();
    }

    let token;

    console.log('🔐 Auth middleware - Request headers:', {
      authorization: req.headers.authorization
        ? 'Bearer token present'
        : 'No authorization header',
      cookies: req.cookies.token ? 'Cookie token present' : 'No cookie token',
      userAgent: req.headers['user-agent']?.substring(0, 50),
    });

    // First try to get the token from cookies
    if (req.cookies.token) {
      token = req.cookies.token;
      console.log('🔐 Auth middleware - Using cookie token');
    }
    // If not in cookies, check if authorization header exists and starts with Bearer
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Extract token from Bearer token
      token = req.headers.authorization.split(' ')[1];
      console.log('🔐 Auth middleware - Using Bearer token');
    }

    // If no token found, unauthorized
    if (!token) {
      console.log('🔐 Auth middleware - No token found');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token
      console.log('🔐 Auth middleware - Verifying token...');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🔐 Auth middleware - Token decoded:', {
        userId: decoded.id,
        iat: decoded.iat,
        exp: decoded.exp,
      });

      // Get user from token
      req.user = await User.findById(decoded.id);
      console.log(
        '🔐 Auth middleware - User found:',
        req.user ? { id: req.user._id, name: req.user.name } : 'User not found'
      );

      if (!req.user) {
        console.log('🔐 Auth middleware - User not found in database');
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      next();
    } catch (err) {
      console.log(
        '🔐 Auth middleware - Token verification failed:',
        err.message
      );
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }
  } catch (error) {
    console.log('🔐 Auth middleware - General error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Grant access to specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};
