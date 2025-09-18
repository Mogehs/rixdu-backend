# Profile API Documentation

## Base URL

`{API_BASE_URL}/api/profile`

## Authentication

All protected endpoints require Bearer token authentication in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

---

## Endpoints Overview

| Method | Endpoint                 | Auth Required | Description                                     |
| ------ | ------------------------ | ------------- | ----------------------------------------------- |
| GET    | `/public/:userId`        | No            | Get public profile of any user                  |
| GET    | `/search`                | No            | Search users by skills                          |
| GET    | `/me`                    | Yes           | Get complete profile of authenticated user      |
| GET    | `/job/:userId?`          | Yes           | Get job profile (own or specific user)          |
| GET    | `/professional/:userId?` | Yes           | Get professional profile (own or specific user) |
| GET    | `/:userId`               | Yes           | Get complete profile of specific user           |
| PUT    | `/personal`              | Yes           | Update personal profile information             |
| PUT    | `/job`                   | Yes           | Update job profile information                  |
| POST   | `/resume/upload`         | Yes           | Upload resume file                              |
| POST   | `/favorites`             | Yes           | Add/Remove from favorites (toggle)              |
| GET    | `/favorites/:userId?`    | Yes           | Get user favorites                              |
| DELETE | `/favorites/:listingId`  | Yes           | Remove specific listing from favorites          |

---

## Data Models

### User Object (from populated user field)

```json
{
  "_id": "string",
  "name": "string",
  "email": "string",
  "phoneNumber": "string",
  "isVerified": "boolean"
}
```

### Personal Profile Object

```json
{
  "profileEmail": "string",
  "profilePhoneNumber": "string",
  "avatar": "string (URL)",
  "avatar_public_id": "string",
  "location": {
    "neighborhood": "string",
    "building": "string",
    "appartment": "string",
    "country": "string",
    "zipCode": "string"
  },
  "bio": "string (max 500 chars)",
  "dateOfBirth": "ISO date string",
  "gender": "male | female | other | prefer not to say",
  "languages": ["string"],
  "visaStatus": "string"
}
```

### Job Profile Object

```json
{
  "qualifications": [
    {
      "degree": "string",
      "fieldOfStudy": "string",
      "institution": "string",
      "startDate": "ISO date string",
      "endDate": "ISO date string"
    }
  ],
  "experience": [
    {
      "jobTitle": "string",
      "company": "string",
      "startDate": "ISO date string",
      "endDate": "ISO date string",
      "description": "string"
    }
  ],
  "skills": ["string"],
  "resume": "string (URL)",
  "resume_public_id": "string",
  "licenses": [
    {
      "name": "string",
      "issuer": "string",
      "dateIssued": "ISO date string"
    }
  ],
  "portfolio": {
    "link": "string",
    "description": "string"
  },
  "references": [
    {
      "name": "string",
      "position": "string",
      "company": "string",
      "email": "string"
    }
  ],
  "digitalProfile": {
    "linkedIn": "string",
    "github": "string",
    "personalWebsite": "string"
  }
}
```

### Public Profile Object

```json
{
  "ads": ["Listing ObjectId"],
  "ratings": ["Rating ObjectId"],
  "jobPosts": ["Listing ObjectId"],
  "applications": ["Listing ObjectId"],
  "appliedFor": ["Listing ObjectId"],
  "receivedApplications": [
    {
      "applicant": {
        "name": "string",
        "email": "string",
        "phoneNumber": "string"
      },
      "job": {
        "values": {
          "title": "string",
          "company": "string"
        },
        "slug": "string"
      },
      "createdAt": "ISO date string"
    }
  ]
}
```

### Favorites Object

```json
{
  "listings": [
    {
      "_id": "string",
      "values": {},
      "images": ["string"],
      "categoryId": {
        "name": "string"
      },
      "createdAt": "ISO date string",
      "updatedAt": "ISO date string"
    }
  ]
}
```

---

## API Endpoints

### 1. Get Public Profile

**GET** `/public/:userId`

Get public profile information for any user (no authentication required).

**Parameters:**

- `userId` (path): User ID to fetch profile for

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "string",
      "name": "string"
    },
    "personal": {
      "avatar": "string",
      "bio": "string",
      "location": {},
      "dateOfBirth": "ISO date string",
      "languages": ["string"],
      "visaStatus": "string"
    },
    "public": {
      "ads": [],
      "jobPosts": [],
      "applications": [],
      "ratings": [],
      "receivedApplications": []
    }
  }
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "Public profile not found"
}
```

### 2. Search Users by Skills

**GET** `/search`

Search for users based on their skills (no authentication required).

**Query Parameters:**

- `skills` (required): Comma-separated list of skills
- `limit` (optional): Number of results to return (default: 10)

**Example:** `/search?skills=React,Node.js,MongoDB&limit=5`

**Response:**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "user": {
        "_id": "string",
        "name": "string"
      },
      "jobProfile": {
        "skills": ["React", "Node.js"],
        "experience": []
      },
      "personal": {
        "profileEmail": "string",
        "profilePhoneNumber": "string",
        "avatar": "string"
      }
    }
  ]
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "Skills are required for search"
}
```

### 3. Get Complete Profile (Self)

**GET** `/me`

Get complete profile of the authenticated user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string",
      "phoneNumber": "string",
      "isVerified": true
    },
    "personal": {
      "profileEmail": "string",
      "profilePhoneNumber": "string",
      "avatar": "string",
      "location": {},
      "bio": "string",
      "dateOfBirth": "ISO date string",
      "gender": "string",
      "languages": ["string"],
      "visaStatus": "string"
    },
    "jobProfile": {
      "qualifications": [],
      "experience": [],
      "skills": [],
      "resume": "string",
      "licenses": [],
      "portfolio": {},
      "references": [],
      "digitalProfile": {}
    },
    "public": {},
    "favorites": {
      "listings": []
    }
  }
}
```

### 4. Get Job Profile

**GET** `/job/:userId?`

Get job profile information. If no userId provided, returns authenticated user's job profile.

**Headers:**

```
Authorization: Bearer <token>
```

**Parameters:**

- `userId` (optional, path): Specific user ID

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string",
      "phoneNumber": "string"
    },
    "jobProfile": {
      "qualifications": [],
      "experience": [],
      "skills": [],
      "resume": "string",
      "licenses": [],
      "portfolio": {},
      "references": [],
      "digitalProfile": {}
    },
    "personal": {
      "avatar": "string",
      "bio": "string",
      "dateOfBirth": "ISO date string",
      "gender": "string",
      "languages": ["string"],
      "location": {},
      "visaStatus": "string",
      "profileEmail": "string",
      "profilePhoneNumber": "string"
    }
  }
}
```

### 5. Get Professional Profile

**GET** `/professional/:userId?`

Get professional profile with digital links. If no userId provided, returns authenticated user's professional profile.

**Headers:**

```
Authorization: Bearer <token>
```

**Parameters:**

- `userId` (optional, path): Specific user ID

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string"
    },
    "personal": {
      "profileEmail": "string",
      "profilePhoneNumber": "string",
      "avatar": "string"
    },
    "jobProfile": {
      "skills": ["string"],
      "experience": [],
      "qualifications": [],
      "digitalProfile": {
        "linkedIn": "string",
        "github": "string",
        "personalWebsite": "string"
      }
    }
  }
}
```

### 6. Update Personal Profile

**PUT** `/personal`

Update personal profile information. Supports file upload for avatar.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (Form Data):**

- `avatar` (file, optional): Image file for profile avatar
- `profileEmail` (string, optional): Profile email address
- `profilePhoneNumber` (string, optional): Profile phone number
- `bio` (string, optional): User bio (max 500 characters)
- `dateOfBirth` (string, optional): ISO date string
- `gender` (string, optional): "male" | "female" | "other" | "prefer not to say"
- `languages` (string/array, optional): Languages (comma-separated string or JSON array)
- `visaStatus` (string, optional): Visa status
- `location` (object, optional): Location object with neighborhood, building, apartment, country, zipCode

**Example Body:**

```json
{
  "profileEmail": "john@example.com",
  "profilePhoneNumber": "+1234567890",
  "bio": "Software developer with 5 years experience",
  "dateOfBirth": "1990-01-15T00:00:00.000Z",
  "gender": "male",
  "languages": ["English", "Spanish"],
  "visaStatus": "H1B",
  "location": {
    "neighborhood": "Downtown",
    "building": "Tech Tower",
    "appartment": "12A",
    "country": "USA",
    "zipCode": "12345"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "profileEmail": "john@example.com",
    "profilePhoneNumber": "+1234567890",
    "avatar": "https://cloudinary.com/avatar-url",
    "bio": "Software developer with 5 years experience",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "gender": "male",
    "languages": ["English", "Spanish"],
    "visaStatus": "H1B",
    "location": {
      "neighborhood": "Downtown",
      "building": "Tech Tower",
      "appartment": "12A",
      "country": "USA",
      "zipCode": "12345"
    }
  }
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "Invalid email format for profile email"
}
```

### 7. Update Job Profile

**PUT** `/job`

Update job profile information. Supports file upload for resume.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (Form Data):**

- `resume` (file, optional): Resume file (PDF, DOC, DOCX)
- `qualifications` (array, optional): Array of qualification objects
- `experience` (array, optional): Array of experience objects
- `skills` (array, optional): Array of skill strings
- `licenses` (array, optional): Array of license objects
- `portfolio` (object, optional): Portfolio object with link and description
- `references` (array, optional): Array of reference objects
- `digitalProfile` (object, optional): Digital profile links

**Example Body:**

```json
{
  "qualifications": [
    {
      "degree": "Bachelor's",
      "fieldOfStudy": "Computer Science",
      "institution": "MIT",
      "startDate": "2018-09-01T00:00:00.000Z",
      "endDate": "2022-05-15T00:00:00.000Z"
    }
  ],
  "experience": [
    {
      "jobTitle": "Software Engineer",
      "company": "Tech Corp",
      "startDate": "2022-06-01T00:00:00.000Z",
      "endDate": "2024-01-15T00:00:00.000Z",
      "description": "Developed web applications using React and Node.js"
    }
  ],
  "skills": ["React", "Node.js", "MongoDB", "JavaScript"],
  "licenses": [
    {
      "name": "AWS Certified",
      "issuer": "Amazon",
      "dateIssued": "2023-03-15T00:00:00.000Z"
    }
  ],
  "portfolio": {
    "link": "https://johnportfolio.com",
    "description": "My web development portfolio"
  },
  "references": [
    {
      "name": "Jane Manager",
      "position": "Senior Manager",
      "company": "Tech Corp",
      "email": "jane@techcorp.com"
    }
  ],
  "digitalProfile": {
    "linkedIn": "https://linkedin.com/in/john",
    "github": "https://github.com/john",
    "personalWebsite": "https://john.dev"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "qualifications": [],
    "experience": [],
    "skills": [],
    "resume": "https://cloudinary.com/resume-url",
    "licenses": [],
    "portfolio": {},
    "references": [],
    "digitalProfile": {}
  }
}
```

### 8. Upload Resume

**POST** `/resume/upload`

Upload resume file separately.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (Form Data):**

- `resume` (file, required): Resume file (PDF, DOC, DOCX)

**Response:**

```json
{
  "success": true,
  "data": {
    "resume": "https://cloudinary.com/resume-url"
  }
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "No resume file provided"
}
```

### 9. Add/Remove Favorites (Toggle)

**POST** `/favorites`

Add or remove a listing from favorites. This endpoint toggles the favorite status.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**

```json
{
  "listingId": "string (required)"
}
```

**Response (Added):**

```json
{
  "success": true,
  "message": "Added to favorites successfully",
  "status": "added",
  "listingId": "string"
}
```

**Response (Removed):**

```json
{
  "success": true,
  "message": "Removed from favorites successfully",
  "status": "removed",
  "listingId": "string"
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "Listing ID is required"
}
```

### 10. Get User Favorites

**GET** `/favorites/:userId?`

Get favorites for authenticated user or specific user.

**Headers:**

```
Authorization: Bearer <token>
```

**Parameters:**

- `userId` (optional, path): Specific user ID

**Response:**

```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "string",
      "values": {},
      "images": ["string"],
      "categoryId": {
        "_id": "string",
        "name": "string"
      },
      "createdAt": "ISO date string",
      "updatedAt": "ISO date string"
    }
  ]
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "Invalid user ID format"
}
```

### 11. Remove from Favorites

**DELETE** `/favorites/:listingId`

Remove a specific listing from favorites.

**Headers:**

```
Authorization: Bearer <token>
```

**Parameters:**

- `listingId` (path, required): Listing ID to remove

**Response:**

```json
{
  "success": true,
  "message": "Removed from favorites successfully"
}
```

**Error Responses:**

```json
{
  "success": false,
  "message": "Profile not found"
}
```

---

## Error Handling

All endpoints return consistent error responses:

### Standard Error Response

```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors, missing required fields)
- `401` - Unauthorized (invalid or missing token)
- `404` - Not Found (profile/resource not found)
- `500` - Internal Server Error

### Validation Errors

**Email Validation:**

- Must be valid email format
- Returns: "Invalid email format for profile email"

**Phone Number Validation:**

- Must be 7-20 characters
- Can contain digits, spaces, hyphens, parentheses, and plus sign
- Returns: "Invalid phone number format for profile phone number"

**Bio Validation:**

- Maximum 500 characters
- Returns: "Bio cannot be more than 500 characters"

**File Upload Validation:**

- Avatar: Image files only
- Resume: PDF, DOC, DOCX files only

---

## File Upload Guidelines

### Avatar Upload

- **Supported formats:** JPG, JPEG, PNG, GIF
- **Max file size:** 5MB (recommended)
- **Recommended dimensions:** 400x400px
- **Field name:** `avatar`

### Resume Upload

- **Supported formats:** PDF, DOC, DOCX
- **Max file size:** 10MB (recommended)
- **Field name:** `resume`

### Upload Process

1. Use `multipart/form-data` content type
2. Include file in form data with correct field name
3. Other fields can be included in same request
4. File URLs are returned in response

---

## Flutter Integration Examples

### 1. Get User Profile

```dart
Future<Map<String, dynamic>?> getUserProfile() async {
  try {
    final response = await http.get(
      Uri.parse('$baseUrl/api/profile/me'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return data['data'];
    }
    return null;
  } catch (e) {
    print('Error fetching profile: $e');
    return null;
  }
}
```

### 2. Update Personal Profile with Avatar

```dart
Future<bool> updatePersonalProfile({
  File? avatarFile,
  String? profileEmail,
  String? bio,
  // ... other fields
}) async {
  try {
    var request = http.MultipartRequest(
      'PUT',
      Uri.parse('$baseUrl/api/profile/personal'),
    );

    // Add headers
    request.headers['Authorization'] = 'Bearer $token';

    // Add file if provided
    if (avatarFile != null) {
      request.files.add(
        await http.MultipartFile.fromPath('avatar', avatarFile.path),
      );
    }

    // Add text fields
    if (profileEmail != null) {
      request.fields['profileEmail'] = profileEmail;
    }
    if (bio != null) {
      request.fields['bio'] = bio;
    }

    final response = await request.send();
    return response.statusCode == 200;
  } catch (e) {
    print('Error updating profile: $e');
    return false;
  }
}
```

### 3. Add to Favorites

```dart
Future<String?> toggleFavorite(String listingId) async {
  try {
    final response = await http.post(
      Uri.parse('$baseUrl/api/profile/favorites'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: json.encode({'listingId': listingId}),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return data['status']; // 'added' or 'removed'
    }
    return null;
  } catch (e) {
    print('Error toggling favorite: $e');
    return null;
  }
}
```

### 4. Search Users by Skills

```dart
Future<List<dynamic>> searchUsersBySkills(List<String> skills, {int limit = 10}) async {
  try {
    final skillsQuery = skills.join(',');
    final response = await http.get(
      Uri.parse('$baseUrl/api/profile/search?skills=$skillsQuery&limit=$limit'),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return data['data'] ?? [];
    }
    return [];
  } catch (e) {
    print('Error searching users: $e');
    return [];
  }
}
```

---

## Additional Notes

1. **Authentication Token:** Include Bearer token in all protected endpoints
2. **File Uploads:** Use multipart/form-data for endpoints that accept files
3. **Date Formats:** All dates should be in ISO 8601 format
4. **Arrays in Form Data:** When sending arrays in form data, you may need to JSON.stringify them or send as comma-separated strings
5. **Error Handling:** Always check the `success` field in responses
6. **Rate Limiting:** Be mindful of API rate limits (if implemented)
7. **Cloudinary URLs:** Avatar and resume URLs are hosted on Cloudinary and are publicly accessible

For any questions or issues, please contact the backend development team.
