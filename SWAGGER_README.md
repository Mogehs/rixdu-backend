# Swagger API Documentation Guide

## Overview

This project uses **swagger-autogen** to automatically generate comprehensive API documentation with proper categorization and request/response structures.

## Setup & Installation

The required packages are already installed:

- `swagger-autogen` - Automatic Swagger documentation generation
- `swagger-ui-express` - Swagger UI interface

## Generating Documentation

Run the following command to generate/update the Swagger documentation:

```bash
npm run swagger
```

This will:

1. Scan all your routes in `server.js`
2. Generate `swagger-output.json` with complete API documentation
3. Include all request/response schemas defined in `swagger.js`

## Viewing Documentation

Once the server is running, access the interactive Swagger UI at:

```
http://localhost:3001/api-docs
```

Or your production URL:

```
https://your-domain.com/api-docs
```

## Features

### 1. **Categorized Routes**

All API endpoints are organized into logical categories:

- 🔐 Authentication - Login, register, password management
- 👤 User Management - User operations
- 📝 Profiles - Personal, job, and professional profiles
- 🏪 Stores - Store management
- 📂 Categories - Listing categories
- 📋 Listings - Jobs, vehicles, healthcare listings
- ⭐ Ratings & Reviews - User reviews
- 💬 Chat & Messaging - Real-time communication
- 📝 Applications - Job applications
- 🔔 Notifications - Push notifications
- 📅 Bookings - Appointment scheduling
- 🚗 Garages - Automotive services
- 💰 Pricing Plans - Subscription plans
- 💳 Payments - Payment processing
- 📊 Subscriptions - User subscriptions
- ✅ Verification - User verification
- 💳 Stripe - Payment webhooks
- 🔧 Admin - Administrative operations
- 📊 Reports - Analytics

### 2. **Complete Request/Response Structures**

All endpoints include:

- **Request Body Schemas** - Expected input format
- **Response Schemas** - Expected output format
- **Query Parameters** - URL parameters
- **Path Parameters** - Dynamic route segments
- **Headers** - Required headers (Authorization, etc.)

### 3. **Authentication**

Two authentication methods are documented:

- **Bearer Token** - JWT in Authorization header
- **Cookie Auth** - JWT in cookie

### 4. **Data Models**

Comprehensive models are defined for:

- User, Profile, Experience, Education
- Listing, Category, Store
- Booking, Chat, Message
- Payment, Subscription, PricePlan
- Rating, Notification
- Location, Contact (common models)

## Customization

### Updating Host/URL

Edit `swagger.js`:

```javascript
host: 'your-domain.com:port',
basePath: '/api/v1',
schemes: ['https'],
```

### Adding New Routes

Routes are automatically detected from `server.js`. After adding new routes:

1. Run `npm run swagger` to regenerate
2. Restart your server

### Adding Request/Response Documentation

Add JSDoc comments in your route files:

```javascript
router.post(
  "/login",
  /* 
    #swagger.tags = ['Authentication']
    #swagger.description = 'User login endpoint'
    #swagger.parameters['body'] = {
      in: 'body',
      description: 'User credentials',
      required: true,
      schema: { $ref: '#/definitions/LoginRequest' }
    }
    #swagger.responses[200] = {
      description: 'Login successful',
      schema: { $ref: '#/definitions/AuthResponse' }
    }
  */
  login
);
```

### Adding New Models

Edit the `definitions` section in `swagger.js`:

```javascript
definitions: {
  YourModel: {
    type: 'object',
    properties: {
      field1: { type: 'string', example: 'value' },
      field2: { type: 'number', example: 123 },
    },
  },
}
```

## Best Practices

1. **Always regenerate after route changes**

   ```bash
   npm run swagger
   ```

2. **Version your documentation**

   - Keep `swagger-output.json` in git
   - Update version in `swagger.js` when making breaking changes

3. **Document as you code**

   - Add JSDoc comments to new endpoints
   - Update models when schemas change

4. **Test endpoints in Swagger UI**
   - Use the "Try it out" feature
   - Verify request/response formats

## Troubleshooting

### Documentation not updating?

```bash
# Delete old file and regenerate
rm swagger-output.json
npm run swagger
```

### Server not showing Swagger UI?

- Check that `swagger-output.json` exists
- Restart the server
- Check for errors in console

### Routes not appearing?

- Ensure routes are imported in `server.js`
- Check route file exports use `export default`
- Verify routes are mounted with `app.use()`

## Production Deployment

Before deploying:

1. Run `npm run swagger` to ensure documentation is current
2. Update `host` in `swagger.js` to production URL
3. Set appropriate `schemes` (prefer https)
4. Consider protecting `/api-docs` route for internal APIs

## Security Notes

- Swagger UI exposes API structure
- For production, consider:
  - Adding authentication to `/api-docs`
  - Disabling in production: `if (process.env.NODE_ENV !== 'production')`
  - Using API gateway for public docs

## Resources

- [Swagger Specification](https://swagger.io/specification/)
- [swagger-autogen Documentation](https://github.com/davibaltar/swagger-autogen)
- [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express)

## Support

For issues or questions:

- Check the console logs when running `npm run swagger`
- Review `swagger-output.json` for generated documentation
- Consult the swagger-autogen documentation for advanced features
