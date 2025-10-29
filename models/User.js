import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import process from "process";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
      maxlength: [50, "Name cannot be more than 50 characters"],
    },
    email: {
      type: String,
      required: false,
      sparse: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: function () {
        // Password not required for Auth0 users
        return !this.auth0Id;
      },
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    phoneNumber: {
      type: String,
      maxlength: [20, "Phone number cannot be longer than 20 characters"],
      sparse: true,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationExpire: Date,
    verificationMethod: {
      type: String,
      enum: ["email", "phone", "auth0", "none"],
      default: "none",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    auth0Id: String,
    stripeCustomerId: String,
    provider: {
      type: String,
      enum: ["email", "google-oauth2", "apple", "auth0", "local"],
      default: "email",
    },
    fcmTokens: [
      {
        token: { type: String, required: true },
        deviceId: String,
        userAgent: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    avatar: {
      type: String,
      default: "default-avatar.jpg",
    },
    avatar_public_id: {
      type: String,
    },

    // Document Verification Fields
    documentVerification: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected"],
        default: "unverified",
      },
      type: {
        type: String,
        enum: ["individual", "business"],
      },
      documents: {
        // For Individuals
        emiratesId: {
          frontImage: String,
          backImage: String,
          idNumber: String,
        },
        // For Business Owners (includes Emirates ID + Business License)
        businessLicense: {
          image: String,
          licenseNumber: String,
          businessName: String,
        },
      },
      contactNumber: {
        type: String,
        validate: {
          validator: function (v) {
            // UAE phone number validation
            return /^(\+971|971|0)?[0-9]{9}$/.test(v);
          },
          message: "Please provide a valid UAE contact number",
        },
      },
      submittedAt: Date,
      verifiedAt: Date,
      rejectedAt: Date,
      rejectionReason: String,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      // Payment fields for verification
      paymentStatus: {
        type: String,
        enum: ["unpaid", "paid", "refunded"],
        default: "unpaid",
      },
      paymentIntentId: String,
      paymentAmount: Number,
      paymentCurrency: {
        type: String,
        default: "AED",
      },
      paymentDate: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ auth0Id: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1, createdAt: -1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ email: 1, role: 1 }, { sparse: true });

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    {
      id: this._id,
      role: this.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || "30d",
    }
  );
};

UserSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    console.error("Password matching error:", error);
    return false;
  }
};

UserSchema.methods.generateVerificationToken = function (method) {
  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();

  this.verificationToken = crypto
    .createHash("sha256")
    .update(verificationCode)
    .digest("hex");

  this.verificationExpire = Date.now() + 15 * 60 * 1000;
  this.verificationMethod = method;

  return verificationCode;
};

UserSchema.methods.generatePasswordResetToken = function () {
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetCode)
    .digest("hex");

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  return resetCode;
};
UserSchema.statics.findByIdLean = function (id) {
  return this.findById(id)
    .select(
      "name email role phoneNumber location isVerified verificationMethod avatar documentVerification.status documentVerification.type"
    )
    .lean();
};

UserSchema.statics.findByEmailOrPhone = function (identifier) {
  return this.findOne({
    $or: [{ email: identifier }, { phoneNumber: identifier }],
  });
};

UserSchema.methods.isDocumentVerified = function () {
  return this.documentVerification.status === "verified";
};

UserSchema.methods.canSubmitVerification = function () {
  const validStatuses = ["unverified", "rejected"];
  const hasValidStatus = validStatuses.includes(
    this.documentVerification.status
  );
  const hasPaid = this.documentVerification.paymentStatus === "paid";

  // For unverified users, they need to pay first
  if (this.documentVerification.status === "unverified") {
    return hasPaid;
  }

  // For rejected users, they can resubmit if they have paid
  if (this.documentVerification.status === "rejected") {
    return hasPaid;
  }

  return false;
};

// Subscription helper methods
UserSchema.methods.getActiveSubscription = async function () {
  const Subscription = mongoose.model("Subscription");
  return await Subscription.findActiveSubscription(this._id);
};

UserSchema.methods.hasActiveSubscription = async function () {
  const subscription = await this.getActiveSubscription();
  return !!subscription;
};

UserSchema.methods.canCreateListing = async function () {
  const Subscription = mongoose.model("Subscription");
  return await Subscription.canCreateListing(this._id);
};

UserSchema.methods.hasUsedFreeTrial = async function () {
  const Subscription = mongoose.model("Subscription");
  return await Subscription.hasUsedTrial(this._id);
};

UserSchema.methods.getSubscriptionStatus = async function () {
  const Subscription = mongoose.model("Subscription");

  // First check for active subscription
  let subscription = await this.getActiveSubscription();

  // If no active subscription, check for the most recent subscription (including cancelled)
  if (!subscription) {
    subscription = await Subscription.findOne({ userId: this._id })
      .sort({ createdAt: -1 }) // Get the most recent subscription
      .limit(1);
  }

  if (!subscription) {
    const hasUsedTrial = await this.hasUsedFreeTrial();
    return {
      status: "none",
      planType: null,
      canStartTrial: !hasUsedTrial,
      isActive: false,
      daysRemaining: 0,
    };
  }

  // Calculate if it's still active (for cancelled subscriptions that haven't ended yet)
  const isCurrentlyActive =
    subscription.status === "active" && subscription.endDate > new Date();

  return {
    status: subscription.status,
    planType: subscription.planType,
    canStartTrial: false,
    isActive: isCurrentlyActive,
    daysRemaining: isCurrentlyActive ? subscription.daysRemaining : 0,
    endDate: subscription.endDate,
    autoRenew: subscription.autoRenew,
    listingsCount: subscription.listingsCount,
    maxListings: subscription.maxListings,
    cancelledAt: subscription.cancelledAt,
    cancellationReason: subscription.cancellationReason,
  };
};

const User = mongoose.model("User", UserSchema);

export default User;
