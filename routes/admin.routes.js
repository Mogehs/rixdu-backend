import express from "express";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Get users with their subscriptions and stats
router.get(
  "/users-subscriptions",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      // Get pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Calculate statistics (total counts)
      const totalUsers = await User.countDocuments();
      const subscriptions = await Subscription.find({});

      const stats = {
        totalUsers,
        activeSubscriptions: subscriptions.filter((s) => s.status === "active")
          .length,
        trialUsers: subscriptions.filter((s) => s.planType === "trial").length,
        premiumUsers: subscriptions.filter((s) => s.planType === "premium")
          .length,
        expiredSubscriptions: subscriptions.filter(
          (s) => s.status === "expired"
        ).length,
        totalRevenue: subscriptions
          .filter((s) => s.planType === "premium" && s.status === "active")
          .reduce((total, s) => total + (s.price || 0), 0),
      };

      // Get paginated users with their latest subscription
      const users = await User.aggregate([
        {
          $lookup: {
            from: "subscriptions",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$userId", "$$userId"] },
                },
              },
              {
                $sort: { createdAt: -1 },
              },
              {
                $limit: 1,
              },
            ],
            as: "subscription",
          },
        },
        {
          $unwind: {
            path: "$subscription",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            name: 1,
            email: 1,
            createdAt: 1,
            documentVerification: 1,
            subscription: {
              _id: "$subscription._id",
              planType: "$subscription.planType",
              status: "$subscription.status",
              price: "$subscription.price",
              currency: "$subscription.currency",
              startDate: "$subscription.startDate",
              endDate: "$subscription.endDate",
              createdAt: "$subscription.createdAt",
            },
          },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(totalUsers / limit);

      res.status(200).json({
        success: true,
        users,
        stats,
        pagination: {
          page,
          pages: totalPages,
          limit,
          total: totalUsers,
          hasMore: page < totalPages,
        },
      });
    } catch (error) {
      console.error("Get users subscriptions error:", error);
      res.status(500).json({
        success: false,
        message: "Server error fetching users data",
      });
    }
  }
);

// Update subscription status
router.patch(
  "/subscriptions/:subscriptionId/status",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { subscriptionId } = req.params;
      const { status } = req.body;

      // Validate status
      const validStatuses = [
        "active",
        "expired",
        "cancelled",
        "pending",
        "incomplete",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid subscription status",
        });
      }

      // Find and update subscription
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Subscription not found",
        });
      }

      subscription.status = status;

      // If setting to active, ensure endDate is set
      if (status === "active" && !subscription.endDate) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        subscription.endDate = endDate;
      }

      // If cancelling, set cancellation date
      if (status === "cancelled") {
        subscription.cancelledAt = new Date();
      }

      await subscription.save();

      res.status(200).json({
        success: true,
        message: "Subscription status updated successfully",
        subscription,
      });
    } catch (error) {
      console.error("Update subscription status error:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating subscription status",
      });
    }
  }
);

// Get subscription statistics
router.get(
  "/subscription-stats",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const subscriptions = await Subscription.find({});

      // Monthly revenue data (last 12 months)
      const monthlyRevenue = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        const monthRevenue = subscriptions
          .filter(
            (s) =>
              s.planType === "premium" &&
              s.createdAt >= monthStart &&
              s.createdAt <= monthEnd
          )
          .reduce((total, s) => total + (s.price || 0), 0);

        monthlyRevenue.push({
          month: date.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          }),
          revenue: monthRevenue,
        });
      }

      // Plan distribution
      const planDistribution = {
        trial: subscriptions.filter((s) => s.planType === "trial").length,
        premium: subscriptions.filter((s) => s.planType === "premium").length,
      };

      // Status distribution
      const statusDistribution = {
        active: subscriptions.filter((s) => s.status === "active").length,
        expired: subscriptions.filter((s) => s.status === "expired").length,
        cancelled: subscriptions.filter((s) => s.status === "cancelled").length,
        pending: subscriptions.filter((s) => s.status === "pending").length,
        incomplete: subscriptions.filter((s) => s.status === "incomplete")
          .length,
      };

      res.status(200).json({
        success: true,
        monthlyRevenue,
        planDistribution,
        statusDistribution,
      });
    } catch (error) {
      console.error("Get subscription stats error:", error);
      res.status(500).json({
        success: false,
        message: "Server error fetching subscription statistics",
      });
    }
  }
);

export default router;
