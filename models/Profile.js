import mongoose from "mongoose";
import Application from "./Application.js";
import Listing from "./Listing.js";

const ProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Profile information
    personal: {
      profileEmail: {
        type: String,
      },
      profilePhoneNumber: {
        type: String,
      },
      avatar: {
        type: String,
        default: "default-avatar.jpg",
      },
      avatar_public_id: {
        type: String,
      },
      location: {
        neighborhood: String,
        building: String,
        appartment: String,
        country: String,
        zipCode: String,
      },
      bio: {
        type: String,
        maxlength: [500, "Bio cannot be more than 500 characters"],
      },
      dateOfBirth: Date,
      gender: {
        type: String,
        enum: ["male", "female", "other", "prefer not to say"],
      },
      languages: [String],
      visaStatus: {
        type: String,
      },
    },

    // Public profile information
    public: {
      ads: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Listing",
        },
      ],
      ratings: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Rating",
        },
      ],
      jobPosts: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Listing",
        },
      ],
      applications: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Listing",
        },
      ],
      appliedFor: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Listing",
        },
      ],
    },
    // Job profile information
    jobProfile: {
      qualifications: [
        {
          degree: String,
          fieldOfStudy: String,
          institution: String,
          startDate: Date,
          endDate: Date,
        },
      ],
      experience: [
        {
          jobTitle: String,
          company: String,
          startDate: Date,
          endDate: Date,
          description: String,
        },
      ],
      skills: [String],

      resume: {
        type: String,
      },
      resume_public_id: {
        type: String,
      },

      licenses: [{ name: String, issuer: String, dateIssued: Date }],
      portfolio: {
        link: String,
        description: String,
      },
      references: [
        {
          name: String,
          position: String,
          company: String,
          email: String,
        },
      ],
      digitalProfile: {
        linkedIn: String,
        github: String,
        personalWebsite: String,
      },
    },

    favorites: {
      listings: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Listing",
        },
      ],
    },
  },

  {
    timestamps: true,
  }
);

// Indexes for better query performance
ProfileSchema.index({ user: 1 });
ProfileSchema.index({ "personal.avatar": 1 });
ProfileSchema.index({ "personal.location.country": 1 });
ProfileSchema.index({ "personal.location.neighborhood": 1 });
ProfileSchema.index({ "jobProfile.skills": 1 });
ProfileSchema.index({ "personal.profileEmail": 1 });
ProfileSchema.index({ "personal.profilePhoneNumber": 1 });
ProfileSchema.index({
  "jobProfile.experience.jobTitle": "text",
  "jobProfile.experience.company": "text",
});
ProfileSchema.index({ "jobProfile.qualifications.fieldOfStudy": 1 });
ProfileSchema.index({ "jobProfile.digitalProfile.linkedIn": 1 });
ProfileSchema.index({ "favorites.listings": 1 });

// Method to get complete profile
ProfileSchema.statics.getCompleteProfile = async function (userId) {
  return this.findOne({ user: userId })
    .populate("user", "name email phoneNumber isVerified")
    .populate("favorites.listings")
    .populate("public.ads")
    .populate("public.ratings")
    .select(
      "user personal.avatar personal.bio personal.dateOfBirth personal.gender personal.languages personal.location personal.visaStatus personal.profileEmail personal.profilePhoneNumber jobProfile public favorites"
    ) // Explicitly select all fields we need including visaStatus
    .lean();
};

// Method to get only public profile information
ProfileSchema.statics.getPublicProfile = async function (userId) {
  const profile = await this.findOne({ user: userId })
    .populate("user", "name")
    .populate({
      path: "public.ads",
      select: "values images categoryId createdAt updatedAt slug serviceType",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .populate({
      path: "public.jobPosts",
      select: "values images categoryId createdAt updatedAt slug",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .populate({
      path: "public.applications",
      select: "values images categoryId createdAt updatedAt slug",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .populate({
      path: "public.ratings",
      populate: [
        { path: "reviewer", select: "name email" },
        { path: "reviewee", select: "name email" },
      ],
    })

    .select(
      "public personal.avatar personal.bio personal.location personal.dateOfBirth personal.languages personal.visaStatus"
    )
    .lean();

  if (profile) {
    // Get received applications for this user's job posts
    const Application = mongoose.model("Application");
    const Listing = mongoose.model("Listing");

    // Find all job posts by this user
    const userJobPosts = await Listing.find({ userId: userId }).select("_id");
    const jobPostIds = userJobPosts.map((job) => job._id);

    // Find all applications for those job posts
    const receivedApplications = await Application.find({
      job: { $in: jobPostIds },
    })
      .populate("applicant", "name email phoneNumber")
      .populate("job", "values.title values.company slug")
      .sort({ createdAt: -1 })
      .lean();

    // Add receivedApplications to the profile
    profile.public.receivedApplications = receivedApplications;
  }

  return profile;
};

// Method to get job profile
ProfileSchema.statics.getJobProfile = async function (userId) {
  return this.findOne({ user: userId })
    .populate("user", "name email phoneNumber")
    .select(
      "jobProfile personal.avatar personal.bio personal.dateOfBirth personal.gender personal.languages personal.location personal.visaStatus personal.profileEmail personal.profilePhoneNumber"
    )
    .lean();
};

// Method to get professional profile with digital links
ProfileSchema.statics.getProfessionalProfile = async function (userId) {
  return this.findOne({ user: userId })
    .populate("user", "name email")
    .select(
      "personal.profileEmail personal.profilePhoneNumber jobProfile.skills jobProfile.experience jobProfile.qualifications jobProfile.digitalProfile personal.avatar"
    )
    .lean();
};

// Method to search profiles by skills for job matching
ProfileSchema.statics.findBySkills = async function (skills, limit = 10) {
  console.log("Searching profiles by skills:", skills);
  return this.find({ "jobProfile.skills": { $in: skills } })
    .populate("user", "name")
    .select(
      "jobProfile.skills jobProfile.experience personal.profileEmail personal.profilePhoneNumber personal.avatar"
    )
    .limit(limit)
    .lean();
};

// Method to get user favorites
ProfileSchema.statics.getUserFavorites = async function (userId) {
  return this.findOne({ user: userId })
    .populate({
      path: "favorites.listings",
      populate: {
        path: "categoryId",
        select: "name",
      },
    })
    .select("favorites")
    .lean();
};

const Profile = mongoose.model("Profile", ProfileSchema);

export default Profile;
