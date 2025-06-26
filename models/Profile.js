import mongoose from "mongoose";

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
        default: "default-resume.pdf",
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
ProfileSchema.index({
  "jobProfile.experience.jobTitle": "text",
  "jobProfile.experience.company": "text",
});
ProfileSchema.index({ "jobProfile.qualifications.fieldOfStudy": 1 });
ProfileSchema.index({ "jobProfile.digitalProfile.linkedIn": 1 });
ProfileSchema.index({ "favorites.listings": 1 });

// Method to get complete profile
ProfileSchema.statics.getCompleteProfile = async function (userId) {
  return (
    this.findOne({ user: userId })
      .populate("user", "name email phoneNumber isVerified")
      .populate("favorites.listings")
      .populate("public.ads")
      // .populate("public.ratings")
      .lean()
  );
};

// Method to get only public profile information
ProfileSchema.statics.getPublicProfile = async function (userId) {
  return this.findOne({ user: userId })
    .populate("user", "name")
    .select(
      "public personal.avatar personal.bio personal.location personal.dateOfBirth personal.languages"
    )
    .lean();
};

// Method to get job profile
ProfileSchema.statics.getJobProfile = async function (userId) {
  return this.findOne({ user: userId })
    .populate("user", "name email phoneNumber")
    .select("jobProfile personal.avatar personal.location")
    .lean();
};

// Method to get professional profile with digital links
ProfileSchema.statics.getProfessionalProfile = async function (userId) {
  return this.findOne({ user: userId })
    .populate("user", "name email")
    .select(
      "jobProfile.skills jobProfile.experience jobProfile.qualifications jobProfile.digitalProfile personal.avatar"
    )
    .lean();
};

// Method to search profiles by skills for job matching
ProfileSchema.statics.findBySkills = async function (skills, limit = 10) {
  console.log("Searching profiles by skills:", skills);
  return this.find({ "jobProfile.skills": { $in: skills } })
    .populate("user", "name")
    .select("jobProfile.skills jobProfile.experience personal.avatar")
    .limit(limit)
    .lean();
};

const Profile = mongoose.model("Profile", ProfileSchema);

export default Profile;
