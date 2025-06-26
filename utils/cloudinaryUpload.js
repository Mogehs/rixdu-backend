import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";

export const uploadToCloudinary = (
  file,
  folder = "stores",
  resourceType = "image"
) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.buffer) {
      return resolve(null);
    }

    const uploadOptions = {
      folder: `rixdu/${folder}`,
      resource_type: resourceType,
      quality: "auto",
      fetch_format: "auto",
    };

    if (resourceType === "image") {
      uploadOptions.transformation = [
        { width: 512, height: 512, crop: "limit" },
      ];
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error("Cloudinary stream upload error:", error);
          return reject(new Error("Image upload failed"));
        }

        resolve({
          public_id: result.public_id,
          url: result.secure_url,
        });
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
    console.error("Cloudinary delete error:", error);
    return false;
  }
};

export const uploadUserAvatar = (file) => {
  return uploadToCloudinary(file, "profiles/avatars", "image");
};

export const uploadUserResume = (file) => {
  return uploadToCloudinary(file, "profiles/resumes", "raw");
};

export const deleteResourceFromCloudinary = async (
  publicId,
  resourceType = "image"
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
