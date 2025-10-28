import swaggerAutogen from "swagger-autogen";

const swaggerGenerator = swaggerAutogen();

const doc = {
  info: {
    version: "1.0.0",
    title: "Rixdu API",
    description:
      "Comprehensive API documentation for Rixdu platform - A multi-service marketplace including jobs, vehicles, healthcare, and more.",
    contact: {
      name: "API Support",
      email: "support@rixdu.com",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  host: "rixdu-backend.onrender.com",
  basePath: "/api/v1",
  schemes: ["http", "https"],
  consumes: ["application/json", "multipart/form-data"],
  produces: ["application/json"],
  tags: [
    {
      name: "Authentication",
      description: "User authentication and authorization endpoints",
    },
    {
      name: "User Management",
      description: "User account and profile management",
    },
    {
      name: "Profiles",
      description:
        "User profile operations including personal, job, and professional profiles",
    },
    {
      name: "Stores",
      description: "Store management and operations",
    },
    {
      name: "Categories",
      description: "Category management for listings",
    },
    {
      name: "Listings",
      description:
        "Listing creation, retrieval, and management across different categories",
    },
    {
      name: "Ratings & Reviews",
      description: "Rating and review system for listings and users",
    },
    {
      name: "Chat & Messaging",
      description: "Real-time chat and messaging functionality",
    },
    {
      name: "Applications",
      description: "Job and service applications",
    },
    {
      name: "Notifications",
      description: "Push notifications and notification preferences",
    },
    {
      name: "Bookings",
      description: "Booking and appointment management",
    },
    {
      name: "Garages",
      description: "Garage and automotive service management",
    },
    {
      name: "Pricing Plans",
      description: "Subscription and pricing plan management",
    },
    {
      name: "Payments",
      description: "Payment processing and transaction management",
    },
    {
      name: "Subscriptions",
      description: "User subscription management",
    },
    {
      name: "Verification",
      description: "User and business verification processes",
    },
    {
      name: "Stripe",
      description: "Stripe payment integration and webhooks",
    },
    {
      name: "Admin",
      description: "Administrative operations and dashboard",
    },
    {
      name: "Reports",
      description: "Reporting and analytics",
    },
  ],
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      description:
        'JWT Authorization header using the Bearer scheme. Example: "Bearer {token}"',
    },
    cookieAuth: {
      type: "apiKey",
      name: "token",
      in: "cookie",
      description: "JWT token stored in cookie",
    },
  },
  definitions: {
    // Authentication Models
    User: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        name: { type: "string", example: "John Doe" },
        email: { type: "string", format: "email", example: "john@example.com" },
        phone: { type: "string", example: "+1234567890" },
        role: {
          type: "string",
          enum: ["user", "admin", "vendor"],
          example: "user",
        },
        isVerified: { type: "boolean", example: true },
        avatar: {
          type: "string",
          format: "uri",
          example: "https://cloudinary.com/avatar.jpg",
        },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    LoginRequest: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email", example: "user@example.com" },
        password: {
          type: "string",
          format: "password",
          example: "SecurePassword123!",
        },
      },
    },
    RegisterRequest: {
      type: "object",
      required: ["name", "email", "password", "phone"],
      properties: {
        name: { type: "string", example: "John Doe" },
        email: { type: "string", format: "email", example: "user@example.com" },
        password: {
          type: "string",
          format: "password",
          example: "SecurePassword123!",
        },
        phone: { type: "string", example: "+1234567890" },
        verificationCode: { type: "string", example: "123456" },
      },
    },
    AuthResponse: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        token: {
          type: "string",
          example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        },
        user: { $ref: "#/definitions/User" },
      },
    },

    // Profile Models
    Profile: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        user: { type: "string", example: "507f1f77bcf86cd799439011" },
        bio: {
          type: "string",
          example: "Professional developer with 5 years experience",
        },
        skills: {
          type: "array",
          items: { type: "string" },
          example: ["JavaScript", "React", "Node.js"],
        },
        experience: {
          type: "array",
          items: { $ref: "#/definitions/Experience" },
        },
        education: {
          type: "array",
          items: { $ref: "#/definitions/Education" },
        },
        resume: { type: "string", format: "uri" },
        location: { $ref: "#/definitions/Location" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    Experience: {
      type: "object",
      properties: {
        title: { type: "string", example: "Senior Developer" },
        company: { type: "string", example: "Tech Corp" },
        startDate: { type: "string", format: "date" },
        endDate: { type: "string", format: "date" },
        current: { type: "boolean", example: false },
        description: { type: "string" },
      },
    },
    Education: {
      type: "object",
      properties: {
        institution: { type: "string", example: "University of Technology" },
        degree: { type: "string", example: "Bachelor of Science" },
        field: { type: "string", example: "Computer Science" },
        startDate: { type: "string", format: "date" },
        endDate: { type: "string", format: "date" },
      },
    },

    // Listing Models
    Listing: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        title: { type: "string", example: "2020 Toyota Camry" },
        description: {
          type: "string",
          example: "Well maintained vehicle in excellent condition",
        },
        category: { $ref: "#/definitions/Category" },
        store: { type: "string", example: "507f1f77bcf86cd799439011" },
        price: { type: "number", example: 25000 },
        images: { type: "array", items: { type: "string", format: "uri" } },
        location: { $ref: "#/definitions/Location" },
        status: {
          type: "string",
          enum: ["active", "inactive", "sold", "pending"],
          example: "active",
        },
        views: { type: "number", example: 150 },
        featured: { type: "boolean", example: false },
        createdBy: { $ref: "#/definitions/User" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    CreateListingRequest: {
      type: "object",
      required: ["title", "description", "category", "price"],
      properties: {
        title: { type: "string", example: "2020 Toyota Camry" },
        description: { type: "string", example: "Well maintained vehicle" },
        category: { type: "string", example: "507f1f77bcf86cd799439011" },
        store: { type: "string", example: "507f1f77bcf86cd799439011" },
        price: { type: "number", example: 25000 },
        files: { type: "array", items: { type: "string", format: "binary" } },
        location: { $ref: "#/definitions/Location" },
      },
    },

    // Category Models
    Category: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        name: { type: "string", example: "Vehicles" },
        slug: { type: "string", example: "vehicles" },
        description: { type: "string", example: "All vehicle listings" },
        icon: { type: "string", format: "uri" },
        parent: { type: "string", example: "507f1f77bcf86cd799439011" },
        order: { type: "number", example: 1 },
        isActive: { type: "boolean", example: true },
      },
    },

    // Store Models
    Store: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        name: { type: "string", example: "Auto Dealership" },
        slug: { type: "string", example: "auto-dealership" },
        description: { type: "string" },
        owner: { $ref: "#/definitions/User" },
        logo: { type: "string", format: "uri" },
        banner: { type: "string", format: "uri" },
        location: { $ref: "#/definitions/Location" },
        contact: { $ref: "#/definitions/Contact" },
        rating: { type: "number", minimum: 0, maximum: 5, example: 4.5 },
        isVerified: { type: "boolean", example: true },
        status: {
          type: "string",
          enum: ["active", "inactive", "suspended"],
          example: "active",
        },
      },
    },

    // Booking Models
    Booking: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        listing: { $ref: "#/definitions/Listing" },
        user: { $ref: "#/definitions/User" },
        date: { type: "string", format: "date-time" },
        time: { type: "string", example: "10:00 AM" },
        status: {
          type: "string",
          enum: ["pending", "confirmed", "cancelled", "completed"],
          example: "pending",
        },
        notes: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
      },
    },

    // Chat & Message Models
    Chat: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        participants: { type: "array", items: { $ref: "#/definitions/User" } },
        lastMessage: { $ref: "#/definitions/Message" },
        unreadCount: { type: "object" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    Message: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        chat: { type: "string", example: "507f1f77bcf86cd799439011" },
        sender: { $ref: "#/definitions/User" },
        content: {
          type: "string",
          example: "Hello, is this item still available?",
        },
        type: {
          type: "string",
          enum: ["text", "image", "file"],
          example: "text",
        },
        read: { type: "boolean", example: false },
        createdAt: { type: "string", format: "date-time" },
      },
    },

    // Payment & Subscription Models
    Payment: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        user: { $ref: "#/definitions/User" },
        amount: { type: "number", example: 99.99 },
        currency: { type: "string", example: "USD" },
        status: {
          type: "string",
          enum: ["pending", "completed", "failed", "refunded"],
          example: "completed",
        },
        paymentMethod: { type: "string", example: "stripe" },
        transactionId: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    Subscription: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        user: { $ref: "#/definitions/User" },
        plan: { $ref: "#/definitions/PricePlan" },
        status: {
          type: "string",
          enum: ["active", "cancelled", "expired"],
          example: "active",
        },
        startDate: { type: "string", format: "date-time" },
        endDate: { type: "string", format: "date-time" },
        autoRenew: { type: "boolean", example: true },
      },
    },
    PricePlan: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        name: { type: "string", example: "Premium Plan" },
        description: { type: "string" },
        price: { type: "number", example: 29.99 },
        duration: { type: "number", example: 30 },
        features: { type: "array", items: { type: "string" } },
        isActive: { type: "boolean", example: true },
      },
    },

    // Rating Models
    Rating: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        listing: { type: "string", example: "507f1f77bcf86cd799439011" },
        user: { $ref: "#/definitions/User" },
        rating: { type: "number", minimum: 1, maximum: 5, example: 5 },
        review: { type: "string", example: "Excellent service!" },
        createdAt: { type: "string", format: "date-time" },
      },
    },

    // Notification Models
    Notification: {
      type: "object",
      properties: {
        _id: { type: "string", example: "507f1f77bcf86cd799439011" },
        user: { type: "string", example: "507f1f77bcf86cd799439011" },
        title: { type: "string", example: "New Message" },
        message: {
          type: "string",
          example: "You have a new message from John",
        },
        type: { type: "string", example: "message" },
        read: { type: "boolean", example: false },
        data: { type: "object" },
        createdAt: { type: "string", format: "date-time" },
      },
    },

    // Common Models
    Location: {
      type: "object",
      properties: {
        address: { type: "string", example: "123 Main St" },
        city: { type: "string", example: "New York" },
        state: { type: "string", example: "NY" },
        country: { type: "string", example: "USA" },
        zipCode: { type: "string", example: "10001" },
        coordinates: {
          type: "object",
          properties: {
            lat: { type: "number", example: 40.7128 },
            lng: { type: "number", example: -74.006 },
          },
        },
      },
    },
    Contact: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        phone: { type: "string" },
        website: { type: "string", format: "uri" },
      },
    },

    // Response Models
    SuccessResponse: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        message: {
          type: "string",
          example: "Operation completed successfully",
        },
        data: { type: "object" },
      },
    },
    ErrorResponse: {
      type: "object",
      properties: {
        success: { type: "boolean", example: false },
        error: { type: "string", example: "Error message" },
        message: { type: "string", example: "Detailed error description" },
        statusCode: { type: "number", example: 400 },
      },
    },
    PaginatedResponse: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        data: { type: "array", items: { type: "object" } },
        pagination: {
          type: "object",
          properties: {
            page: { type: "number", example: 1 },
            limit: { type: "number", example: 10 },
            totalPages: { type: "number", example: 5 },
            totalResults: { type: "number", example: 50 },
            hasNextPage: { type: "boolean", example: true },
            hasPrevPage: { type: "boolean", example: false },
          },
        },
      },
    },
  },
};

const outputFile = "./swagger-output.json";
const routes = ["./server.js"];

// Generate Swagger documentation
swaggerGenerator(outputFile, routes, doc)
  .then(() => {
    console.log("✅ Swagger documentation generated successfully!");
    console.log(`📄 Output file: ${outputFile}`);
  })
  .catch((error) => {
    console.error("❌ Error generating Swagger documentation:", error);
  });
