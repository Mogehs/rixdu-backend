import mongoose from "mongoose";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import stripe from "stripe";

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Get user's subscription status
export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const subscriptionStatus = await user.getSubscriptionStatus();

    res.status(200).json({
      success: true,
      data: subscriptionStatus,
    });
  } catch (error) {
    console.error("Get subscription status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching subscription status",
    });
  }
};

// Start free trial
export const startFreeTrial = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user has already used their trial
    const hasUsedTrial = await Subscription.hasUsedTrial(userId);
    if (hasUsedTrial) {
      return res.status(400).json({
        success: false,
        message: "You have already used your free trial",
      });
    }

    // Check if user already has an active subscription
    const activeSubscription = await Subscription.findActiveSubscription(
      userId
    );
    if (activeSubscription) {
      return res.status(400).json({
        success: false,
        message: "You already have an active subscription",
      });
    }

    // Create trial subscription
    const trialSubscription = await Subscription.createTrialSubscription(
      userId
    );

    res.status(201).json({
      success: true,
      message: "Free trial started successfully",
      data: trialSubscription,
    });
  } catch (error) {
    console.error("Start trial error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error starting free trial",
    });
  }
};

// Create premium subscription payment intent
export const createPremiumSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user already has an active premium subscription
    const activeSubscription = await Subscription.findActiveSubscription(
      userId
    );
    if (activeSubscription && activeSubscription.planType === "premium") {
      return res.status(400).json({
        success: false,
        message: "You already have an active premium subscription",
      });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripeClient.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: userId.toString(),
        },
      });
      stripeCustomerId = stripeCustomer.id;

      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: stripeCustomerId,
      });
    }

    // Create or get existing product for premium subscription
    let product;
    try {
      // Try to retrieve existing product
      const products = await stripeClient.products.list({
        limit: 10,
      });

      product = products.data.find(
        (p) => p.metadata?.type === "premium_subscription"
      );

      if (!product) {
        // Create new product if it doesn't exist
        product = await stripeClient.products.create({
          name: "Premium Listing Subscription",
          description: "Unlimited listings for 1 month",
          metadata: {
            type: "premium_subscription",
          },
        });
      }
    } catch (productError) {
      console.error("Error with product:", productError);
      throw productError;
    }

    // Get or create price for the product
    let price;
    try {
      // Check if price already exists for this product
      const prices = await stripeClient.prices.list({
        product: product.id,
        active: true,
        limit: 10,
      });

      price = prices.data.find(
        (p) =>
          p.unit_amount === 2700 &&
          p.currency === "aed" &&
          p.recurring?.interval === "month"
      );

      if (!price) {
        // Create new price if it doesn't exist
        price = await stripeClient.prices.create({
          currency: "aed",
          unit_amount: 2700, // 27 AED in fils (smallest currency unit)
          recurring: {
            interval: "month",
          },
          product: product.id,
        });
        console.log("Created new price:", price.id);
      } else {
        console.log("Using existing price:", price.id);
      }
    } catch (priceError) {
      console.error("Error with price:", priceError);
      throw priceError;
    }

    // Create Stripe subscription with automatic payment collection
    const subscription = await stripeClient.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: price.id }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        userId: userId.toString(),
        planType: "premium",
      },
      // Ensure we collect payment immediately
      collection_method: "charge_automatically",
    });

    console.log("Subscription created:", {
      id: subscription.id,
      status: subscription.status,
      latest_invoice: subscription.latest_invoice?.id,
      payment_intent: subscription.latest_invoice?.payment_intent?.id,
      payment_intent_status:
        subscription.latest_invoice?.payment_intent?.status,
      client_secret: subscription.latest_invoice?.payment_intent?.client_secret,
    });

    // For incomplete subscriptions, we need to return subscription details
    // Frontend will handle payment method collection and confirmation
    const responseData = {
      subscriptionId: subscription.id,
      customerId: stripeCustomerId,
      status: subscription.status,
      requiresPaymentMethod: true,
    };

    // Check if we have a payment intent (sometimes available immediately)
    const paymentIntent = subscription.latest_invoice?.payment_intent;
    if (paymentIntent?.client_secret) {
      responseData.clientSecret = paymentIntent.client_secret;
      responseData.requiresPaymentMethod = false;
      console.log("Payment intent available immediately:", paymentIntent.id);
    } else {
      console.log(
        "Subscription created, payment method required:",
        subscription.id
      );
    }

    // Return subscription details for frontend to complete payment
    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Create premium subscription error:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeCardError") {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    } else if (error.type === "StripeRateLimitError") {
      return res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please try again later.",
      });
    } else if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        success: false,
        message: "Invalid request to payment processor.",
        details: error.message,
      });
    } else if (error.type === "StripeAPIError") {
      return res.status(502).json({
        success: false,
        message: "Payment processor temporarily unavailable.",
      });
    } else if (error.type === "StripeConnectionError") {
      return res.status(502).json({
        success: false,
        message: "Network error with payment processor.",
      });
    } else if (error.type === "StripeAuthenticationError") {
      return res.status(500).json({
        success: false,
        message: "Payment processor authentication failed.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error creating premium subscription",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Simple confirmation - just check Stripe status (webhooks handle DB updates)
export const confirmPremiumSubscription = async (req, res) => {
  try {
    const { subscriptionId, paymentMethodId } = req.body;
    const userId = req.user.id;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: "Subscription ID is required",
      });
    }

    // Retrieve the subscription from Stripe
    const stripeSubscription = await stripeClient.subscriptions.retrieve(
      subscriptionId
    );

    // Verify ownership
    if (stripeSubscription.metadata.userId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to subscription",
      });
    }

    // If payment method provided, attach it to the customer first, then to the subscription
    if (paymentMethodId) {
      console.log(
        "Attaching payment method to customer and subscription:",
        paymentMethodId
      );

      // First, attach payment method to customer
      await stripeClient.paymentMethods.attach(paymentMethodId, {
        customer: stripeSubscription.customer,
      });

      console.log("Payment method attached to customer");

      // Then update subscription with payment method
      const updatedSubscription = await stripeClient.subscriptions.update(
        subscriptionId,
        {
          default_payment_method: paymentMethodId,
        }
      );

      console.log("Updated subscription status:", updatedSubscription.status);

      // For incomplete subscriptions, we need to confirm the payment
      if (updatedSubscription.status === "incomplete") {
        console.log("Subscription is incomplete, retrieving latest invoice...");

        // Get the latest invoice
        const invoice = await stripeClient.invoices.retrieve(
          updatedSubscription.latest_invoice,
          { expand: ["payment_intent"] }
        );

        console.log(
          "Latest invoice status:",
          invoice.status,
          "Payment intent:",
          invoice.payment_intent?.id
        );

        // Handle different invoice/payment scenarios
        if (!invoice.payment_intent && invoice.status === "open") {
          // No payment intent exists but invoice is open - try to pay directly
          console.log(
            "No payment intent found, attempting to pay invoice directly..."
          );

          try {
            const paidInvoice = await stripeClient.invoices.pay(invoice.id);
            console.log(
              "Invoice paid successfully, status:",
              paidInvoice.status
            );
          } catch (invoiceError) {
            console.error("Failed to pay invoice:", invoiceError.message);
            console.error("Invoice payment error details:", invoiceError);
          }
        }
        // If there's a payment intent that requires confirmation
        else if (
          invoice.payment_intent &&
          invoice.payment_intent.status === "requires_confirmation"
        ) {
          console.log("Confirming payment intent:", invoice.payment_intent.id);

          const confirmedPaymentIntent =
            await stripeClient.paymentIntents.confirm(
              invoice.payment_intent.id
            );

          console.log(
            "Payment intent confirmed, status:",
            confirmedPaymentIntent.status
          );
        } else if (
          invoice.payment_intent &&
          invoice.payment_intent.status === "requires_payment_method"
        ) {
          // If payment intent requires payment method, we might need to retry the invoice
          console.log(
            "Payment intent requires payment method, retrying invoice..."
          );

          try {
            const paidInvoice = await stripeClient.invoices.pay(invoice.id);
            console.log(
              "Invoice payment attempted, status:",
              paidInvoice.status
            );
          } catch (invoiceError) {
            console.error("Failed to pay invoice:", invoiceError.message);
          }
        }
      }
    }

    // Retrieve updated subscription status after potential payment confirmation
    const finalSubscription = await stripeClient.subscriptions.retrieve(
      subscriptionId
    );

    console.log("Final subscription status:", finalSubscription.status);

    // If subscription is now active, ensure our database is updated (fallback to webhook)
    if (finalSubscription.status === "active") {
      try {
        const dbSubscription = await Subscription.findOne({
          stripeSubscriptionId: subscriptionId,
        });

        if (dbSubscription && dbSubscription.status !== "active") {
          console.log("Updating database subscription to active (fallback)");
          dbSubscription.status = "active";
          dbSubscription.paymentStatus = "paid";
          // Update period dates with validation
          if (finalSubscription.current_period_start) {
            dbSubscription.currentPeriodStart = new Date(
              finalSubscription.current_period_start * 1000
            );
          }

          if (finalSubscription.current_period_end) {
            const endDate = new Date(
              finalSubscription.current_period_end * 1000
            );
            const now = new Date();
            const sevenDaysFromNow = new Date(
              now.getTime() + 7 * 24 * 60 * 60 * 1000
            );

            if (!isNaN(endDate.getTime()) && endDate > sevenDaysFromNow) {
              dbSubscription.currentPeriodEnd = endDate;
              dbSubscription.endDate = endDate;
              console.log("Using valid Stripe current_period_end:", endDate);
            } else {
              console.error(
                "Invalid or too soon current_period_end from Stripe, using fallback"
              );
              const fallbackDate = new Date();
              fallbackDate.setMonth(fallbackDate.getMonth() + 1);
              dbSubscription.endDate = fallbackDate;
              dbSubscription.currentPeriodEnd = fallbackDate;
            }
          } else {
            // Fallback: set to 1 month from now
            console.warn(
              "No current_period_end in Stripe subscription, using 1 month fallback"
            );
            const fallbackDate = new Date();
            fallbackDate.setMonth(fallbackDate.getMonth() + 1);
            dbSubscription.endDate = fallbackDate;
            dbSubscription.currentPeriodEnd = fallbackDate;
          }
          dbSubscription.activatedAt = dbSubscription.activatedAt || new Date();

          // Update price if missing
          if (!dbSubscription.price || dbSubscription.price === 0) {
            const stripePriceId = finalSubscription.items.data[0]?.price?.id;
            if (stripePriceId) {
              try {
                const stripePrice = await stripeClient.prices.retrieve(
                  stripePriceId
                );
                dbSubscription.price = stripePrice.unit_amount / 100; // Convert fils to AED
                dbSubscription.currency = stripePrice.currency.toUpperCase();
                dbSubscription.stripePriceId = stripePriceId;
                console.log(
                  `Fallback: Updated price to ${dbSubscription.price} ${dbSubscription.currency}`
                );
              } catch (priceError) {
                console.error(
                  "Error retrieving price in fallback:",
                  priceError
                );
              }
            }
          }

          await dbSubscription.save();
          console.log("Database subscription updated to active");
        }
      } catch (dbError) {
        console.error("Error updating database subscription:", dbError);
        // Don't fail the request if database update fails - webhook will handle it
      }
    }

    // Return status - webhooks will handle database updates
    res.status(200).json({
      success: true,
      message: "Subscription confirmed successfully",
      data: {
        subscriptionId: finalSubscription.id,
        status: finalSubscription.status,
        current_period_end: finalSubscription.current_period_end,
        cancel_at_period_end: finalSubscription.cancel_at_period_end,
      },
    });
  } catch (error) {
    console.error("Confirm premium subscription error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve subscription status",
    });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    const activeSubscription = await Subscription.findActiveSubscription(
      userId
    );

    if (!activeSubscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    // If it's a premium subscription, cancel in Stripe
    if (
      activeSubscription.planType === "premium" &&
      activeSubscription.stripeSubscriptionId
    ) {
      await stripeClient.subscriptions.update(
        activeSubscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );
    }

    // Cancel in our database
    await activeSubscription.cancel(reason);

    res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully",
      data: activeSubscription,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({
      success: false,
      message: "Server error cancelling subscription",
    });
  }
};

// Reactivate subscription - Users can resubscribe through normal subscription flow
// Webhooks will handle all status updates automatically

// Get subscription history
export const getSubscriptionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const subscriptions = await Subscription.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Subscription.countDocuments({ userId });

    res.status(200).json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalCount: total,
          hasNext: skip + subscriptions.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get subscription history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching subscription history",
    });
  }
};

// Webhooks are now handled by stripe-webhook.controller.js

// Check if user can create listing
export const checkListingEligibility = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Subscription.canCreateListing(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Check listing eligibility error:", error);
    res.status(500).json({
      success: false,
      message: "Server error checking listing eligibility",
    });
  }
};

// Admin: Get all subscriptions (simplified - use Stripe Dashboard for detailed analytics)
export const getAllSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, planType } = req.query;
    const skip = (page - 1) * limit;
    const filter = {};

    if (status) filter.status = status;
    if (planType) filter.planType = planType;

    const subscriptions = await Subscription.find(filter)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Subscription.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalCount: total,
        },
      },
    });
  } catch (error) {
    console.error("Get all subscriptions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching subscriptions",
    });
  }
};

// Removed syncSubscriptionStatus - webhooks handle all status updates automatically

export default {
  getSubscriptionStatus,
  startFreeTrial,
  createPremiumSubscription,
  confirmPremiumSubscription,
  cancelSubscription,
  getSubscriptionHistory,
  checkListingEligibility,
  getAllSubscriptions,
};
