# Verification API Documentation

## Overview

The verification system allows users to submit documents for identity verification. There are two types of verification:

1. **Individual Verification**: Requires UAE contact number and valid Emirates ID
2. **Business Verification**: Requires UAE contact number, Emirates ID, and valid Business License

## API Endpoints

### User Endpoints

#### 1. Submit Verification Documents

**POST** `/api/v1/verification/submit`

**Headers:**

- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**

- `verificationType`: "individual" or "business" (required)
- `contactNumber`: UAE phone number (required)
- `emiratesIdNumber`: Emirates ID number (required)
- `emiratesIdFront`: Emirates ID front image file (required)
- `emiratesIdBack`: Emirates ID back image file (required)
- `businessLicenseNumber`: Business license number (required for business type)
- `businessName`: Business name (required for business type)
- `businessLicense`: Business license image file (required for business type)

**Response:**

```json
{
  "success": true,
  "message": "Verification documents submitted successfully. Your documents are under review.",
  "data": {
    "status": "pending",
    "type": "individual",
    "submittedAt": "2025-10-10T12:00:00.000Z"
  }
}
```

#### 2. Get Verification Status

**GET** `/api/v1/verification/status`

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "verified",
    "type": "individual",
    "submittedAt": "2025-10-10T12:00:00.000Z",
    "verifiedAt": "2025-10-10T14:00:00.000Z",
    "rejectedAt": null,
    "rejectionReason": null,
    "canSubmit": false,
    "isVerified": true
  }
}
```

### Admin Endpoints

#### 3. Get Pending Verifications

**GET** `/api/v1/verification/pending`

**Headers:**

- `Authorization: Bearer <admin_token>`

**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response:**

```json
{
  "success": true,
  "count": 5,
  "total": 50,
  "pagination": {
    "page": 1,
    "pages": 3,
    "limit": 20,
    "hasMore": true
  },
  "data": [
    {
      "_id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "phoneNumber": "+971501234567",
      "documentVerification": {
        "status": "pending",
        "type": "individual",
        "submittedAt": "2025-10-10T12:00:00.000Z"
      }
    }
  ]
}
```

#### 4. Review Verification (Approve/Reject)

**PUT** `/api/v1/verification/review/:userId`

**Headers:**

- `Authorization: Bearer <admin_token>`
- `Content-Type: application/json`

**Body:**

```json
{
  "action": "approve", // or "reject"
  "rejectionReason": "Invalid document" // required only when rejecting
}
```

**Response:**

```json
{
  "success": true,
  "message": "Verification approved successfully",
  "data": {
    "userId": "user_id",
    "status": "verified",
    "verifiedAt": "2025-10-10T14:00:00.000Z",
    "rejectedAt": null,
    "rejectionReason": null
  }
}
```

#### 5. Get Verification Details

**GET** `/api/v1/verification/details/:userId`

**Headers:**

- `Authorization: Bearer <admin_token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "phoneNumber": "+971501234567",
    "documentVerification": {
      "status": "pending",
      "type": "individual",
      "documents": {
        "emiratesId": {
          "frontImage": "https://cloudinary.com/image1.jpg",
          "backImage": "https://cloudinary.com/image2.jpg",
          "idNumber": "784-1234-1234567-1"
        }
      },
      "contactNumber": "+971501234567",
      "submittedAt": "2025-10-10T12:00:00.000Z",
      "reviewedBy": null
    }
  }
}
```

#### 6. Get User Verification Statistics

**GET** `/api/v1/users/verification-stats`

**Headers:**

- `Authorization: Bearer <admin_token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "unverified": 100,
    "pending": 25,
    "verified": 150,
    "rejected": 10,
    "total": 285
  }
}
```

## Status Values

- `unverified`: User has not submitted any verification documents
- `pending`: Documents submitted and under review
- `verified`: Documents approved by admin
- `rejected`: Documents rejected by admin

## File Upload Requirements

- **File Types**: Only image files (JPEG, PNG, GIF, WebP, etc.)
- **File Size**: Maximum 10MB per file
- **Total Files**: Maximum 4 files per request

## UAE Phone Number Format

Valid formats:

- `+971501234567`
- `971501234567`
- `0501234567`

## Error Responses

All endpoints may return these error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common error status codes:

- `400`: Bad Request (validation errors, invalid data)
- `401`: Unauthorized (invalid or missing token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found (resource not found)
- `500`: Internal Server Error
