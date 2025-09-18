import { Worker } from "bullmq";
import { JOB_TYPES } from "../config/queue.js";
import redis from "../config/redis.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import Listing from "../models/Listing.js";
import { Buffer } from "buffer";

const processListingImages = async (job) => {
  const { listingId, images, fileFieldMapping, categoryId } = job.data;

  try {
    // Update job progress
    await job.updateProgress(10);

    console.log(`Processing ${images.length} images for listing ${listingId}`);

    const folder = `listings/${categoryId || "misc"}`;
    const uploadedFiles = {};
    const totalImages = images.length;

    // Process images in batches of 3 for better performance
    const batchSize = 3;
    const batches = [];

    for (let i = 0; i < images.length; i += batchSize) {
      batches.push(images.slice(i, i + batchSize));
    }

    let processedCount = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (imageData, batchIndex) => {
        const globalIndex = processedCount + batchIndex;
        const fieldName =
          fileFieldMapping[globalIndex] || `image_${globalIndex}`;

        try {
          // Convert base64 back to buffer if needed
          let fileBuffer;
          let mimeType = imageData.mimeType;
          let originalname = imageData.originalname;

          if (imageData.buffer) {
            fileBuffer = Buffer.from(imageData.buffer, "base64");
          } else if (imageData.base64) {
            fileBuffer = Buffer.from(imageData.base64, "base64");
          } else {
            throw new Error("No valid image data found");
          }

          const file = {
            buffer: fileBuffer,
            mimetype: mimeType,
            originalname: originalname,
          };

          const result = await uploadToCloudinary(file, folder);

          if (result) {
            const fileData = {
              url: result.url,
              public_id: result.public_id,
              originalName: originalname,
              mimeType: mimeType,
            };

            // Group files by field name
            if (!uploadedFiles[fieldName]) {
              uploadedFiles[fieldName] = [];
            }
            uploadedFiles[fieldName].push(fileData);

            console.log(
              `Uploaded image ${
                globalIndex + 1
              }/${totalImages} for field ${fieldName}`
            );
          }
        } catch (error) {
          console.error(`Failed to upload image ${globalIndex}:`, error);
          throw error;
        }
      });

      await Promise.all(batchPromises);
      processedCount += batch.length;

      // Update progress
      const progress = Math.round((processedCount / totalImages) * 80) + 10; // 10-90%
      await job.updateProgress(progress);
    }

    // Update the listing with uploaded images
    await job.updateProgress(95);

    const updateData = {};

    // Convert files to proper format for listing values
    Object.entries(uploadedFiles).forEach(([fieldName, files]) => {
      if (files.length === 1) {
        updateData[`values.${fieldName}`] = files[0];
      } else {
        updateData[`values.${fieldName}`] = files;
      }
    });

    if (Object.keys(updateData).length > 0) {
      await Listing.findByIdAndUpdate(listingId, updateData, { new: true });
      console.log(
        `Updated listing ${listingId} with ${
          Object.keys(uploadedFiles).length
        } image fields`
      );
    }

    await job.updateProgress(100);

    return {
      success: true,
      listingId,
      uploadedFiles,
      totalImagesProcessed: processedCount,
    };
  } catch (error) {
    console.error(`Error processing images for listing ${listingId}:`, error);
    throw error;
  }
};

const processBatchUpload = async (job) => {
  const { images, options = {} } = job.data;

  try {
    await job.updateProgress(5);

    console.log(`Processing batch upload of ${images.length} images`);

    const folder = options.folder || "misc";
    const uploadedImages = [];
    const totalImages = images.length;

    // Process images in smaller batches
    const batchSize = 2;
    const batches = [];

    for (let i = 0; i < images.length; i += batchSize) {
      batches.push(images.slice(i, i + batchSize));
    }

    let processedCount = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (imageData) => {
        try {
          let fileBuffer;
          let mimeType = imageData.mimeType;
          let originalname = imageData.originalname;

          if (imageData.buffer) {
            fileBuffer = Buffer.from(imageData.buffer, "base64");
          } else if (imageData.base64) {
            fileBuffer = Buffer.from(imageData.base64, "base64");
          } else {
            throw new Error("No valid image data found");
          }

          const file = {
            buffer: fileBuffer,
            mimetype: mimeType,
            originalname: originalname,
          };

          const result = await uploadToCloudinary(file, folder);

          if (result) {
            uploadedImages.push({
              url: result.url,
              public_id: result.public_id,
              originalName: originalname,
              mimeType: mimeType,
            });

            console.log(`Uploaded image ${processedCount + 1}/${totalImages}`);
          }
        } catch (error) {
          console.error(`Failed to upload batch image:`, error);
          throw error;
        }
      });

      await Promise.all(batchPromises);
      processedCount += batch.length;

      // Update progress
      const progress = Math.round((processedCount / totalImages) * 95) + 5; // 5-100%
      await job.updateProgress(progress);
    }

    await job.updateProgress(100);

    return {
      success: true,
      uploadedImages,
      totalImagesProcessed: processedCount,
    };
  } catch (error) {
    console.error(`Error processing batch image upload:`, error);
    throw error;
  }
};

// Create and export the worker
export const imageUploadWorker = new Worker(
  "imageUpload",
  async (job) => {
    console.log(`Processing image upload job: ${job.name} (ID: ${job.id})`);

    switch (job.name) {
      case JOB_TYPES.IMAGE_UPLOAD.LISTING_IMAGES:
        return await processListingImages(job);
      case JOB_TYPES.IMAGE_UPLOAD.BATCH_UPLOAD:
        return await processBatchUpload(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection: redis,
    concurrency: 3, // Process up to 3 image upload jobs simultaneously
    maxStalledCount: 1,
    stalledInterval: 30 * 1000, // 30 seconds
  }
);

imageUploadWorker.on("completed", (job, result) => {
  console.log(`Image upload job ${job.id} completed:`, result);
});

imageUploadWorker.on("failed", (job, error) => {
  console.error(`Image upload job ${job.id} failed:`, error.message);
});

imageUploadWorker.on("stalled", (jobId) => {
  console.warn(`Image upload job ${jobId} stalled`);
});

console.log("Image upload worker started successfully");

export default imageUploadWorker;
