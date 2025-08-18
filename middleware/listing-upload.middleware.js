import multer from "multer";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/msword" ||
    file.mimetype.includes("spreadsheet") ||
    file.mimetype.includes("document")
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file format. Supported formats: images, PDFs, Word documents, and spreadsheets."
      ),
      false
    );
  }
};

export const uploadFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
});

export const processFileUploads = async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) {
      return next();
    }

    req.body.values = req.body.values || {};

    // Parse the file field mapping sent from frontend
    let fileFieldMapping = {};
    if (req.body.fileFieldMapping) {
      try {
        fileFieldMapping = JSON.parse(req.body.fileFieldMapping);
      } catch (err) {
        console.error("Error parsing file field mapping:", err);
      }
    }

    // Group files by field name using the mapping
    const filesByField = {};

    const filePromises = req.files.map(async (file, index) => {
      // Get the field name from the mapping, or use a default
      const fieldName = fileFieldMapping[index] || `file_${index}`;

      const folder = `listings/${req.body.categoryId || "misc"}`;
      const result = await uploadToCloudinary(file, folder);

      if (result) {
        const fileData = {
          url: result.url,
          public_id: result.public_id,
          originalName: file.originalname,
          mimeType: file.mimetype,
        };

        // Group files by field name
        if (!filesByField[fieldName]) {
          filesByField[fieldName] = [];
        }
        filesByField[fieldName].push(fileData);
      }
    });

    await Promise.all(filePromises);
    Object.entries(filesByField).forEach(([fieldName, files]) => {
      if (files.length === 1) {
        req.body.values[fieldName] = files[0];
      } else {
        req.body.values[fieldName] = files;
      }
    });

    if (
      typeof req.body.values === "object" &&
      !(req.body.values instanceof Map)
    ) {
      try {
        const parsedValues = {};
        for (const [key, value] of Object.entries(req.body.values)) {
          parsedValues[key] =
            typeof value === "string" && value.startsWith("{")
              ? JSON.parse(value)
              : value;
        }
        req.body.values = parsedValues;
      } catch (err) {
        console.error("Error parsing values:", err);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Error handler for multer errors
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 10 files.",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected field name for file upload.",
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "File upload failed.",
    });
  }
  next();
};
