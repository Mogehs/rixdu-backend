import User from "../models/User.js";
import bcrypt from "bcryptjs";

export const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const role = req.query.role;
    const queryObj = role ? { role } : {};

    const users = await User.find(queryObj)
      .select("name email role phoneNumber avatar location createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments(queryObj);

    return res.status(200).json({
      success: true,
      count: users.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasMore: skip + users.length < total,
      },
      data: users,
    });
  } catch (error) {
    console.error(`Error fetching users: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching users. Please try again.",
    });
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await User.findByIdLean(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User not found with id of ${req.params.id}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error(`Error fetching user ${req.params.id}: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching user. Please try again.",
    });
  }
};
