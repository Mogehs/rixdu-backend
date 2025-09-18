import multer from "multer";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import { addImageUploadJob, JOB_TYPES } from "../config/queue.js";

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
    fileSize: 10 * 1024 * 1024, // Increased to 10MB per file
    files: 15, // Increased to 15 files when using queue
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

    // Check if we should use queue processing for images
    const useQueue =
      req.query.useQueue === "true" || req.body.useQueue === "true";
    const imageFiles = req.files.filter((file) =>
      file.mimetype.startsWith("image/")
    );
    const otherFiles = req.files.filter(
      (file) => !file.mimetype.startsWith("image/")
    );

    // If using queue and there are images, prepare them for background processing
    if (useQueue && imageFiles.length > 0) {
      console.log(
        `Queuing ${imageFiles.length} images for background processing`
      );

      // Convert image buffers to base64 for queue storage
      const images = imageFiles.map((file, index) => ({
        buffer: file.buffer.toString("base64"),
        mimeType: file.mimetype,
        originalname: file.originalname,
        fieldIndex: index,
      }));

      // Store image data in request for later queue processing
      req.queuedImages = {
        images,
        fileFieldMapping,
        categoryId: req.body.categoryId,
      };

      // Process only non-image files synchronously
      req.files = otherFiles;
    }

    // Process remaining files (non-images or when not using queue)
    if (req.files.length > 0) {
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
    }

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
        message: "File too large. Maximum size is 10MB.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 15 files.",
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

// Queue image uploads for background processing
export const queueImageUpload = async (listingId, imageData) => {
  try {
    const job = await addImageUploadJob(
      JOB_TYPES.IMAGE_UPLOAD.LISTING_IMAGES,
      {
        listingId,
        images: imageData.images,
        fileFieldMapping: imageData.fileFieldMapping,
        categoryId: imageData.categoryId,
      },
      {
        priority: 1, // High priority for listing images
        delay: 100, // Small delay to ensure listing is saved first
      }
    );

    console.log(`Queued image upload job ${job.id} for listing ${listingId}`);
    return job;
  } catch (error) {
    console.error("Error queuing image upload:", error);
    throw error;
  }
};
