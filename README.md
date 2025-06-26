# Rixdu Backend

Backend API for Rixdu multi-purpose marketplace application, optimized for high traffic and scalability.

## Tech Stack

- Node.js & Express
- MongoDB with Mongoose
- JWT Authentication
- Cloudinary (image storage)
- Multer (file handling)

## Optimization Features

### High Performance & Scalability

- **Node.js Clustering**: Utilizes all available CPU cores
- **Response Compression**: Reduces bandwidth usage and improves load times
- **In-Memory Caching**: Speeds up frequently requested data
- **MongoDB Connection Pooling**: Optimized for concurrent database operations
- **Rate Limiting**: Prevents API abuse

### Reliability & Resilience

- **Graceful Error Handling**: Centralized error processing
- **Worker Process Management**: Auto-restart of crashed workers
- **Database Connection Monitoring**: Auto-reconnect on MongoDB disconnections
- **Request Timeout Handling**: Prevents hanging connections
- **Graceful Shutdown**: Proper cleanup when server stops

### Security

- **Helmet.js Security Headers**: Protection from common web vulnerabilities
- **Improved CORS Configuration**: Precise control of cross-origin requests
- **Request Size Limits**: Protection from payload-based attacks
- **Sanitized Error Responses**: Prevents leaking sensitive information

### Monitoring & Observability

- **Custom Logging System**: Structured logs with proper log levels
- **Performance Metrics**: Tracking of slow requests and resource usage
- **Health Check Endpoint**: For monitoring system status
- **Database Status Monitoring**: Real-time MongoDB connection state

## Core Features

- User authentication (register, login, profile management)
- Store management
- Category management with hierarchical structure
- Field management for dynamic forms
- Listing management with filtering and search

## Project Structure

```
backend/
├── config/              # Configuration files
│   ├── cloudinary.js    # Cloudinary setup
│   ├── dataUri.js       # Data URI conversion for file uploads
│   └── db.js            # Database connection (optimized)
├── controllers/         # Route controllers
│   ├── auth.controller.js
│   ├── category.controller.js
│   ├── listing.controller.js
│   ├── store.controller.js
│   └── user.controller.js
├── logs/                # Application logs directory
├── middleware/          # Custom middleware functions
│   ├── auth.middleware.js  # Authentication middleware
│   ├── cache.middleware.js # Caching middleware (new)
│   ├── error.middleware.js # Error handling middleware (new)
│   ├── multer.middleware.js  # File upload middleware
│   └── performance.middleware.js # Performance monitoring (new)
├── models/              # Database models
│   ├── Category.js
│   ├── Listing.js
│   ├── Store.js
│   └── User.js
├── routes/              # API routes
│   ├── auth.routes.js
│   ├── category.routes.js
│   ├── listing.routes.js
│   ├── store.routes.js
│   └── user.routes.js
├── scripts/             # Utility scripts
│   └── update.js        # Dependency update script
├── utils/               # Utility functions
│   ├── cache.js         # In-memory caching (new)
│   └── logger.js        # Custom logger (new)
└── server.js            # Entry point (optimized)
```

## Setup

1. Install dependencies:

```
npm install
```

2. Configure environment:
   Create a `.env` file with the following variables:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rixdu
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=30d
NODE_ENV=development
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
CLIENT_URL=http://localhost:3000
```

3. Run the server:

```
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get logged in user information
- `GET /api/auth/logout` - Logout user

### Users

- `GET /api/users` - Get all users (Admin)
- `POST /api/users` - Create a new user (Admin)
- `GET /api/users/:id` - Get a specific user
- `PUT /api/users/:id` - Update a user
- `DELETE /api/users/:id` - Delete a user
- `PUT /api/users/profile` - Update logged-in user's profile

### Stores

- `GET /api/stores` - Get all stores
- `POST /api/stores` - Create a new store (Admin)
- `GET /api/stores/:idOrSlug` - Get a specific store
- `PUT /api/stores/:id` - Update a store (Admin)
- `DELETE /api/stores/:id` - Delete a store (Admin)

### Categories

- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create a new category (Admin)
- `GET /api/categories/:idOrSlug` - Get a specific category
- `PUT /api/categories/:id` - Update a category (Admin)
- `DELETE /api/categories/:id` - Delete a category (Admin)
- `GET /api/categories/tree/:storeId` - Get category tree for a store
- `GET /api/categories/path/:id` - Get category path (breadcrumbs)

### Listings

- `GET /api/listings` - Get all listings
- `POST /api/listings` - Create a new listing (User)
- `GET /api/listings/:id` - Get a specific listing
- `PUT /api/listings/:id` - Update a listing (Owner/Admin)
- `DELETE /api/listings/:id` - Delete a listing (Owner/Admin)
- `GET /api/listings/user` - Get listings by logged-in user
- `GET /api/listings/search` - Search listings with dynamic field filtering

## Dynamic Field System

The category model supports dynamic fields with various types:

- text
- number
- select (dropdown)
- date
- checkbox
- file
- image

Each field can be configured with:

- Required/optional status
- Custom label
- Options (for select fields)
- File restrictions (for file/image fields)

## Authentication

Authentication uses JWT tokens stored in HTTP-only cookies for security. Protected routes require authentication, and certain routes have role-based authorization.

## Error Handling

The API returns standardized error responses:

```json
{
  "success": false,
  "message": "Error message here"
}
```

Success responses follow this structure:

```json
{
  "success": true,
  "data": { ... }
}
```

## Monitoring & Health Check

- `GET /api/health` - Returns server status and health metrics including:
  - Database connection status
  - Memory usage
  - Server uptime
  - Current timestamp

## Production Deployment

For production deployment, make sure to:

1. Set `NODE_ENV=production` in your environment
2. Use a proper process manager like PM2
3. Set up proper monitoring with tools like New Relic, Datadog, or Prometheus
4. Configure appropriate log rotation
5. Scale horizontally by deploying multiple instances behind a load balancer
