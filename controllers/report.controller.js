import Report from "../models/Report.js";
import Listing from "../models/Listing.js";
import User from "../models/User.js";

// Create a new report
export const createReport = async (req, res) => {
  try {
    const { listingId, reason, description } = req.body;
    const reportedBy = req.user.id;

    // Validate required fields
    if (!listingId || !reason || !description) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if listing exists
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Prevent reporting own listing
    if (listing.userId.toString() === reportedBy) {
      return res.status(400).json({
        success: false,
        message: "You cannot report your own listing",
      });
    }

    // Check if user has already reported this listing
    const existingReport = await Report.findOne({
      listingId,
      reportedBy,
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: "You have already reported this listing",
      });
    }

    // Create report
    const report = await Report.create({
      listingId,
      reportedBy,
      reportedUser: listing.userId,
      reason,
      description,
    });

    // Populate report data
    await report.populate([
      { path: "listingId", select: "slug values categoryId" },
      { path: "reportedBy", select: "name email" },
      { path: "reportedUser", select: "name email" },
    ]);

    res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: report,
    });
  } catch (error) {
    console.error("Create report error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating report",
    });
  }
};

// Get all reports (admin only) with pagination
export const getAllReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    // Get total count
    const total = await Report.countDocuments(query);

    // Get reports with pagination
    const reports = await Report.find(query)
      .populate("listingId", "slug values categoryId")
      .populate("reportedBy", "name email avatar")
      .populate("reportedUser", "name email avatar")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      count: reports.length,
      total,
      pagination: {
        page,
        pages: totalPages,
        limit,
        hasMore: page < totalPages,
      },
      data: reports,
    });
  } catch (error) {
    console.error("Get all reports error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching reports",
    });
  }
};

// Get single report details (admin only)
export const getReportDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findById(id)
      .populate("listingId")
      .populate("reportedBy", "name email avatar phoneNumber")
      .populate("reportedUser", "name email avatar phoneNumber")
      .populate("reviewedBy", "name email");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Get report details error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching report details",
    });
  }
};

// Update report status (admin only)
export const updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    // Validate status
    const validStatuses = ["pending", "reviewed", "resolved", "dismissed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    // Find and update report
    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    report.status = status;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    report.reviewedBy = req.user.id;
    report.reviewedAt = new Date();

    await report.save();

    // Populate and return updated report
    await report.populate([
      { path: "listingId", select: "slug values categoryId" },
      { path: "reportedBy", select: "name email avatar" },
      { path: "reportedUser", select: "name email avatar" },
      { path: "reviewedBy", select: "name email" },
    ]);

    res.status(200).json({
      success: true,
      message: "Report status updated successfully",
      data: report,
    });
  } catch (error) {
    console.error("Update report status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating report status",
    });
  }
};

// Get reports for a specific listing
export const getListingReports = async (req, res) => {
  try {
    const { listingId } = req.params;

    const reports = await Report.find({ listingId })
      .populate("reportedBy", "name email avatar")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error("Get listing reports error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching listing reports",
    });
  }
};

// Get user's submitted reports
export const getUserReports = async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await Report.find({ reportedBy: userId })
      .populate("listingId", "slug values categoryId")
      .populate("reportedUser", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error("Get user reports error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching user reports",
    });
  }
};
