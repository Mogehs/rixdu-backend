import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1, createdAt: -1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ email: 1, role: 1 }, { sparse: true });
UserSchema.index({ auth0Id: 1 }, { sparse: true });

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
      "name email role phoneNumber location isVerified verificationMethod"
    )
    .lean();
};

UserSchema.statics.findByEmailOrPhone = function (identifier) {
  return this.findOne({
    $or: [{ email: identifier }, { phoneNumber: identifier }],
  });
};

const User = mongoose.model("User", UserSchema);

export default User;
