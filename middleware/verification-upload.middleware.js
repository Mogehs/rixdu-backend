import multer from "multer";

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter function
const fileFilter = async (req, file, cb) => {
  try {
    // Check if file is an image
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }

    // Additional validation can be added here
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 4, // Maximum 4 files (Emirates ID front, back, business license, and one extra)
  },
});

// Middleware for verification document uploads
export const verificationUpload = upload.fields([
  { name: "emiratesIdFront", maxCount: 1 },
  { name: "emiratesIdBack", maxCount: 1 },
  { name: "businessLicense", maxCount: 1 },
]);

// Error handling middleware for multer errors
export const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum allowed size is 10MB per file.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files uploaded.",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field. Please check the file field names.",
      });
    }
  }

  if (error.message === "Only image files are allowed") {
    return res.status(400).json({
      success: false,
      message: "Only image files are allowed for document verification.",
    });
  }

  // Pass other errors to the global error handler
  next(error);
};
