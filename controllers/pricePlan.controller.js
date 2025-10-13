import mongoose from "mongoose";
import PricePlan from "../models/PricePlan.js";
import Category from "../models/Category.js";
import Store from "../models/Store.js";
export const createPricePlan = async (req, res) => {
  try {
    const {
      categoryId,
      storeId,
      planType,
      duration,
      price,
      currency = "AED",
      features,
      description,
      discountPercentage = 0,
      isActive = true,
    } = req.body;
    if (!categoryId || !storeId || !planType || !duration || !price) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: categoryId, storeId, planType, duration, price",
      });
    }
    const categoryExists = await Category.exists({ _id: categoryId });
    if (!categoryExists) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    const storeExists = await Store.exists({ _id: storeId });
    if (!storeExists) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }
    const existingPlan = await PricePlan.findOne({
      categoryId,
      planType,
      duration,
    });

    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: `A ${planType} plan for ${duration} days already exists for this category`,
      });
    }
    const newPricePlan = await PricePlan.create({
      categoryId,
      storeId,
      planType,
      duration,
      price,
      currency,
      features,
      description,
      discountPercentage,
      isActive,
      createdBy: req.user.id,
    });
    const populatedPlan = await PricePlan.findById(newPricePlan._id)
      .populate("categoryId", "name slug")
      .populate("storeId", "name slug")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      data: populatedPlan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error creating price plan. Please try again.",
    });
  }
};
export const getPricePlans = async (req, res) => {
  try {
    const {
      categoryId,
      storeId,
      planType,
      duration,
      isActive,
      page = 1,
      limit = 20,
      sort = "-createdAt",
    } = req.query;

    const skip = (page - 1) * limit;
    const filter = {};
    if (categoryId) filter.categoryId = categoryId;
    if (storeId) filter.storeId = storeId;
    if (planType) filter.planType = planType;
    if (duration) filter.duration = parseInt(duration);
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const pricePlans = await PricePlan.find(filter)
      .populate("categoryId", "name slug icon")
      .populate("storeId", "name slug")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await PricePlan.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: pricePlans.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: pricePlans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error fetching price plans. Please try again.",
    });
  }
};
export const getPricePlan = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid price plan ID format",
      });
    }

    const pricePlan = await PricePlan.findById(id)
      .populate("categoryId", "name slug icon fields")
      .populate("storeId", "name slug")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .lean();

    if (!pricePlan) {
      return res.status(404).json({
        success: false,
        message: "Price plan not found",
      });
    }

    res.status(200).json({
      success: true,
      data: pricePlan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error fetching price plan. Please try again.",
    });
  }
};
export const updatePricePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      planType,
      duration,
      price,
      currency,
      features,
      description,
      discountPercentage,
      isActive,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid price plan ID format",
      });
    }

    const pricePlan = await PricePlan.findById(id);

    if (!pricePlan) {
      return res.status(404).json({
        success: false,
        message: "Price plan not found",
      });
    }
    if (planType || duration) {
      const checkPlanType = planType || pricePlan.planType;
      const checkDuration = duration || pricePlan.duration;

      const existingPlan = await PricePlan.findOne({
        categoryId: pricePlan.categoryId,
        planType: checkPlanType,
        duration: checkDuration,
        _id: { $ne: id },
      });

      if (existingPlan) {
        return res.status(400).json({
          success: false,
          message: `A ${checkPlanType} plan for ${checkDuration} days already exists for this category`,
        });
      }
    }
    if (planType !== undefined) pricePlan.planType = planType;
    if (duration !== undefined) pricePlan.duration = duration;
    if (price !== undefined) pricePlan.price = price;
    if (currency !== undefined) pricePlan.currency = currency;
    if (features !== undefined) pricePlan.features = features;
    if (description !== undefined) pricePlan.description = description;
    if (discountPercentage !== undefined)
      pricePlan.discountPercentage = discountPercentage;
    if (isActive !== undefined) pricePlan.isActive = isActive;

    pricePlan.updatedBy = req.user.id;
    pricePlan.updatedAt = Date.now();

    const updatedPricePlan = await pricePlan.save();
    const populatedPlan = await PricePlan.findById(updatedPricePlan._id)
      .populate("categoryId", "name slug")
      .populate("storeId", "name slug")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.status(200).json({
      success: true,
      data: populatedPlan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error updating price plan. Please try again.",
    });
  }
};
export const deletePricePlan = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid price plan ID format",
      });
    }

    const pricePlan = await PricePlan.findById(id);

    if (!pricePlan) {
      return res.status(404).json({
        success: false,
        message: "Price plan not found",
      });
    }

    await pricePlan.deleteOne();

    res.status(200).json({
      success: true,
      message: "Price plan deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error deleting price plan. Please try again.",
    });
  }
};
export const getPricePlansForCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { isActive = "true" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }
    const categoryExists = await Category.exists({ _id: categoryId });
    if (!categoryExists) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const pricePlans = await PricePlan.getActivePlansForCategory(
      categoryId,
      isActive === "true"
    );
    const groupedPlans = {
      premium: pricePlans.filter((plan) => plan.planType === "premium"),
      featured: pricePlans.filter((plan) => plan.planType === "featured"),
    };

    res.status(200).json({
      success: true,
      count: pricePlans.length,
      data: {
        categoryId,
        plans: pricePlans,
        grouped: groupedPlans,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Server error fetching price plans for category. Please try again.",
    });
  }
};
export const getPricePlansForStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { isActive = "true", groupByCategory = "false" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid store ID format",
      });
    }
    const storeExists = await Store.exists({ _id: storeId });
    if (!storeExists) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    const pricePlans = await PricePlan.getActivePlansForStore(
      storeId,
      isActive === "true"
    );

    let responseData = {
      storeId,
      count: pricePlans.length,
      plans: pricePlans,
    };
    if (groupByCategory === "true") {
      const groupedByCategory = {};
      pricePlans.forEach((plan) => {
        const categoryId = plan.categoryId._id.toString();
        if (!groupedByCategory[categoryId]) {
          groupedByCategory[categoryId] = {
            category: plan.categoryId,
            plans: [],
          };
        }
        groupedByCategory[categoryId].plans.push(plan);
      });
      responseData.groupedByCategory = groupedByCategory;
    }

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error fetching price plans for store. Please try again.",
    });
  }
};
export const getPricePlansByType = async (req, res) => {
  try {
    const { planType } = req.params;
    const { isActive = "true", page = 1, limit = 20 } = req.query;

    if (!["premium", "featured"].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan type. Must be 'premium' or 'featured'",
      });
    }

    const skip = (page - 1) * limit;

    const pricePlans = await PricePlan.find({
      planType,
      isActive: isActive === "true",
    })
      .populate("categoryId", "name slug icon")
      .populate("storeId", "name slug")
      .sort({ duration: 1, price: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await PricePlan.countDocuments({
      planType,
      isActive: isActive === "true",
    });

    res.status(200).json({
      success: true,
      count: pricePlans.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: {
        planType,
        plans: pricePlans,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error fetching price plans by type. Please try again.",
    });
  }
};
export const bulkCreateDefaultPlans = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { storeId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({
        success: false,
        message: "Valid store ID is required",
      });
    }
    const [categoryExists, storeExists] = await Promise.all([
      Category.exists({ _id: categoryId }),
      Store.exists({ _id: storeId }),
    ]);

    if (!categoryExists) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (!storeExists) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }
    const defaultPlans = [
      { planType: "premium", duration: 7, price: 28 },
      { planType: "premium", duration: 14, price: 56 },
      { planType: "premium", duration: 30, price: 112 },
      { planType: "featured", duration: 7, price: 18 },
      { planType: "featured", duration: 14, price: 36 },
      { planType: "featured", duration: 30, price: 79 },
    ];

    const createdPlans = [];
    const skippedPlans = [];

    for (const planConfig of defaultPlans) {
      const existingPlan = await PricePlan.findOne({
        categoryId,
        planType: planConfig.planType,
        duration: planConfig.duration,
      });

      if (existingPlan) {
        skippedPlans.push({
          ...planConfig,
          reason: "Plan already exists",
        });
        continue;
      }
      const newPlan = await PricePlan.create({
        categoryId,
        storeId,
        planType: planConfig.planType,
        duration: planConfig.duration,
        price: planConfig.price,
        createdBy: req.user.id,
      });

      createdPlans.push(newPlan);
    }
    const populatedPlans = await PricePlan.find({
      _id: { $in: createdPlans.map((p) => p._id) },
    })
      .populate("categoryId", "name slug")
      .populate("storeId", "name slug")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: `Created ${createdPlans.length} plans, skipped ${skippedPlans.length} existing plans`,
      data: {
        created: populatedPlans,
        skipped: skippedPlans,
        summary: {
          totalCreated: createdPlans.length,
          totalSkipped: skippedPlans.length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error creating default price plans. Please try again.",
    });
  }
};
export const togglePricePlanStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid price plan ID format",
      });
    }

    const pricePlan = await PricePlan.findById(id);

    if (!pricePlan) {
      return res.status(404).json({
        success: false,
        message: "Price plan not found",
      });
    }

    pricePlan.isActive = !pricePlan.isActive;
    pricePlan.updatedBy = req.user.id;
    pricePlan.updatedAt = Date.now();

    await pricePlan.save();
    const populatedPlan = await PricePlan.findById(pricePlan._id)
      .populate("categoryId", "name slug")
      .populate("storeId", "name slug")
      .populate("updatedBy", "name email");

    res.status(200).json({
      success: true,
      message: `Price plan ${
        pricePlan.isActive ? "activated" : "deactivated"
      } successfully`,
      data: populatedPlan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error toggling price plan status. Please try again.",
    });
  }
};
