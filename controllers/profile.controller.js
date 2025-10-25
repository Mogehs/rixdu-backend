import mongoose from "mongoose";
import Profile from "../models/Profile.js";
import {
  uploadUserAvatar,
  uploadUserResume,
  deleteResourceFromCloudinary,
} from "../utils/cloudinaryUpload.js";

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
    return res.status(500).json({
      success: false,
      message: "Server error fetching profile. Please try again.",
    });
  }
};

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

    const requestingUserId = req.user?.id;

    const isOwnProfile = requestingUserId && requestingUserId === userId;
    const responseData = {
      ...profile,
      isOwnProfile,
    };

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error fetching public profile. Please try again.",
    });
  }
};

export const getPublicProfilePaginated = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Parse pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const tab = req.query.tab || "ads"; // ads, jobPosts, or ratings
    const categoryFilter = req.query.category || "all";

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    // Get paginated profile data
    const result = await Profile.getPublicProfilePaginated(
      userId,
      tab,
      page,
      limit,
      categoryFilter
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Public profile not found",
      });
    }

    const requestingUserId = req.user?.id;
    const isOwnProfile = requestingUserId && requestingUserId === userId;

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        isOwnProfile,
      },
    });
  } catch (error) {
    console.error("Error fetching paginated public profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching public profile. Please try again.",
    });
  }
};

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
    return res.status(500).json({
      success: false,
      message: "Server error fetching job profile. Please try again.",
    });
  }
};

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
    return res.status(500).json({
      success: false,
      message: "Server error fetching professional profile. Please try again.",
    });
  }
};

export const updatePersonalProfile = async (req, res) => {
  try {
    const userId = req.user.id;
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

    if (profileEmail !== undefined) {
      if (profileEmail && profileEmail.trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
      if (profilePhoneNumber && profilePhoneNumber.trim() !== "") {
        const phoneRegex = /^[+]?[\d\s()\-]{7,20}$/;
        const cleanedNumber = profilePhoneNumber.replace(/[\s\-()]/g, "");
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
        const parsedDate = new Date(dateOfBirth);
        if (!isNaN(parsedDate.getTime())) {
          profile.personal.dateOfBirth = parsedDate;
        } else {
        }
      } catch (e) {}
    }
    if (gender) profile.personal.gender = gender;

    try {
      profile.personal.languages = [];

      if (languages) {
        if (typeof languages === "string" && languages.startsWith("[")) {
          try {
            const parsedLangs = JSON.parse(languages);
            if (Array.isArray(parsedLangs)) {
              profile.personal.languages = parsedLangs.filter(
                (lang) => typeof lang === "string" && lang.trim() !== ""
              );
            }
          } catch (e) {}
        }

        if (profile.personal.languages.length === 0) {
          if (typeof languages === "string" && languages.trim() !== "") {
            if (languages.includes(",")) {
              profile.personal.languages = languages
                .split(",")
                .map((lang) => lang.trim())
                .filter((lang) => lang !== "");
            } else {
              profile.personal.languages = [languages.trim()];
            }
          } else if (Array.isArray(languages)) {
            profile.personal.languages = languages.filter(
              (lang) => typeof lang === "string" && lang.trim() !== ""
            );
          }
        }
      }
    } catch (langError) {
      profile.personal.languages = [];
    }

    const rawVisaStatus = req.body.visaStatus;
    if ("visaStatus" in req.body) {
      profile.personal.visaStatus = rawVisaStatus;
    } else {
      profile.personal.visaStatus = "";
    }

    if (location) {
      profile.personal.location = {
        ...(profile.personal.location || {}),
        ...location,
      };
    }

    await profile.save();

    if (req.file && profile.personal.avatar) {
      const User = mongoose.model("User");
      await User.findByIdAndUpdate(userId, {
        avatar: profile.personal.avatar,
        avatar_public_id: profile.personal.avatar_public_id,
      });
    }
    const personalObject = profile.personal.toObject
      ? profile.personal.toObject()
      : { ...profile.personal };

    const responseData = {
      ...personalObject,

      visaStatus:
        profile.personal.visaStatus !== undefined
          ? profile.personal.visaStatus
          : "",

      languages: Array.isArray(profile.personal.languages)
        ? profile.personal.languages
        : [],
    };

    if (!("visaStatus" in responseData)) {
      responseData.visaStatus = "";
    }
    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    if (req.body.dateOfBirth) {
      try {
      } catch (e) {}
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
    return res.status(500).json({
      success: false,
      message: "Server error uploading resume. Please try again.",
    });
  }
};

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
    return res.status(500).json({
      success: false,
      message: "Server error adding to favorites. Please try again.",
    });
  }
};

export const removeFromFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { listingId } = req.params;

    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    profile.favorites.listings = profile.favorites.listings.filter(
      (listing) => listing.toString() !== listingId
    );

    await profile.save();

    return res.status(200).json({
      success: true,
      message: "Removed from favorites successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error removing from favorites. Please try again.",
    });
  }
};

export const getUserFavorites = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
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
    return res.status(500).json({
      success: false,
      message: "Server error fetching favorites. Please try again.",
    });
  }
};

export const searchUsersBySkills = async (req, res) => {
  try {
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
    return res.status(500).json({
      success: false,
      message: "Server error searching users. Please try again.",
    });
  }
};

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
    return profile;
  } catch (error) {
    throw new Error("Failed to create profile");
  }
};

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
      }
    }
    return { success: true, synced: profiles.length };
  } catch (error) {
    throw new Error("Failed to sync avatars");
  }
};
