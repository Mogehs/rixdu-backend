import { resumeUpload } from "./multer.middleware.js";
import { uploadUserResume } from "../utils/cloudinaryUpload.js";

export const processResumeUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }

    const result = await uploadUserResume(req.file);

    if (result) {
      req.body.applicantData = req.body.applicantData || {};
      if (typeof req.body.applicantData === "string") {
        req.body.applicantData = JSON.parse(req.body.applicantData);
      }

      req.body.applicantData.resume = {
        url: result.url,
        filename: req.file.originalname,
        public_id: result.public_id,
      };
    }

    next();
  } catch (error) {
    console.error("Resume upload error:", error);
    return res.status(400).json({
      success: false,
      message: "Failed to upload resume",
      error: error.message,
    });
  }
};

export const handleResumeUpload = [
  resumeUpload.single("resume"),
  processResumeUpload,
];
