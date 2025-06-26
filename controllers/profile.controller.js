import Profile from "../models/Profile.js";
import User from "../models/User.js";
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

    return res.status(200).json({
      success: true,
      data: profile,
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
    const { bio, dateOfBirth, gender, languages, location } = req.body;

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

    if (bio !== undefined) profile.personal.bio = bio;
    if (dateOfBirth) profile.personal.dateOfBirth = new Date(dateOfBirth);
    if (gender) profile.personal.gender = gender;
    if (languages && Array.isArray(languages))
      profile.personal.languages = languages;

    if (location) {
      profile.personal.location = {
        ...(profile.personal.location || {}),
        ...location,
      };
    }

    await profile.save();

    return res.status(200).json({
      success: true,
      data: profile.personal,
    });
  } catch (error) {
    console.error(`Error updating personal profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error updating personal profile. Please try again.",
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
    } else {
      const isAlreadyFavorite = profile.favorites.listings.some(
        (listing) => listing.toString() === listingId
      );

      if (!isAlreadyFavorite) {
        profile.favorites.listings.push(listingId);
        await profile.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Added to favorites successfully",
    });
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

// Search users by skills
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

    return profile;
  } catch (error) {
    console.error(`Error creating profile: ${error.message}`);
    throw new Error("Failed to create profile");
  }
};
