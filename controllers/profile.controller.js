import mongoose from "mongoose";
import Profile from "../models/Profile.js";
import {
  uploadUserAvatar,
  uploadUserResume,
  deleteResourceFromCloudinary,
} from "../utils/cloudinaryUpload.js";

// Get complete profile
export const getCompleteProfile = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    const profile = await Profile.getCompleteProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error(`Error fetching profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching profile. Please try again.",
    });
  }
};

// Get public profile
export const getPublicProfile = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const profile = await Profile.getPublicProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Public profile not found",
      });
    }

    // Check if this is user's own profile
    const requestingUserId = req.user?.id;

    const isOwnProfile = requestingUserId && requestingUserId === userId;

    // Debug logging
    console.log("🔍 Backend getPublicProfile Debug:", {
      requestingUserId,
      profileUserId: userId,
      isOwnProfile,
      hasReqUser: !!req.user,
      userIdComparison: `${requestingUserId} === ${userId}`,
    });

    // Add isOwnProfile flag to the response
    const responseData = {
      ...profile,
      isOwnProfile,
    };

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error(`Error fetching public profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching public profile. Please try again.",
    });
  }
};

// Get job profile
export const getJobProfile = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    const profile = await Profile.getJobProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Job profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error(`Error fetching job profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching job profile. Please try again.",
    });
  }
};

// Get professional profile
export const getProfessionalProfile = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    const profile = await Profile.getProfessionalProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Professional profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error(`Error fetching professional profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching professional profile. Please try again.",
    });
  }
};

// Update personal profile
export const updatePersonalProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("COMPLETE REQUEST BODY:", req.body);
    const {
      profileEmail,
      profilePhoneNumber,
      bio,
      dateOfBirth,
      gender,
      languages,
      location,
      visaStatus,
    } = req.body;

    console.log("Request body in updatePersonalProfile:", {
      fullBody: req.body,
      hasVisaStatus: req.body.visaStatus !== undefined,
      visaStatus: req.body.visaStatus,
      languages: req.body.languages,
    });

    let profile = await Profile.findOne({ user: userId });

    if (!profile) {
      profile = await Profile.create({
        user: userId,
        personal: {},
      });
    }

    if (req.file) {
      if (
        profile.personal.avatar_public_id &&
        !profile.personal.avatar.includes("default-avatar")
      ) {
        await deleteResourceFromCloudinary(
          profile.personal.avatar_public_id,
          "image"
        );
      }

      const avatarResult = await uploadUserAvatar(req.file);
      if (avatarResult) {
        profile.personal.avatar = avatarResult.url;
        profile.personal.avatar_public_id = avatarResult.public_id;
      }
    }

    // Update profile email and phone number
    if (profileEmail !== undefined) {
      // Validate email format if provided and not empty
      if (profileEmail && profileEmail.trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        console.log("Validating email:", {
          value: profileEmail,
          isValid: emailRegex.test(profileEmail),
        });

        if (!emailRegex.test(profileEmail)) {
          return res.status(400).json({
            success: false,
            message: "Invalid email format for profile email",
          });
        }
      }
      profile.personal.profileEmail = profileEmail;
    }

    if (profilePhoneNumber !== undefined) {
      // Validate phone number format if provided and not empty
      if (profilePhoneNumber && profilePhoneNumber.trim() !== "") {
        const phoneRegex = /^[+]?[\d\s()\-]{7,20}$/;
        const cleanedNumber = profilePhoneNumber.replace(/[\s\-()]/g, "");

        console.log("Validating phone number:", {
          original: profilePhoneNumber,
          cleaned: cleanedNumber,
          isValid: phoneRegex.test(profilePhoneNumber),
        });

        if (!phoneRegex.test(profilePhoneNumber)) {
          return res.status(400).json({
            success: false,
            message: "Invalid phone number format for profile phone number",
          });
        }
      }
      profile.personal.profilePhoneNumber = profilePhoneNumber;
    }

    if (bio !== undefined) profile.personal.bio = bio;
    if (dateOfBirth) {
      try {
        // Check if the date is valid before setting
        const parsedDate = new Date(dateOfBirth);
        if (!isNaN(parsedDate.getTime())) {
          profile.personal.dateOfBirth = parsedDate;
          console.log("Valid date parsed:", {
            original: dateOfBirth,
            parsed: parsedDate,
          });
        } else {
          console.warn("Invalid date format ignored:", dateOfBirth);
        }
      } catch (dateError) {
        console.error("Date parsing error:", dateError.message);
      }
    }
    if (gender) profile.personal.gender = gender;

    try {
      // Initialize as empty array
      profile.personal.languages = [];

      if (languages) {
        // Check if languages is a JSON string
        if (typeof languages === "string" && languages.startsWith("[")) {
          try {
            // Try to parse as JSON
            const parsedLangs = JSON.parse(languages);
            if (Array.isArray(parsedLangs)) {
              profile.personal.languages = parsedLangs.filter(
                (lang) => typeof lang === "string" && lang.trim() !== ""
              );
              console.log(
                "Languages parsed from JSON:",
                profile.personal.languages
              );
            }
          } catch (jsonError) {
            console.error("JSON parse error for languages:", jsonError.message);
            // Fall through to the next handling approach
          }
        }

        // If not processed as JSON (or parsing failed), handle as before
        if (profile.personal.languages.length === 0) {
          // Convert string to array if it's a single string
          if (typeof languages === "string" && languages.trim() !== "") {
            // Split by comma if it contains commas
            if (languages.includes(",")) {
              profile.personal.languages = languages
                .split(",")
                .map((lang) => lang.trim())
                .filter((lang) => lang !== "");
            } else {
              profile.personal.languages = [languages.trim()];
            }
          }
          // Handle array of languages
          else if (Array.isArray(languages)) {
            // Filter out empty strings
            profile.personal.languages = languages.filter(
              (lang) => typeof lang === "string" && lang.trim() !== ""
            );
          }
        }
      }

      console.log("Languages processed:", profile.personal.languages);
    } catch (langError) {
      console.error("Error processing languages:", langError);
      // Default to empty array on error
      profile.personal.languages = [];
    }

    // Handle visa status
    // Access visa status directly from req.body to avoid destructuring issues
    const rawVisaStatus = req.body.visaStatus;
    console.log("Handling visa status:", {
      visaStatus,
      rawVisaStatus: rawVisaStatus,
      typeFromDestructured: typeof visaStatus,
      typeFromRawBody: typeof rawVisaStatus,
      hasVisaStatusInBody: "visaStatus" in req.body,
      bodyKeys: Object.keys(req.body),
      fullBody: req.body,
      contentType: req.headers["content-type"],
    });

    // CRITICAL FIX: Always set visa status, even if not in body
    if ("visaStatus" in req.body) {
      profile.personal.visaStatus = rawVisaStatus;
      console.log("Setting visa status from request body:", rawVisaStatus);
    } else {
      // If not in body, set to empty string to ensure it's included in the profile
      profile.personal.visaStatus = "";
      console.log(
        "Visa status not found in request body, setting to empty string"
      );
    }

    if (location) {
      profile.personal.location = {
        ...(profile.personal.location || {}),
        ...location,
      };
    }

    await profile.save();

    // Sync avatar to User model if it was updated
    if (req.file && profile.personal.avatar) {
      const User = mongoose.model("User");
      await User.findByIdAndUpdate(userId, {
        avatar: profile.personal.avatar,
        avatar_public_id: profile.personal.avatar_public_id,
      });
      console.log(`Avatar synced to User model for user: ${userId}`);
    }

    console.log("Profile personal data to be returned:", {
      hasVisaStatus: !!profile.personal.visaStatus,
      visaStatus: profile.personal.visaStatus,
      languages: profile.personal.languages,
      fullPersonalKeys: Object.keys(profile.personal),
    });

    // Use toObject to get a clean JavaScript object without mongoose methods
    const personalObject = profile.personal.toObject
      ? profile.personal.toObject()
      : { ...profile.personal };

    // Create a response object that explicitly includes all fields
    const responseData = {
      ...personalObject,
      // Force include visa status, even if empty or undefined
      visaStatus:
        profile.personal.visaStatus !== undefined
          ? profile.personal.visaStatus
          : "",
      // Force include languages as array if undefined
      languages: Array.isArray(profile.personal.languages)
        ? profile.personal.languages
        : [],
    };

    // Double check that visa status is included
    if (!("visaStatus" in responseData)) {
      responseData.visaStatus = "";
      console.log("Manually adding missing visaStatus field to response");
    }

    console.log("Final response data:", {
      hasVisaStatus: "visaStatus" in responseData,
      visaStatus: responseData.visaStatus,
      visaStatusType: typeof responseData.visaStatus,
      allKeys: Object.keys(responseData),
    });

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error(`Error updating personal profile: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    console.error(`Error updating with request body:`, req.body);

    // Log specific fields to diagnose issues
    if (req.body.dateOfBirth) {
      try {
        console.log("Date conversion test:", {
          original: req.body.dateOfBirth,
          parsed: new Date(req.body.dateOfBirth),
        });
      } catch (dateError) {
        console.error("Date parsing error:", dateError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Server error updating personal profile. Please try again.",
      error: error.message, // Add more details for debugging purposes
    });
  }
};

export const updateJobProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("COMPLETE REQUEST BODY:", req.body);
    const {
      qualifications,
      experience,
      skills,
      licenses,
      portfolio,
      references,
      digitalProfile,
    } = req.body;

    let profile = await Profile.findOne({ user: userId });

    if (!profile) {
      profile = await Profile.create({
        user: userId,
        jobProfile: {},
      });
    }

    if (req.file) {
      if (
        profile.jobProfile.resume_public_id &&
        !profile.jobProfile.resume.includes("default-resume")
      ) {
        await deleteResourceFromCloudinary(
          profile.jobProfile.resume_public_id,
          "raw"
        );
      }

      const resumeResult = await uploadUserResume(req.file);
      if (resumeResult) {
        profile.jobProfile.resume = resumeResult.url;
        profile.jobProfile.resume_public_id = resumeResult.public_id;
      }
    }

    if (qualifications && Array.isArray(qualifications)) {
      profile.jobProfile.qualifications = qualifications;
    }

    if (experience && Array.isArray(experience)) {
      profile.jobProfile.experience = experience;
    }

    if (skills && Array.isArray(skills)) {
      profile.jobProfile.skills = skills;
    }

    if (licenses && Array.isArray(licenses)) {
      profile.jobProfile.licenses = licenses;
    }

    if (portfolio) {
      profile.jobProfile.portfolio = portfolio;
    }

    if (references && Array.isArray(references)) {
      profile.jobProfile.references = references;
    }

    if (digitalProfile) {
      profile.jobProfile.digitalProfile = digitalProfile;
    }

    await profile.save();

    return res.status(200).json({
      success: true,
      data: profile.jobProfile,
    });
  } catch (error) {
    console.error(`Error updating job profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error updating job profile. Please try again.",
    });
  }
};

export const uploadResume = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No resume file provided",
      });
    }

    let profile = await Profile.findOne({ user: userId });

    if (!profile) {
      profile = await Profile.create({
        user: userId,
        jobProfile: {},
      });
    }

    if (
      profile.jobProfile.resume_public_id &&
      !profile.jobProfile.resume.includes("default-resume")
    ) {
      await deleteResourceFromCloudinary(
        profile.jobProfile.resume_public_id,
        "raw"
      );
    }

    const resumeResult = await uploadUserResume(req.file);
    if (resumeResult) {
      profile.jobProfile.resume = resumeResult.url;
      profile.jobProfile.resume_public_id = resumeResult.public_id;
      await profile.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        resume: profile.jobProfile.resume,
      },
    });
  } catch (error) {
    console.error(`Error uploading resume: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error uploading resume. Please try again.",
    });
  }
};

// Add to favorites
export const addToFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        message: "Listing ID is required",
      });
    }

    let profile = await Profile.findOne({ user: userId });

    if (!profile) {
      profile = await Profile.create({
        user: userId,
        favorites: {
          listings: [listingId],
        },
      });

      return res.status(200).json({
        success: true,
        message: "Added to favorites successfully",
        status: "added",
        listingId,
      });
    } else {
      const isAlreadyFavorite = profile.favorites.listings.some(
        (listing) => listing.toString() === listingId
      );

      if (!isAlreadyFavorite) {
        profile.favorites.listings.push(listingId);
        await profile.save();
        return res.status(200).json({
          success: true,
          message: "Added to favorites successfully",
          status: "added",
          listingId,
        });
      }

      if (isAlreadyFavorite) {
        profile.favorites.listings.pull(listingId);
        await profile.save();
        return res.status(200).json({
          success: true,
          message: "Removed from favorites successfully",
          status: "removed",
          listingId,
        });
      }
    }
  } catch (error) {
    console.error(`Error adding to favorites: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error adding to favorites. Please try again.",
    });
  }
};

// Remove from favorites
export const removeFromFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("COMPLETE REQUEST BODY:", req.body);
    const { listingId } = req.params;

    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    // Remove listing from favorites
    profile.favorites.listings = profile.favorites.listings.filter(
      (listing) => listing.toString() !== listingId
    );

    await profile.save();

    return res.status(200).json({
      success: true,
      message: "Removed from favorites successfully",
    });
  } catch (error) {
    console.error(`Error removing from favorites: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error removing from favorites. Please try again.",
    });
  }
};

// Get user favorites
export const getUserFavorites = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    console.log("Fetching favorites for user:", userId);

    // Validate that userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const profile = await Profile.getUserFavorites(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      count: profile.favorites.listings.length,
      data: profile.favorites.listings,
    });
  } catch (error) {
    console.error(`Error fetching user favorites: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching favorites. Please try again.",
    });
  }
};

// Search users by skills
export const searchUsersBySkills = async (req, res) => {
  try {
    console.log("COMPLETE REQUEST BODY:", req.body);
    const { skills, limit } = req.query;

    if (!skills) {
      return res.status(400).json({
        success: false,
        message: "Skills are required for search",
      });
    }

    const skillsArray = skills
      .split(",")
      .map((skill) => skill.trim().toLowerCase());
    const limitNum = parseInt(limit) || 10;

    const profiles = await Profile.findBySkills(skillsArray, limitNum);

    return res.status(200).json({
      success: true,
      count: profiles.length,
      data: profiles,
    });
  } catch (error) {
    console.error(`Error searching users by skills: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error searching users. Please try again.",
    });
  }
};

// Create a new profile
export const createProfile = async (userId) => {
  try {
    const existingProfile = await Profile.findOne({ user: userId });
    if (existingProfile) {
      return existingProfile;
    }

    const profile = await Profile.create({
      user: userId,
      personal: {},
      jobProfile: {},
      favorites: { listings: [] },
    });

    console.log(`Profile created for user: ${userId}`);
    return profile;
  } catch (error) {
    console.error(`Error creating profile: ${error.message}`);
    throw new Error("Failed to create profile");
  }
};

// Utility function to sync all existing profiles' avatars to users
export const syncAllAvatarsToUsers = async () => {
  try {
    const User = mongoose.model("User");
    const profiles = await Profile.find({
      "personal.avatar": {
        $exists: true,
        $nin: [null, "", "default-avatar.jpg"],
      },
    }).select("user personal.avatar personal.avatar_public_id");

    for (const profile of profiles) {
      if (
        profile.personal.avatar &&
        profile.personal.avatar !== "default-avatar.jpg"
      ) {
        await User.findByIdAndUpdate(profile.user, {
          avatar: profile.personal.avatar,
          avatar_public_id: profile.personal.avatar_public_id,
        });
        console.log(`Synced avatar for user: ${profile.user}`);
      }
    }

    console.log("Avatar sync completed successfully");
    return { success: true, synced: profiles.length };
  } catch (error) {
    console.error(`Error syncing avatars: ${error.message}`);
    throw new Error("Failed to sync avatars");
  }
};
