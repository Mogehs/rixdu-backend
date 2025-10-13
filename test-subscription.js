import mongoose from "mongoose";
import Subscription from "./models/Subscription.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function testSubscriptionLookup() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Test 1: List all subscriptions
    const allSubscriptions = await Subscription.find({});
    console.log("\n=== ALL SUBSCRIPTIONS ===");
    allSubscriptions.forEach((sub) => {
      console.log(`ID: ${sub._id}`);
      console.log(`User ID: ${sub.userId}`);
      console.log(`Plan: ${sub.planType}`);
      console.log(`Status: ${sub.status}`);
      console.log(`Start: ${sub.startDate}`);
      console.log(`End: ${sub.endDate}`);
      console.log(`Stripe ID: ${sub.stripeSubscriptionId}`);
      console.log(`Created: ${sub.createdAt}`);
      console.log("---");
    });

    // Test 2: Try finding active subscriptions for each user
    const userIds = [
      ...new Set(allSubscriptions.map((s) => s.userId.toString())),
    ];

    for (const userId of userIds) {
      console.log(`\n=== TESTING USER: ${userId} ===`);

      const activeSubscription = await Subscription.findActiveSubscription(
        userId
      );
      console.log(
        "Active subscription found:",
        activeSubscription
          ? {
              id: activeSubscription._id,
              status: activeSubscription.status,
              planType: activeSubscription.planType,
              endDate: activeSubscription.endDate,
              isEndDateFuture: activeSubscription.endDate > new Date(),
            }
          : "None"
      );

      const canCreateResult = await Subscription.canCreateListing(userId);
      console.log("Can create listing:", canCreateResult);
    }
  } catch (error) {
    console.error("Test error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

testSubscriptionLookup();
