import Stripe from "stripe";
import mongoose from "mongoose";
import process from "process";
import Listing from "../models/Listing.js";
import PricePlan from "../models/PricePlan.js";
import User from "../models/User.js";
import { createListing } from "./listing.controller.js";
const tempPaymentData = new Map();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (
  !stripeSecretKey ||
  stripeSecretKey === "sk_test_your_stripe_secret_key_here"
) {
}

const stripe =
  stripeSecretKey && stripeSecretKey !== "sk_test_your_stripe_secret_key_here"
    ? new Stripe(stripeSecretKey)
    : null;
export const createPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message:
          "Payment service is not available. Stripe configuration is missing.",
        error: "STRIPE_NOT_CONFIGURED",
      });
    }

    const { planId, listingData, currency = "aed" } = req.body;
    if (!planId || !listingData) {
      return res.status(400).json({
        success: false,
        message: "Plan ID and listing data are required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID format",
      });
    }
    const pricePlan = await PricePlan.findById(planId);
    if (!pricePlan) {
      return res.status(404).json({
        success: false,
        message: "Price plan not found",
      });
    }

    if (!pricePlan.isActive) {
      return res.status(400).json({
        success: false,
        message: "Price plan is not active",
      });
    }
    let stripeCustomerId = req.user.stripeCustomerId;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: {
          userId: req.user.id.toString(),
        },
      });

      stripeCustomerId = stripeCustomer.id;
      await User.findByIdAndUpdate(req.user.id, {
        stripeCustomerId: stripeCustomerId,
      });
    }
    const priceToUse = pricePlan.discountedPrice || pricePlan.price;
    const amount = Math.round(priceToUse * 100);
    const paymentReference = `payment_${Date.now()}_${req.user.id}`;
    tempPaymentData.set(paymentReference, {
      listingData,
      userId: req.user.id.toString(),
      planId: planId.toString(),
      planType: pricePlan.planType,
      planDuration: pricePlan.duration,
      createdAt: new Date(),
    });
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      customer: stripeCustomerId,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        planId: planId.toString(),
        userId: req.user.id.toString(),
        planType: pricePlan.planType,
        planDuration: pricePlan.duration.toString(),
        paymentReference: paymentReference,
        categoryId: listingData.categoryId || "",
        storeId: listingData.storeId || "",
      },
    });

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        currency,
        plan: {
          id: pricePlan._id,
          type: pricePlan.planType,
          duration: pricePlan.duration,
          price: pricePlan.price,
          discountedPrice: pricePlan.discountedPrice,
          discountPercentage: pricePlan.discountPercentage,
          currency: pricePlan.currency,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error creating payment intent. Please try again.",
    });
  }
};
export const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment intent ID is required",
      });
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: "Payment intent not found",
      });
    }

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        success: false,
        message: `Payment not successful. Status: ${paymentIntent.status}`,
      });
    }
    const { planId, userId, planType, planDuration, paymentReference } =
      paymentIntent.metadata;
    if (userId !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized payment confirmation",
      });
    }
    const storedPaymentData = tempPaymentData.get(paymentReference);
    if (!storedPaymentData) {
      return res.status(404).json({
        success: false,
        message:
          "Payment data not found. Please try creating the payment again.",
      });
    }
    tempPaymentData.delete(paymentReference);
    const pricePlan = await PricePlan.findById(planId);
    if (!pricePlan) {
      return res.status(404).json({
        success: false,
        message: "Price plan not found",
      });
    }
    const { listingData } = storedPaymentData;
    const valuesMap = {
      ...listingData.values, // Include all the dynamic field values from the draft
      ...req.body.values, // Include uploaded file data processed by middleware
    };
    const mockReq = {
      body: {
        storeId: listingData.storeId,
        categoryId: listingData.categoryId,
        city: listingData.city,
        values: valuesMap,
      },
      user: req.user,
      files: req.files, // Include files if any
    };
    let listingResult = null;
    let createListingError = null;

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          if (code >= 200 && code < 300) {
            listingResult = data;
          } else {
            createListingError = data;
          }
          return mockRes;
        },
      }),
    };
    await createListing(mockReq, mockRes);
    if (createListingError) {
      return res.status(400).json({
        success: false,
        message: "Failed to create listing after payment",
        error: createListingError,
      });
    }
    const createdListing = listingResult?.data;
    if (!createdListing) {
      return res.status(500).json({
        success: false,
        message: "Listing was created but response data is missing",
      });
    }
    const updatedListing = await Listing.findByIdAndUpdate(
      createdListing._id,
      {
        plan: planType,
        planDuration: parseInt(planDuration),
        planPrice: pricePlan.discountedPrice || pricePlan.price,
        planOriginalPrice: pricePlan.price,
        planDiscountPercentage: pricePlan.discountPercentage || 0,
        planCurrency: pricePlan.currency,
        isPremium: planType === "premium",
        isFeatured: planType === "featured",
        isVerified: true,
        stripePaymentIntentId: paymentIntentId,
        stripeCustomerId: paymentIntent.customer,
        paymentStatus: "succeeded",
        paymentAmount: paymentIntent.amount / 100,
        paymentCurrency: paymentIntent.currency.toUpperCase(),
        paymentDate: new Date(),
      },
      { new: true }
    )
      .populate("categoryId", "name slug icon")
      .populate("storeId", "name slug")
      .populate("userId", "name email");

    res.status(201).json({
      success: true,
      message: "Payment confirmed and listing created successfully",
      data: updatedListing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error confirming payment. Please try again.",
    });
  }
};
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await Listing.findOneAndUpdate(
          { stripePaymentIntentId: paymentIntent.id },
          {
            paymentStatus: "succeeded",
            paymentDate: new Date(),
            isVerified: true,
          }
        );
        break;
      }

      case "payment_intent.payment_failed": {
        const failedPayment = event.data.object;
        await Listing.findOneAndUpdate(
          { stripePaymentIntentId: failedPayment.id },
          {
            paymentStatus: "failed",
          }
        );
        break;
      }

      case "payment_intent.canceled": {
        const canceledPayment = event.data.object;
        await Listing.findOneAndUpdate(
          { stripePaymentIntentId: canceledPayment.id },
          {
            paymentStatus: "canceled",
          }
        );
        break;
      }

      default:
    }

    res.status(200).json({ received: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Webhook handler error",
    });
  }
};
export const getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const payments = await Listing.find({
      userId: req.user.id,
      paymentStatus: { $in: ["succeeded", "failed", "canceled"] },
      plan: { $ne: "free" },
    })
      .populate("categoryId", "name slug icon")
      .populate("storeId", "name slug")
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Listing.countDocuments({
      userId: req.user.id,
      paymentStatus: { $in: ["succeeded", "failed", "canceled"] },
      plan: { $ne: "free" },
    });

    res.status(200).json({
      success: true,
      count: payments.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: payments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error fetching payment history. Please try again.",
    });
  }
};
export const createVerificationPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        message:
          "Payment service is not available. Stripe configuration is missing.",
        error: "STRIPE_NOT_CONFIGURED",
      });
    }

    const { currency = "aed" } = req.body;
    const user = await User.findById(req.user.id);
    const canCreatePaymentIntent =
      (user.documentVerification.status === "unverified" &&
        user.documentVerification.paymentStatus === "unpaid") ||
      (user.documentVerification.status === "rejected" &&
        user.documentVerification.paymentStatus === "unpaid");

    if (!canCreatePaymentIntent) {
      return res.status(400).json({
        success: false,
        message: `Cannot create payment intent. Current status: ${user.documentVerification.status}, Payment status: ${user.documentVerification.paymentStatus}`,
      });
    }
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
        },
      });

      stripeCustomerId = stripeCustomer.id;
      await User.findByIdAndUpdate(user._id, {
        stripeCustomerId: stripeCustomerId,
      });
    }
    const amount = 900; // AED 9.00 in cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      customer: stripeCustomerId,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId: user._id.toString(),
        type: "verification",
        amount_aed: "9.00",
      },
      description: "Verification Charges - AED 9",
    });

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        currency,
        description: "Verification Charges - AED 9",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Server error creating verification payment intent. Please try again.",
    });
  }
};
export const confirmVerificationPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment intent ID is required",
      });
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: "Payment intent not found",
      });
    }

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        success: false,
        message: `Payment not successful. Status: ${paymentIntent.status}`,
      });
    }
    const { userId } = paymentIntent.metadata;
    if (userId !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized payment confirmation",
      });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    user.documentVerification.paymentStatus = "paid";
    user.documentVerification.paymentIntentId = paymentIntentId;
    user.documentVerification.paymentAmount = paymentIntent.amount / 100;
    user.documentVerification.paymentCurrency =
      paymentIntent.currency.toUpperCase();
    user.documentVerification.paymentDate = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Verification payment confirmed successfully. You can now submit your verification documents.",
      data: {
        paymentStatus: "paid",
        paymentAmount: paymentIntent.amount / 100,
        paymentCurrency: paymentIntent.currency.toUpperCase(),
        canSubmitVerification: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Server error confirming verification payment. Please try again.",
    });
  }
};
export const refundPayment = async (req, res) => {
  try {
    const { listingId } = req.params;
    const { reason, amount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID format",
      });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    if (!listing.stripePaymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "No payment found for this listing",
      });
    }

    if (listing.paymentStatus !== "succeeded") {
      return res.status(400).json({
        success: false,
        message: "Payment was not successful, cannot refund",
      });
    }
    const refundAmount = amount
      ? Math.round(amount * 100)
      : Math.round(listing.paymentAmount * 100);
    const refund = await stripe.refunds.create({
      payment_intent: listing.stripePaymentIntentId,
      amount: refundAmount,
      reason: reason || "requested_by_customer",
      metadata: {
        listingId: listingId.toString(),
        adminId: req.user.id.toString(),
      },
    });
    listing.refundId = refund.id;
    listing.refundAmount = refundAmount / 100; // Convert back from cents
    listing.refundDate = new Date();
    listing.paymentStatus = "refunded";
    listing.isVerified = false;
    listing.isPremium = false;
    listing.isFeatured = false;
    listing.plan = "free";

    await listing.save();

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: {
        refundId: refund.id,
        refundAmount: refund.amount / 100,
        status: refund.status,
        listing: listing,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error processing refund. Please try again.",
    });
  }
};
