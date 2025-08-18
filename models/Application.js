import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "shortlisted", "rejected", "hired"],
      default: "pending",
    },
    applicantData: {
      personalInfo: {
        fullName: String,
        email: String,
        phone: String,
        location: String,
        visaStatus: String,
        dateOfBirth: Date,
        gender: String,
      },
      resume: {
        url: String,
        filename: String,
      },
      coverLetter: String,
      experience: [
        {
          jobTitle: String,
          company: String,
          startDate: Date,
          endDate: Date,
          current: Boolean,
          description: String,
          location: String,
        },
      ],
      education: [
        {
          degree: String,
          institution: String,
          graduationYear: Number,
          grade: String,
          fieldOfStudy: String,
        },
      ],
      skills: [String],
      certifications: [
        {
          name: String,
          issuer: String,
          issueDate: Date,
          expiryDate: Date,
          credentialId: String,
        },
      ],
      portfolio: {
        website: String,
        linkedin: String,
        github: String,
        behance: String,
        other: String,
      },
      references: [
        {
          name: String,
          relationship: String,
          company: String,
          email: String,
          phone: String,
        },
      ],
    },
    applicationMethod: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notes: String,
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

applicationSchema.index({ applicant: 1, job: 1 }, { unique: true });
applicationSchema.index({ job: 1, status: 1 });
applicationSchema.index({ applicant: 1, appliedAt: -1 });
applicationSchema.index({ status: 1, appliedAt: -1 });

applicationSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status !== "pending") {
    this.reviewedAt = new Date();
  }
  next();
});

const Application = mongoose.model("Application", applicationSchema);

export default Application;
