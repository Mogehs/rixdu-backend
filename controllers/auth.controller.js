import User from "../models/User.js";
import crypto from "crypto";
import axios from "axios";
import process from "process";
import mongoose from "mongoose";
import {
  sendEmail,
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
} from "../utils/emailService.js";
import {
  sendSMS,
  getVerificationSMSTemplate,
  getPasswordResetSMSTemplate,
  formatPhoneNumber,
} from "../utils/smsService.js";
import { AuthJobService } from "../services/authJobService.js";

// Simple in-memory request deduplication cache
const recentRequests = new Map();
const REQUEST_DEDUPE_WINDOW = 5000; // 5 seconds

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentRequests.entries()) {
    if (now - timestamp > REQUEST_DEDUPE_WINDOW) {
      recentRequests.delete(key);
    }
  }
}, 60000);

const sendTokenResponse = (user, statusCode, res) => {
  const token = user.password
    ? User.schema.methods.getSignedJwtToken.call(user)
    : User.schema.methods.getSignedJwtToken.call({
        _id: user._id,
        role: user.role,
      });

  const options = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  if (user.password) {
    user.password = undefined;
  }
  return res
    .status(statusCode)
    .cookie("token", token, options)
    .json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        verificationMethod: user.verificationMethod,
      },
    });
};

export const sendVerificationCode = async (req, res) => {
  try {
    let { email, phoneNumber, name } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address or phone number",
      });
    }

    if (phoneNumber) {
      phoneNumber = formatPhoneNumber(phoneNumber);
      const digitsOnly = phoneNumber.replace(/\D/g, "");
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid phone number",
        });
      }
    }

    const verificationMethod = phoneNumber ? "phone" : "email";
    const requestKey = `verify_${email || phoneNumber}`;

    // Check for duplicate requests within the time window
    const lastRequestTime = recentRequests.get(requestKey);
    if (
      lastRequestTime &&
      Date.now() - lastRequestTime < REQUEST_DEDUPE_WINDOW
    ) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another verification code",
      });
    }

    // Mark this request
    recentRequests.set(requestKey, Date.now());

    let user;

    if (email) {
      user = await User.findOne({ email })
        .select("isVerified verificationMethod phoneNumber")
        .lean();

      if (user && user.isVerified) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        });
      }
    } else if (phoneNumber) {
      user = await User.findOne({ phoneNumber })
        .select("isVerified verificationMethod email")
        .lean();

      if (user && user.isVerified) {
        return res.status(400).json({
          success: false,
          message: "User with this phone number already exists",
        });
      }
    }
    if (!user) {
      const userData = {
        name: name || (email ? email.split("@")[0] : `user_${Date.now()}`),
        password: crypto.randomBytes(20).toString("hex"),
        isVerified: false,
      };
      if (email) userData.email = email;
      if (phoneNumber) userData.phoneNumber = phoneNumber;

      // Use upsert with proper error handling for duplicates
      const query = email ? { email } : { phoneNumber };

      try {
        // Try to create new user
        user = new User(userData);
      } catch (err) {
        // If error, try to find existing user
        const existingUser = await User.findOne(query);
        if (existingUser) {
          user = existingUser;
        } else {
          throw err;
        }
      }
    } else {
      user = await User.findById(user._id);
    }

    const verificationCode = user.generateVerificationToken(verificationMethod);

    try {
      await user.save({ validateBeforeSave: false });
    } catch (saveError) {
      // If duplicate key error, fetch the existing user and update it
      if (saveError.code === 11000) {
        const query = email ? { email } : { phoneNumber };
        user = await User.findOne(query);
        if (user) {
          user.generateVerificationToken(verificationMethod);
          await user.save({ validateBeforeSave: false });
        } else {
          throw saveError;
        }
      } else {
        throw saveError;
      }
    }

    try {
      await AuthJobService.sendVerificationCode(
        verificationMethod,
        verificationMethod === "phone" ? user.phoneNumber : user.email,
        user.name,
        verificationCode
      );

      return res.status(200).json({
        success: true,
        message: `Verification code sent to ${verificationMethod}`,
        data: {
          [verificationMethod === "phone" ? "phoneNumber" : "email"]:
            verificationMethod === "phone" ? user.phoneNumber : user.email,
        },
      });
    } catch (jobError) {
      if (verificationMethod === "phone") {
        const smsText = getVerificationSMSTemplate(verificationCode);
        await sendSMS({
          to: user.phoneNumber,
          body: smsText,
        });

        return res.status(200).json({
          success: true,
          message: "Verification code sent to phone",
          data: {
            phoneNumber: user.phoneNumber,
          },
        });
      } else {
        const emailTemplate = getVerificationEmailTemplate(
          user.name,
          verificationCode
        );
        await sendEmail({
          to: user.email,
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
        });

        return res.status(200).json({
          success: true,
          message: "Verification code sent to email",
          data: {
            email: user.email,
          },
        });
      }
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error sending verification code. Please try again.",
    });
  }
};

export const register = async (req, res) => {
  try {
    let { email, password, name, phoneNumber, verificationCode } = req.body;

    if (!verificationCode || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide password and verification code",
      });
    }

    if (!phoneNumber && !email) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide either email or phone number through which you received the verification code",
      });
    }

    if (phoneNumber) {
      phoneNumber = formatPhoneNumber(phoneNumber);
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationCode)
      .digest("hex");

    const verificationMethod = phoneNumber ? "phone" : "email";

    const user = await User.findOne({
      [verificationMethod === "phone" ? "phoneNumber" : "email"]:
        verificationMethod === "phone" ? phoneNumber : email,
      verificationToken: hashedToken,
      verificationExpire: { $gt: Date.now() },
      verificationMethod: verificationMethod,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid method or expired verification code",
      });
    }

    user.name = name || user.name;
    user.password = password;
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpire = undefined;

    await user.save();

    // Create profile synchronously to ensure it exists before user logs in
    try {
      const Profile = mongoose.model("Profile");
      const existingProfile = await Profile.findOne({ user: user._id });

      if (!existingProfile) {
        await Profile.create({
          user: user._id,
          personal: {},
          jobProfile: {},
          favorites: { listings: [] },
        });
      }
    } catch (profileError) {
      console.error(
        "Failed to create profile during registration:",
        profileError
      );
      // Queue as fallback if sync creation fails
      try {
        await AuthJobService.createUserProfile(user._id);
      } catch (e) {
        console.error("Failed to queue profile creation:", e);
      }
    }

    return sendTokenResponse(user, 201, res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error during registration. Please try again.",
    });
  }
};

export const login = async (req, res) => {
  try {
    let { email, phoneNumber, password } = req.body;

    if ((!email && !phoneNumber) || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email or phone number along with password",
      });
    }

    if (phoneNumber) {
      phoneNumber = formatPhoneNumber(phoneNumber);
    }

    const query = {};
    if (email) query.email = email;
    if (phoneNumber) query.phoneNumber = phoneNumber;

    const user = await User.findOne(query)
      .select(
        "+password name email role phoneNumber isVerified verificationMethod"
      )
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your account before logging in",
        needsVerification: true,
        email: user.email,
        phoneNumber: user.phoneNumber,
        verificationMethod: user.verificationMethod,
      });
    }

    const isMatch = await User.schema.methods.matchPassword.call(
      user,
      password
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    return sendTokenResponse(user, 200, res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error during login. Please try again.",
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findByIdLean(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error retrieving user profile",
    });
  }
};

export const logout = (req, res) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  return res.status(200).json({
    success: true,
    message: "User logged out successfully",
    data: {},
  });
};

export const forgotPassword = async (req, res) => {
  try {
    let { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address or phone number",
      });
    }

    if (phoneNumber) {
      phoneNumber = formatPhoneNumber(phoneNumber);
    }

    const verificationMethod = phoneNumber ? "phone" : "email";

    let user;

    if (verificationMethod === "phone") {
      user = await User.findOne({ phoneNumber, isVerified: true });
    } else {
      user = await User.findOne({ email, isVerified: true });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          verificationMethod === "phone"
            ? "No verified user found with that phone number"
            : "No verified user found with that email address",
      });
    }

    const resetCode = User.schema.methods.generatePasswordResetToken.call(user);
    await user.save({ validateBeforeSave: false });

    try {
      await AuthJobService.sendPasswordResetCode(
        verificationMethod,
        verificationMethod === "phone" ? user.phoneNumber : user.email,
        user.name,
        resetCode
      );

      return res.status(200).json({
        success: true,
        message: `Password reset code sent to ${verificationMethod}`,
      });
    } catch (jobError) {
      if (verificationMethod === "phone") {
        const smsText = getPasswordResetSMSTemplate(resetCode);
        await sendSMS({
          to: user.phoneNumber,
          body: smsText,
        });

        return res.status(200).json({
          success: true,
          message: "Password reset code sent to phone",
        });
      } else {
        const emailTemplate = getPasswordResetEmailTemplate(
          user.name,
          resetCode
        );
        await sendEmail({
          to: user.email,
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
        });

        return res.status(200).json({
          success: true,
          message: "Password reset code sent to email",
        });
      }
    }
  } catch (error) {
    if (error.user) {
      error.user.resetPasswordToken = undefined;
      error.user.resetPasswordExpire = undefined;
      await error.user.save({ validateBeforeSave: false });
    }

    return res.status(500).json({
      success: false,
      message: "Server error sending reset code. Please try again.",
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    let { resetCode, password, email, phoneNumber } = req.body;

    if (!resetCode || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide reset code and new password",
      });
    }

    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide either email or phone number",
      });
    }

    if (phoneNumber) {
      phoneNumber = formatPhoneNumber(phoneNumber);
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetCode)
      .digest("hex");

    const verificationMethod = phoneNumber ? "phone" : "email";
    const contactField =
      verificationMethod === "phone" ? "phoneNumber" : "email";
    const contactValue = verificationMethod === "phone" ? phoneNumber : email;

    const user = await User.findOne({
      [contactField]: contactValue,
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset code",
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error resetting password. Please try again.",
    });
  }
};

export const resendVerificationCode = async (req, res) => {
  try {
    let { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address or phone number",
      });
    }

    if (phoneNumber) {
      phoneNumber = formatPhoneNumber(phoneNumber);
    }

    const verificationMethod = phoneNumber ? "phone" : "email";
    const contactField =
      verificationMethod === "phone" ? "phoneNumber" : "email";
    const contactValue = verificationMethod === "phone" ? phoneNumber : email;

    const user = await User.findOne({
      [contactField]: contactValue,
      isVerified: false,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          verificationMethod === "phone"
            ? "No unverified user found with that phone number"
            : "No unverified user found with that email",
      });
    }

    const verificationCode = user.generateVerificationToken(verificationMethod);
    await user.save({ validateBeforeSave: false });

    try {
      await AuthJobService.sendVerificationCode(
        verificationMethod,
        verificationMethod === "phone" ? user.phoneNumber : user.email,
        user.name,
        verificationCode
      );

      return res.status(200).json({
        success: true,
        message: `Verification code resent to ${verificationMethod}`,
      });
    } catch (jobError) {
      if (verificationMethod === "phone") {
        const smsText = getVerificationSMSTemplate(verificationCode);
        await sendSMS({
          to: user.phoneNumber,
          body: smsText,
        });

        return res.status(200).json({
          success: true,
          message: "Verification code resent to phone",
        });
      } else {
        const emailTemplate = getVerificationEmailTemplate(
          user.name,
          verificationCode
        );
        await sendEmail({
          to: user.email,
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
        });

        return res.status(200).json({
          success: true,
          message: "Verification code resent to email",
        });
      }
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error sending verification code. Please try again.",
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide current password and new password",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await User.schema.methods.matchPassword.call(
      user,
      currentPassword
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error updating password. Please try again.",
    });
  }
};

export const auth0Login = async (req, res) => {
  const { accessToken } = req.body;
  try {
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Access token is required",
      });
    }
    const userInfoResponse = await axios.get(
      `https://${process.env.AUTH0_DOMAIN}/userinfo`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const { email, name, sub, picture } = userInfoResponse.data;

    if (!sub) {
      return res.status(400).json({
        success: false,
        message: "Invalid user information from Auth0",
      });
    }

    const provider = sub.split("|")[0];
    let user = await User.findOne({ auth0Id: sub });

    if (!user && email) {
      user = await User.findOne({ email: email });

      if (user) {
        user.auth0Id = sub;
        user.provider = provider;
        user.isVerified = true;
        user.verificationMethod = "auth0";

        if (picture) {
          user.avatar = picture;
        }

        await user.save();
      }
    }

    if (!user) {
      user = new User({
        auth0Id: sub,
        email,
        name,
        provider,
        isVerified: true,
        verificationMethod: "auth0",
        role: "user",
        ...(picture && { avatar: picture }), // Add avatar if picture is provided
      });
      await user.save();

      // Create profile synchronously for immediate availability
      try {
        const Profile = mongoose.model("Profile");
        await Profile.create({
          user: user._id,
          personal: {
            avatar: picture || user.avatar,
          },
          jobProfile: {},
          favorites: { listings: [] },
        });
      } catch (profileError) {
        console.error(
          "Failed to create profile during Auth0 login:",
          profileError
        );
        // Queue as fallback if sync creation fails
        try {
          await AuthJobService.createUserProfile(user._id);
        } catch (e) {
          console.error("Failed to queue profile creation job:", e);
        }
      }
    } else {
      // Update existing user avatar if changed
      if (picture && user.avatar !== picture) {
        user.avatar = picture;
        await user.save();

        // Update profile avatar if profile exists
        try {
          const Profile = mongoose.model("Profile");
          await Profile.findOneAndUpdate(
            { user: user._id },
            { $set: { "personal.avatar": picture } }
          );
        } catch (e) {
          console.error("Failed to update profile avatar:", e);
        }
      }
    }
    return sendTokenResponse(user, 200, res);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Authentication failed. Please try again.",
      ...(process.env.NODE_ENV === "development" && {
        error: error.message,
        details: error.response?.data,
      }),
    });
  }
};
