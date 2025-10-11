import User from "../models/User.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import logger from "../utils/logger.js";
import {
  isValidUAEPhoneNumber,
  isValidEmiratesIdFormat,
  isValidBusinessLicenseNumber,
  formatUAEPhoneNumber,
  formatEmiratesId,
} from "../utils/verificationValidation.js";

/**
 * Submit verification documents
 * @route POST /api/v1/verification/submit
 * @access Private
 */
export const submitVerification = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      verificationType,
      contactNumber,
      emiratesIdNumber,
      businessLicenseNumber,
      businessName,
    } = req.body;

    // Validate verification type
    if (!["individual", "business"].includes(verificationType)) {
      return res.status(400).json({
        success: false,
        message: "Verification type must be either 'individual' or 'business'",
      });
    }

    // Validate contact number (UAE format)
    if (!isValidUAEPhoneNumber(contactNumber)) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid UAE contact number (format: +971XXXXXXXXX, 971XXXXXXXXX, or 0XXXXXXXXX)",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user can submit verification
    if (!user.canSubmitVerification()) {
      return res.status(400).json({
        success: false,
        message: `Cannot submit verification. Current status: ${user.documentVerification.status}`,
      });
    }

    // Handle file uploads
    const documents = {};

    if (verificationType === "individual") {
      // Individual verification requires Emirates ID
      if (!emiratesIdNumber || !isValidEmiratesIdFormat(emiratesIdNumber)) {
        return res.status(400).json({
          success: false,
          message:
            "Valid Emirates ID number is required for individual verification (format: 784-YYYY-XXXXXXX-X)",
        });
      }

      if (
        !req.files ||
        !req.files.emiratesIdFront ||
        !req.files.emiratesIdBack
      ) {
        return res.status(400).json({
          success: false,
          message: "Both front and back images of Emirates ID are required",
        });
      }

      // Upload Emirates ID images
      const frontImageResult = await uploadToCloudinary(
        req.files.emiratesIdFront[0].buffer,
        req.files.emiratesIdFront[0].originalname,
        "verification/emirates-id"
      );

      const backImageResult = await uploadToCloudinary(
        req.files.emiratesIdBack[0].buffer,
        req.files.emiratesIdBack[0].originalname,
        "verification/emirates-id"
      );

      documents.emiratesId = {
        frontImage: frontImageResult.secure_url,
        backImage: backImageResult.secure_url,
        idNumber: formatEmiratesId(emiratesIdNumber),
      };
    } else if (verificationType === "business") {
      // Business verification requires Emirates ID and Business License
      if (!emiratesIdNumber || !isValidEmiratesIdFormat(emiratesIdNumber)) {
        return res.status(400).json({
          success: false,
          message:
            "Valid Emirates ID number is required for business verification (format: 784-YYYY-XXXXXXX-X)",
        });
      }

      if (
        !businessLicenseNumber ||
        !isValidBusinessLicenseNumber(businessLicenseNumber)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid business license number is required for business verification",
        });
      }

      if (!businessName || businessName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Business name is required for business verification",
        });
      }

      if (
        !req.files ||
        !req.files.emiratesIdFront ||
        !req.files.emiratesIdBack ||
        !req.files.businessLicense
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Emirates ID (front & back) and business license images are required",
        });
      }

      // Upload Emirates ID images
      const frontImageResult = await uploadToCloudinary(
        req.files.emiratesIdFront[0].buffer,
        req.files.emiratesIdFront[0].originalname,
        "verification/emirates-id"
      );

      const backImageResult = await uploadToCloudinary(
        req.files.emiratesIdBack[0].buffer,
        req.files.emiratesIdBack[0].originalname,
        "verification/emirates-id"
      );

      // Upload Business License
      const businessLicenseResult = await uploadToCloudinary(
        req.files.businessLicense[0].buffer,
        req.files.businessLicense[0].originalname,
        "verification/business-license"
      );

      documents.emiratesId = {
        frontImage: frontImageResult.secure_url,
        backImage: backImageResult.secure_url,
        idNumber: formatEmiratesId(emiratesIdNumber),
      };

      documents.businessLicense = {
        image: businessLicenseResult.secure_url,
        licenseNumber: businessLicenseNumber.trim(),
        businessName: businessName.trim(),
      };
    }

    // Update user verification data
    user.documentVerification = {
      status: "pending",
      type: verificationType,
      documents: documents,
      contactNumber: formatUAEPhoneNumber(contactNumber),
      submittedAt: new Date(),
      verifiedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    await user.save();

    logger.info(
      `User ${userId} submitted ${verificationType} verification documents`
    );

    res.status(200).json({
      success: true,
      message:
        "Verification documents submitted successfully. Your documents are under review.",
      data: {
        status: user.documentVerification.status,
        type: user.documentVerification.type,
        submittedAt: user.documentVerification.submittedAt,
      },
    });
  } catch (error) {
    logger.error("Error submitting verification:", error);
    res.status(500).json({
      success: false,
      message: "Server error while submitting verification documents",
    });
  }
};

/**
 * Get verification status
 * @route GET /api/v1/verification/status
 * @access Private
 */
export const getVerificationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "documentVerification"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        status: user.documentVerification.status,
        type: user.documentVerification.type,
        submittedAt: user.documentVerification.submittedAt,
        verifiedAt: user.documentVerification.verifiedAt,
        rejectedAt: user.documentVerification.rejectedAt,
        rejectionReason: user.documentVerification.rejectionReason,
        canSubmit: user.canSubmitVerification(),
        isVerified: user.isDocumentVerified(),
      },
    });
  } catch (error) {
    logger.error("Error getting verification status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching verification status",
    });
  }
};

/**
 * Admin: Get pending verifications
 * @route GET /api/v1/verification/pending
 * @access Private (Admin only)
 */
export const getPendingVerifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const users = await User.find({
      "documentVerification.status": "pending",
    })
      .select("name email phoneNumber documentVerification")
      .sort({ "documentVerification.submittedAt": -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments({
      "documentVerification.status": "pending",
    });

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasMore: skip + users.length < total,
      },
      data: users,
    });
  } catch (error) {
    logger.error("Error getting pending verifications:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching pending verifications",
    });
  }
};

/**
 * Admin: Review verification (approve/reject)
 * @route PUT /api/v1/verification/review/:userId
 * @access Private (Admin only)
 */
export const reviewVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, rejectionReason } = req.body;
    const reviewerId = req.user.id;

    // Validate action
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be either 'approve' or 'reject'",
      });
    }

    // If rejecting, require a reason
    if (action === "reject" && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required when rejecting verification",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if verification is in pending status
    if (user.documentVerification.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot review verification. Current status: ${user.documentVerification.status}`,
      });
    }

    // Update verification status
    if (action === "approve") {
      user.documentVerification.status = "verified";
      user.documentVerification.verifiedAt = new Date();
      user.documentVerification.rejectedAt = null;
      user.documentVerification.rejectionReason = null;
    } else {
      user.documentVerification.status = "rejected";
      user.documentVerification.rejectedAt = new Date();
      user.documentVerification.rejectionReason = rejectionReason;
      user.documentVerification.verifiedAt = null;
    }

    user.documentVerification.reviewedBy = reviewerId;
    await user.save();

    logger.info(
      `Admin ${reviewerId} ${action}ed verification for user ${userId}`
    );

    res.status(200).json({
      success: true,
      message: `Verification ${action}ed successfully`,
      data: {
        userId: user._id,
        status: user.documentVerification.status,
        verifiedAt: user.documentVerification.verifiedAt,
        rejectedAt: user.documentVerification.rejectedAt,
        rejectionReason: user.documentVerification.rejectionReason,
      },
    });
  } catch (error) {
    logger.error("Error reviewing verification:", error);
    res.status(500).json({
      success: false,
      message: "Server error while reviewing verification",
    });
  }
};

/**
 * Admin: Get verification details
 * @route GET /api/v1/verification/details/:userId
 * @access Private (Admin only)
 */
export const getVerificationDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select("name email phoneNumber documentVerification")
      .populate("documentVerification.reviewedBy", "name email");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error("Error getting verification details:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching verification details",
    });
  }
};
