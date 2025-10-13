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
    if (!["individual", "business"].includes(verificationType)) {
      return res.status(400).json({
        success: false,
        message: "Verification type must be either 'individual' or 'business'",
      });
    }
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
    if (!user.canSubmitVerification()) {
      if (user.documentVerification.paymentStatus !== "paid") {
        return res.status(400).json({
          success: false,
          message:
            "Payment required before submitting verification. Please complete the payment first.",
          needsPayment: true,
        });
      }

      return res.status(400).json({
        success: false,
        message: `Cannot submit verification. Current status: ${user.documentVerification.status}`,
      });
    }
    const documents = {};

    if (verificationType === "individual") {
      if (!emiratesIdNumber || !isValidEmiratesIdFormat(emiratesIdNumber)) {
        return res.status(400).json({
          success: false,
          message:
            "Valid Emirates ID number is required for individual verification (format: 784-YYYY-XXXXXXX-X)",
        });
      }
      if (req.files && req.files.emiratesIdFront && req.files.emiratesIdBack) {
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
      } else {
        documents.emiratesId = {
          frontImage: null,
          backImage: null,
          idNumber: formatEmiratesId(emiratesIdNumber),
        };
      }
    } else if (verificationType === "business") {
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
        req.files &&
        req.files.emiratesIdFront &&
        req.files.emiratesIdBack &&
        req.files.businessLicense
      ) {
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
      } else {
        documents.emiratesId = {
          frontImage: null,
          backImage: null,
          idNumber: formatEmiratesId(emiratesIdNumber),
        };

        documents.businessLicense = {
          image: null,
          licenseNumber: businessLicenseNumber.trim(),
          businessName: businessName.trim(),
        };
      }
    }
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
        paymentStatus: user.documentVerification.paymentStatus,
        paymentAmount: user.documentVerification.paymentAmount,
        paymentCurrency: user.documentVerification.paymentCurrency,
        paymentDate: user.documentVerification.paymentDate,
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

export const reviewVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, rejectionReason } = req.body;
    const reviewerId = req.user.id;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be either 'approve' or 'reject'",
      });
    }
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
    if (user.documentVerification.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot review verification. Current status: ${user.documentVerification.status}`,
      });
    }
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
