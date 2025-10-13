import Application from "../models/Application.js";
import Listing from "../models/Listing.js";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import { validationResult } from "express-validator";
import mongoose from "mongoose";

export const submitApplication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errors.array(),
      });
    }

    const {
      jobSlug,
      applicantData,
      coverLetter,
      applicationMethod = "manual",
    } = req.body;
    const applicantId = req.user.id;

    const job = await Listing.findOne({ slug: jobSlug });
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const jobId = job._id;

    const existingApplication = await Application.findOne({
      applicant: applicantId,
      job: jobId,
    });

    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: "You have already applied for this job",
        data: existingApplication,
      });
    }

    const application = new Application({
      applicant: applicantId,
      job: jobId,
      applicantData,
      coverLetter,
      applicationMethod,
    });

    await application.save();
    await Profile.findOneAndUpdate(
      { user: applicantId },
      {
        $addToSet: {
          "public.applications": jobId,
        },
      },
      { upsert: true, new: true }
    );

    const populatedApplication = await Application.findById(application._id)
      .populate("applicant", "name email phoneNumber")
      .populate("job", "values.title values.company");

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: populatedApplication,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
      error: error.message,
    });
  }
};

export const getUserApplications = async (req, res) => {
  try {
    const applicantId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "appliedAt",
      sortOrder = "desc",
    } = req.query;

    const filter = { applicant: applicantId };
    if (status) filter.status = status;

    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const applications = await Application.find(filter)
      .populate("job")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Application.countDocuments(filter);

    res.json({
      success: true,
      data: {
        applications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: error.message,
    });
  }
};

export const getJobApplications = async (req, res) => {
  try {
    const { jobId } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "appliedAt",
      sortOrder = "desc",
    } = req.query;
    let job;
    if (mongoose.Types.ObjectId.isValid(jobId)) {
      job = await Listing.findById(jobId);
    }

    if (!job) {
      job = await Listing.findOne({ slug: jobId });
    }

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only view applications for your own jobs",
      });
    }

    const actualJobId = job._id;
    const filter = { job: actualJobId };
    if (status) filter.status = status;

    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const applications = await Application.find(filter)
      .populate("applicant", "name email phoneNumber avatar createdAt")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Application.countDocuments(filter);

    const statusCounts = await Application.aggregate([
      { $match: { job: new mongoose.Types.ObjectId(actualJobId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        applications,
        statusCounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch job applications",
      error: error.message,
    });
  }
};

export const getApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId)
      .populate("applicant", "name email phoneNumber avatar createdAt")
      .populate(
        "job",
        "values.title values.company values.location values.salary userId"
      )
      .populate("reviewedBy", "name email");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const isApplicant = application.applicant._id.toString() === req.user.id;
    const isJobOwner = application.job.userId.toString() === req.user.id;

    if (!isApplicant && !isJobOwner) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch application",
      error: error.message,
    });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errors.array(),
      });
    }

    const { applicationId } = req.params;
    const { status, notes, rating } = req.body;

    const application = await Application.findById(applicationId).populate(
      "job"
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.job.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only update applications for your own jobs",
      });
    }

    application.status = status;
    application.reviewedBy = req.user.id;
    if (notes) application.notes = notes;
    if (rating) application.rating = rating;

    await application.save();

    const updatedApplication = await Application.findById(applicationId)
      .populate("applicant", "name email phoneNumber")
      .populate("job", "values.title values.company")
      .populate("reviewedBy", "name email");

    res.json({
      success: true,
      message: "Application status updated successfully",
      data: updatedApplication,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update application status",
      error: error.message,
    });
  }
};

export const withdrawApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.applicant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only withdraw your own applications",
      });
    }

    if (application.status === "hired") {
      return res.status(400).json({
        success: false,
        message: "Cannot withdraw application that has been hired",
      });
    }

    await Application.findByIdAndDelete(applicationId);
    await Profile.findOneAndUpdate(
      { user: req.user.id },
      {
        $pull: {
          "public.applications": application.job,
        },
      }
    );

    res.json({
      success: true,
      message: "Application withdrawn successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to withdraw application",
      error: error.message,
    });
  }
};

export const getApplicationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const applicantStats = await Application.aggregate([
      { $match: { applicant: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const jobOwnerStats = await Application.aggregate([
      {
        $lookup: {
          from: "listings",
          localField: "job",
          foreignField: "_id",
          as: "jobDetails",
        },
      },
      { $unwind: "$jobDetails" },
      {
        $match: { "jobDetails.userId": new mongoose.Types.ObjectId(userId) },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalJobsPosted = await Listing.countDocuments({ userId: userId });

    res.json({
      success: true,
      data: {
        asApplicant: applicantStats,
        asJobOwner: jobOwnerStats,
        totalJobsPosted,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch application statistics",
      error: error.message,
    });
  }
};
