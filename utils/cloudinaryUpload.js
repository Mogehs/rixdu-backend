import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

export const uploadToCloudinary = (
  file,
  folder = 'stores',
  resourceType = 'image'
) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.buffer) {
      return resolve(null);
    }

    const uploadOptions = {
      folder: `rixdu/${folder}`,
      resource_type: resourceType,
      quality: 'auto',
      fetch_format: 'auto',
    };

    // Preserve original filename when possible
    if (file.originalname) {
      uploadOptions.use_filename = true;
      uploadOptions.unique_filename = true;
    }

    if (resourceType === 'image') {
      uploadOptions.transformation = [
        { width: 512, height: 512, crop: 'limit' },
      ];
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary stream upload error:', error);
          return reject(new Error('Upload failed'));
        }

        // Create response with additional metadata
        const response = {
          public_id: result.public_id,
          url: result.secure_url,
        };

        // If we have an original filename, include it in the response
        if (file.originalname) {
          response.original_filename = file.originalname;
        }

        resolve(response);
      }
    );

    Readable.from(file.buffer).pipe(stream);
  });
};

export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return true;

  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
};

export const uploadUserAvatar = (file) => {
  return uploadToCloudinary(file, 'profiles/avatars', 'image');
};

export const uploadUserResume = (file) => {
  // Create custom upload options to preserve the original filename
  return new Promise((resolve, reject) => {
    if (!file || !file.buffer) {
      return resolve(null);
    }

    const uploadOptions = {
      folder: `rixdu/profiles/resumes`,
      resource_type: 'raw',
      use_filename: true, // Try to use the original filename
      filename_override: file.originalname, // Force the original filename
      public_id: file.originalname.split('.')[0], // Use name without extension as public_id
      unique_filename: true, // Make sure it's unique
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary resume upload error:', error);
          return reject(new Error('Resume upload failed'));
        }

        // Add original filename as URL parameter so frontend can access it
        const url = new URL(result.secure_url);
        url.searchParams.set('original_filename', file.originalname);

        resolve({
          public_id: result.public_id,
          url: url.toString(),
          original_filename: file.originalname,
        });
      }
    );

    Readable.from(file.buffer).pipe(stream);
  });
};

export const deleteResourceFromCloudinary = async (
  publicId,
  resourceType = 'image'
) => {
  if (!publicId) return true;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return true;
  } catch (error) {
    console.error(`Cloudinary delete error (${resourceType}):`, error);
    return false;
  }
};
