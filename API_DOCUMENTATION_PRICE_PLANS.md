# Price Plans API Documentation

## Overview

The Price Plans API allows administrators to create and manage pricing plans for premium and featured listings across different categories. The API supports creating, reading, updating, and deleting price plans with various durations and pricing options.

## Base URL

```
/api/v1/price-plans
```

## Authentication

Most endpoints are public for reading, but creating, updating, and deleting price plans requires admin authentication.

## Endpoints

### 1. Health Check

**GET** `/api/v1/price-plans/health`

Returns API status and available endpoints.

**Response:**

```json
{
  "status": "success",
  "message": "Price Plans API is running",
  "version": "1.0",
  "endpoints": { ... },
  "serverTime": "2024-01-01T00:00:00.000Z"
}
```

### 2. Get All Price Plans

**GET** `/api/v1/price-plans`

Get all price plans with optional filtering and pagination.

**Query Parameters:**

- `categoryId` (optional): Filter by category ID
- `storeId` (optional): Filter by store ID
- `planType` (optional): Filter by plan type (`premium` or `featured`)
- `duration` (optional): Filter by duration (7, 14, or 30 days)
- `isActive` (optional): Filter by active status (`true` or `false`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `sort` (optional): Sort field (default: `-createdAt`)

**Response:**

```json
{
  "success": true,
  "count": 10,
  "total": 50,
  "pagination": {
    "page": 1,
    "pages": 3,
    "limit": 20
  },
  "data": [
    {
      "_id": "64a123...",
      "categoryId": {
        "_id": "64a456...",
        "name": "Electronics",
        "slug": "electronics"
      },
      "storeId": {
        "_id": "64a789...",
        "name": "Tech Store",
        "slug": "tech-store"
      },
      "planType": "premium",
      "duration": 7,
      "price": 28,
      "currency": "AED",
      "discountPercentage": 0,
      "discountedPrice": 28,
      "isActive": true,
      "features": [
        "Placed on top of all ads",
        "Get up to 25X more offers",
        "Higher visibility",
        "Priority listing"
      ],
      "description": "Premium ad for 7 days - Get maximum visibility for your listing",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 3. Get Single Price Plan

**GET** `/api/v1/price-plans/:id`

Get a specific price plan by ID.

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "64a123...",
    "categoryId": { ... },
    "storeId": { ... },
    "planType": "premium",
    "duration": 7,
    "price": 28,
    "currency": "AED",
    "features": [...],
    "description": "...",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Get Price Plans for Category

**GET** `/api/v1/price-plans/category/:categoryId`

Get all price plans for a specific category.

**Query Parameters:**

- `isActive` (optional): Filter by active status (default: `true`)

**Response:**

```json
{
  "success": true,
  "count": 6,
  "data": {
    "categoryId": "64a456...",
    "plans": [...],
    "grouped": {
      "premium": [
        {
          "planType": "premium",
          "duration": 7,
          "price": 28
        },
        {
          "planType": "premium",
          "duration": 14,
          "price": 56
        },
        {
          "planType": "premium",
          "duration": 30,
          "price": 112
        }
      ],
      "featured": [
        {
          "planType": "featured",
          "duration": 7,
          "price": 18
        },
        {
          "planType": "featured",
          "duration": 14,
          "price": 36
        },
        {
          "planType": "featured",
          "duration": 30,
          "price": 79
        }
      ]
    }
  }
}
```

### 5. Get Price Plans for Store

**GET** `/api/v1/price-plans/store/:storeId`

Get all price plans for a specific store.

**Query Parameters:**

- `isActive` (optional): Filter by active status (default: `true`)
- `groupByCategory` (optional): Group results by category (`true` or `false`, default: `false`)

### 6. Get Price Plans by Type

**GET** `/api/v1/price-plans/type/:planType`

Get all price plans of a specific type (`premium` or `featured`).

**Query Parameters:**

- `isActive` (optional): Filter by active status (default: `true`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

### 7. Create Price Plan (Admin Only)

**POST** `/api/v1/price-plans`

Create a new price plan.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "categoryId": "64a456...",
  "storeId": "64a789...",
  "planType": "premium",
  "duration": 7,
  "price": 28,
  "currency": "AED",
  "features": ["Placed on top of all ads", "Get up to 25X more offers"],
  "description": "Premium ad for 7 days",
  "discountPercentage": 0,
  "isActive": true
}
```

**Required Fields:**

- `categoryId`: MongoDB ObjectId of the category
- `storeId`: MongoDB ObjectId of the store
- `planType`: Must be `premium` or `featured`
- `duration`: Must be 7, 14, or 30 days
- `price`: Price amount (number)

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "64a123...",
    "categoryId": { ... },
    "storeId": { ... },
    "planType": "premium",
    "duration": 7,
    "price": 28,
    "currency": "AED",
    "features": [...],
    "description": "...",
    "isActive": true,
    "createdBy": { ... },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 8. Update Price Plan (Admin Only)

**PUT** `/api/v1/price-plans/:id`

Update an existing price plan.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** (All fields optional)

```json
{
  "planType": "featured",
  "duration": 14,
  "price": 36,
  "currency": "AED",
  "features": [...],
  "description": "Updated description",
  "discountPercentage": 10,
  "isActive": true
}
```

### 9. Delete Price Plan (Admin Only)

**DELETE** `/api/v1/price-plans/:id`

Delete a price plan.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Price plan deleted successfully"
}
```

### 10. Bulk Create Default Plans (Admin Only)

**POST** `/api/v1/price-plans/bulk-create/:categoryId`

Create default price plans for a category (6 plans total: 3 premium + 3 featured).

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "storeId": "64a789..."
}
```

**Default Plans Created:**

- Premium: 7 days (AED 28), 14 days (AED 56), 30 days (AED 112)
- Featured: 7 days (AED 18), 14 days (AED 36), 30 days (AED 79)

**Response:**

```json
{
  "success": true,
  "message": "Created 6 plans, skipped 0 existing plans",
  "data": {
    "created": [...],
    "skipped": [],
    "summary": {
      "totalCreated": 6,
      "totalSkipped": 0
    }
  }
}
```

### 11. Toggle Price Plan Status (Admin Only)

**PATCH** `/api/v1/price-plans/:id/toggle-status`

Toggle the active status of a price plan.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Price plan activated successfully",
  "data": { ... }
}
```

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "message": "Missing required fields: categoryId, storeId, planType, duration, price"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "message": "User role admin is required to access this route"
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Price plan not found"
}
```

### 500 Server Error

```json
{
  "success": false,
  "message": "Server error creating price plan. Please try again."
}
```

## Usage Examples

### Frontend Integration

```javascript
// Get plans for a category
const fetchCategoryPlans = async (categoryId) => {
  const response = await fetch(`/api/v1/price-plans/category/${categoryId}`);
  const data = await response.json();

  if (data.success) {
    const { premium, featured } = data.data.grouped;
    return { premium, featured };
  }
};

// Create a new plan (admin)
const createPlan = async (planData, token) => {
  const response = await fetch("/api/v1/price-plans", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(planData),
  });

  return await response.json();
};
```

## Model Schema

### PricePlan Model

```javascript
{
  categoryId: ObjectId, // Required - References Category
  storeId: ObjectId,    // Required - References Store
  planType: String,     // Required - 'premium' or 'featured'
  duration: Number,     // Required - 7, 14, or 30 days
  price: Number,        // Required - Price amount
  currency: String,     // Default: 'AED'
  isActive: Boolean,    // Default: true
  features: [String],   // Array of plan features
  description: String,  // Plan description
  discountPercentage: Number, // Default: 0
  discountedPrice: Number,    // Calculated automatically
  createdBy: ObjectId,  // References User (admin)
  updatedBy: ObjectId,  // References User (admin)
  createdAt: Date,
  updatedAt: Date
}
```

## Notes

1. **Unique Constraint**: Each combination of `categoryId`, `planType`, and `duration` must be unique.

2. **Default Features**: Features are automatically set based on plan type if not provided.

3. **Price Calculation**: `discountedPrice` is automatically calculated when `discountPercentage` is set.

4. **Permissions**: Only admin users can create, update, or delete price plans.

5. **Validation**: All required fields are validated, and enum values are enforced.

6. **Indexing**: Database indexes are optimized for common query patterns.
