import Profile from "../models/Profile.js";
import { Rating } from "../models/Rating.js";
import mongoose from "mongoose";

export const createRating = async (req, res) => {
  try {
    const { reviewer, reviewee, stars, message, attributes } = req.body;

    if (!reviewer || !reviewee || !stars || !message) {
      return res.status(400).json({
        success: false,
        message: "Reviewer, reviewee, stars, and message are required",
      });
    }

    if (reviewer === reviewee) {
      return res.status(400).json({
        success: false,
        message: "You cannot rate yourself",
      });
    }

    const existingRating = await Rating.findOne({ reviewer, reviewee });
    if (existingRating) {
      return res.status(409).json({
        success: false,
        message: "You have already rated this user",
      });
    }

    const rating = await Rating.create({
      reviewer,
      reviewee,
      stars,
      message,
      attributes: attributes || [],
    });

    await rating.populate([
      { path: "reviewer", select: "name" },
      { path: "reviewee", select: "name" },
    ]);

    return res.status(201).json({
      success: true,
      message: "Rating created successfully",
      data: rating,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating rating",
      error: error.message,
    });
  }
};

export const getUserRatings = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Aggregate ratings with reviewer + avatar
    const ratings = await Rating.aggregate([
      { $match: { reviewee: new mongoose.Types.ObjectId(userId) } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },

      // Lookup reviewer user info
      {
        $lookup: {
          from: "users",
          localField: "reviewer",
          foreignField: "_id",
          as: "reviewer",
        },
      },
      { $unwind: "$reviewer" },

      // Lookup avatar from Profile
      {
        $lookup: {
          from: "profiles",
          localField: "reviewer._id",
          foreignField: "user",
          as: "profile",
        },
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },

      // Project the fields you want
      {
        $project: {
          stars: 1,
          comment: 1,
          createdAt: 1,
          reviewer: {
            _id: "$reviewer._id",
            name: "$reviewer.name",
            avatar: "$profile.personal.avatar",
          },
        },
      },
    ]);

    // Get total count
    const total = await Rating.countDocuments({ reviewee: userId });

    // Average rating
    const avgResult = await Rating.aggregate([
      { $match: { reviewee: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$stars" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    const averageRating = avgResult[0]?.averageRating || 0;
    const totalRatings = avgResult[0]?.totalRatings || 0;

    return res.status(200).json({
      success: true,
      data: {
        ratings,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching user ratings",
      error: error.message,
    });
  }
};

export const deleteRating = async (req, res) => {
  try {
    const { id } = req.params;

    const rating = await Rating.findByIdAndDelete(id);

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Rating deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting rating",
      error: error.message,
    });
  }
};
