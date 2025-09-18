import Profile from "../models/Profile.js";
import { Rating } from "../models/Rating.js";
import mongoose from "mongoose";

export const createRating = async (req, res) => {
  try {
    const { reviewer, reviewee, stars, message, attributes, listingId } =
      req.body;

    console.log(req.body);

    if (!reviewer || !reviewee || !stars || !message || !listingId) {
      return res.status(400).json({
        success: false,
        message:
          "Reviewer, reviewee, stars, message, and listingId are required",
      });
    }

    if (reviewer === reviewee) {
      return res.status(400).json({
        success: false,
        message: "You cannot rate yourself",
      });
    }

    // Check if already rated this user for the same listing
    const existingRating = await Rating.findOne({
      reviewer,
      reviewee,
      listing: listingId,
    });
    if (existingRating) {
      return res.status(409).json({
        success: false,
        message: "You have already rated this user for this listing",
      });
    }

    // Create rating
    const rating = await Rating.create({
      reviewer,
      reviewee,
      stars,
      message,
      listing: listingId,
      attributes: attributes || [],
    });

    // Push rating into reviewee's profile
    const revieweeProfile = await Profile.findOne({ user: reviewee });
    if (revieweeProfile) {
      revieweeProfile.public.ratings.push(rating._id);
      await revieweeProfile.save();
    }

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
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error creating rating",
      error: error.message,
    });
  }
};

export const getListingRatings = async (req, res) => {
  try {
    const { userId, listingId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        message: "Listing ID is required to fetch ratings.",
      });
    }

    // ✅ Only ratings for this user + this listing
    const matchStage = {
      reviewee: new mongoose.Types.ObjectId(userId),
      listing: new mongoose.Types.ObjectId(listingId),
    };

    const ratings = await Rating.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },

      {
        $lookup: {
          from: "users",
          localField: "reviewer",
          foreignField: "_id",
          as: "reviewer",
        },
      },
      { $unwind: "$reviewer" },

      {
        $project: {
          stars: 1,
          message: 1,
          createdAt: 1,
          reviewer: {
            _id: "$reviewer._id",
            name: "$reviewer.name",
            avatar: "$reviewer.avatar", // Get avatar directly from User model
          },
        },
      },
    ]);

    // Count only for this listing
    const total = await Rating.countDocuments(matchStage);

    // Average rating only for this listing
    const avgResult = await Rating.aggregate([
      { $match: matchStage },
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
