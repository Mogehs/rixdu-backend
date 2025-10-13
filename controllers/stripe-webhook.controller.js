import stripe from "stripe";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Main Stripe webhook handler
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("⚠️  Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`✅ Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object);
        break;

      default:
        console.log(`🤷‍♀️ Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
    // Always return 200 to prevent Stripe from retrying
    // Log the error for debugging but acknowledge receipt
    res.status(200).json({
      received: true,
      error: "Webhook handler failed",
      message: error.message,
    });
  }
};

// Handle subscription creation
async function handleSubscriptionCreated(stripeSubscription) {
  try {
    const userId = stripeSubscription.metadata?.userId;

    if (!userId) {
      console.error("No userId found in subscription metadata");
      return;
    }

    // Check if subscription already exists
    const existingSubscription = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    });

    if (existingSubscription) {
      console.log(`Subscription ${stripeSubscription.id} already exists`);
      return;
    }

    // Get price information from Stripe
    const stripePriceId = stripeSubscription.items.data[0]?.price?.id;
    let priceAmount = 0;
    let currency = "AED";

    if (stripePriceId) {
      try {
        const stripePrice = await stripeClient.prices.retrieve(stripePriceId);
        priceAmount = stripePrice.unit_amount / 100; // Convert from fils to AED
        currency = stripePrice.currency.toUpperCase();
        console.log(
          `Retrieved price: ${priceAmount} ${currency} for price ID: ${stripePriceId}`
        );
      } catch (priceError) {
        console.error("Error retrieving price from Stripe:", priceError);
      }
    }

    // Create subscription record with conditional endDate
    const subscriptionData = {
      userId,
      planType: "premium",
      status: stripeSubscription.status,
      price: priceAmount,
      currency: currency,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: stripeSubscription.customer,
      stripePriceId: stripePriceId,
      currentPeriodStart: new Date(
        stripeSubscription.current_period_start * 1000
      ),
      autoRenew: !stripeSubscription.cancel_at_period_end,
      paymentStatus:
        stripeSubscription.status === "active" ? "paid" : "pending",
    };

    // Only set endDate for active subscriptions (with validation)
    if (
      stripeSubscription.status === "active" &&
      stripeSubscription.current_period_end
    ) {
      const endDate = new Date(stripeSubscription.current_period_end * 1000);
      if (!isNaN(endDate.getTime())) {
        subscriptionData.endDate = endDate;
      } else {
        console.error("Invalid endDate in subscription creation:", endDate);
      }
    } else if (stripeSubscription.current_period_end) {
      const periodEnd = new Date(stripeSubscription.current_period_end * 1000);
      if (!isNaN(periodEnd.getTime())) {
        subscriptionData.currentPeriodEnd = periodEnd;
      }
    }

    const subscription = await Subscription.create(subscriptionData);

    console.log(`✅ Created subscription record: ${subscription._id}`);
  } catch (error) {
    console.error("Error handling subscription created:", error);
    throw error;
  }
}

// Handle subscription updates
async function handleSubscriptionUpdated(stripeSubscription) {
  try {
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    });

    if (!subscription) {
      console.error(`Subscription not found: ${stripeSubscription.id}`);
      return;
    }

    // Update subscription data
    subscription.status = stripeSubscription.status;
    subscription.currentPeriodStart = new Date(
      stripeSubscription.current_period_start * 1000
    );
    subscription.currentPeriodEnd = new Date(
      stripeSubscription.current_period_end * 1000
    );
    subscription.autoRenew = !stripeSubscription.cancel_at_period_end;

    // Update price information if it's missing or different
    const stripePriceId = stripeSubscription.items.data[0]?.price?.id;
    if (stripePriceId && (subscription.price === 0 || !subscription.price)) {
      try {
        const stripePrice = await stripeClient.prices.retrieve(stripePriceId);
        const priceAmount = stripePrice.unit_amount / 100; // Convert from fils to AED
        const currency = stripePrice.currency.toUpperCase();

        subscription.price = priceAmount;
        subscription.currency = currency;
        subscription.stripePriceId = stripePriceId;

        console.log(`Updated subscription price: ${priceAmount} ${currency}`);
      } catch (priceError) {
        console.error("Error retrieving price during update:", priceError);
      }
    }

    // Handle status changes
    if (stripeSubscription.status === "active") {
      subscription.paymentStatus = "paid";
      subscription.activatedAt = subscription.activatedAt || new Date();

      // Set endDate when subscription becomes active (with validation)
      if (stripeSubscription.current_period_end) {
        const endDate = new Date(stripeSubscription.current_period_end * 1000);
        if (!isNaN(endDate.getTime())) {
          subscription.endDate = endDate;
        } else {
          console.error("Invalid endDate in subscription update:", endDate);
        }
      }
    } else if (stripeSubscription.status === "canceled") {
      subscription.status = "cancelled";
      subscription.cancelledAt = new Date();
      subscription.paymentStatus = "failed";
    } else if (stripeSubscription.status === "incomplete") {
      subscription.paymentStatus = "pending";
      // Don't set endDate for incomplete subscriptions
    }

    await subscription.save();
    console.log(
      `✅ Updated subscription: ${subscription._id}, Status: ${subscription.status}`
    );
  } catch (error) {
    console.error("Error handling subscription updated:", error);
    throw error;
  }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(stripeSubscription) {
  try {
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    });

    if (!subscription) {
      console.error(`Subscription not found: ${stripeSubscription.id}`);
      return;
    }

    subscription.status = "cancelled";
    subscription.cancelledAt = new Date();
    subscription.cancellationReason = "Subscription deleted in Stripe";
    subscription.paymentStatus = "failed";

    await subscription.save();
    console.log(`✅ Cancelled subscription: ${subscription._id}`);
  } catch (error) {
    console.error("Error handling subscription deleted:", error);
    throw error;
  }
}

// Handle successful payments
async function handlePaymentSucceeded(invoice) {
  try {
    console.log(
      "🔔 Processing payment succeeded for invoice:",
      invoice.id,
      "subscription:",
      invoice.subscription
    );

    if (!invoice.subscription) {
      console.log("❌ No subscription ID in invoice");
      return;
    }

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription,
    });

    if (!subscription) {
      console.error(
        `❌ Subscription not found for invoice: ${invoice.id}, subscription: ${invoice.subscription}`
      );
      // Debug: List all subscriptions to see what's in the database
      const allSubs = await Subscription.find({}).select(
        "stripeSubscriptionId status userId"
      );
      console.log(
        "📋 All subscriptions in database:",
        allSubs.map((s) => ({
          id: s._id,
          stripeId: s.stripeSubscriptionId,
          status: s.status,
          userId: s.userId,
        }))
      );
      return;
    }

    console.log(
      "✅ Found subscription:",
      subscription._id,
      "current status:",
      subscription.status,
      "payment status:",
      subscription.paymentStatus
    );

    // Update payment status
    subscription.paymentStatus = "paid";
    subscription.status = "active";

    if (!subscription.activatedAt) {
      subscription.activatedAt = new Date();
    }

    // Get the latest subscription data from Stripe to ensure we have current period info
    const stripeSubscription = await stripeClient.subscriptions.retrieve(
      invoice.subscription
    );

    // Validate and set period dates
    if (stripeSubscription.current_period_start) {
      subscription.currentPeriodStart = new Date(
        stripeSubscription.current_period_start * 1000
      );
    }

    if (stripeSubscription.current_period_end) {
      subscription.currentPeriodEnd = new Date(
        stripeSubscription.current_period_end * 1000
      );

      // Set endDate when subscription becomes active (only if we have a valid end date)
      subscription.endDate = new Date(
        stripeSubscription.current_period_end * 1000
      );

      // Validate the endDate is actually valid
      if (isNaN(subscription.endDate.getTime())) {
        console.error("Invalid endDate calculated:", subscription.endDate);
        subscription.endDate = undefined;
      }
    } else {
      console.warn(
        "No current_period_end found in subscription, using alternative date sources"
      );

      // For premium subscriptions, always set to 1 month from now to avoid immediate expiry
      let fallbackEndDate = null;
      const now = new Date();

      // Check if invoice period_end is in the future and reasonable (at least 7 days from now)
      if (invoice.period_end) {
        const invoicePeriodEnd = new Date(invoice.period_end * 1000);
        const sevenDaysFromNow = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        if (invoicePeriodEnd > sevenDaysFromNow) {
          fallbackEndDate = invoicePeriodEnd;
          console.log("Using valid invoice period_end:", fallbackEndDate);
        } else {
          console.warn(
            "Invoice period_end is too soon or in the past:",
            invoicePeriodEnd
          );
        }
      }

      // If no valid invoice period or it's too soon, use 1 month from now
      if (!fallbackEndDate) {
        fallbackEndDate = new Date(now);
        fallbackEndDate.setMonth(fallbackEndDate.getMonth() + 1);
        console.log("Using 1 month from now:", fallbackEndDate);
      }

      if (fallbackEndDate && !isNaN(fallbackEndDate.getTime())) {
        subscription.endDate = fallbackEndDate;
        subscription.currentPeriodEnd = fallbackEndDate;
      } else {
        console.error(
          "Could not determine valid endDate, using final fallback"
        );
        // Final fallback: 1 month from now
        const finalFallback = new Date();
        finalFallback.setMonth(finalFallback.getMonth() + 1);
        subscription.endDate = finalFallback;
        subscription.currentPeriodEnd = finalFallback;
      }
    }

    try {
      await subscription.save();
      console.log(`✅ Payment succeeded - Subscription activated:`, {
        subscriptionId: subscription._id,
        userId: subscription.userId,
        status: subscription.status,
        paymentStatus: subscription.paymentStatus,
        endDate: subscription.endDate,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      });
    } catch (saveError) {
      console.error(
        "❌ Error saving subscription after payment success:",
        saveError
      );
      // Don't throw - let the webhook handler continue
    }
  } catch (error) {
    console.error("❌ Error in handlePaymentSucceeded:", error);
    // Don't throw - this prevents webhook failures that cause Stripe to retry
    console.error("Payment processing failed but webhook will not retry");
  }
}

// Handle failed payments
async function handlePaymentFailed(invoice) {
  try {
    if (!invoice.subscription) return;

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription,
    });

    if (!subscription) {
      console.error(`Subscription not found for invoice: ${invoice.id}`);
      return;
    }

    subscription.paymentStatus = "failed";
    // Don't change status to cancelled immediately - let Stripe handle retry logic

    await subscription.save();
    console.log(`❌ Payment failed for subscription: ${subscription._id}`);
  } catch (error) {
    console.error("Error handling payment failed:", error);
    throw error;
  }
}

// Handle trial ending soon
async function handleTrialWillEnd(stripeSubscription) {
  try {
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    });

    if (subscription) {
      // You can send notification emails here
      console.log(`⏰ Trial ending soon for subscription: ${subscription._id}`);
    }
  } catch (error) {
    console.error("Error handling trial will end:", error);
    throw error;
  }
}

export default {
  handleStripeWebhook,
};
