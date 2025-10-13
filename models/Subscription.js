import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    planType: {
      type: String,
      enum: ["trial", "premium"],
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "pending", "incomplete"],
      default: "active",
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    endDate: {
      type: Date,
      required: function () {
        // endDate is only required for active or expired subscriptions
        return this.status === "active" || this.status === "expired";
      },
    },

    // For premium subscriptions
    price: {
      type: Number,
      default: 0, // 0 for trial, 27 for premium
    },

    currency: {
      type: String,
      default: "AED",
    },

    // Stripe subscription details for premium plans
    stripeSubscriptionId: {
      type: String,
      sparse: true,
    },

    stripeCustomerId: {
      type: String,
      sparse: true,
    },

    stripePaymentMethodId: {
      type: String,
      sparse: true,
    },

    // Auto-renewal (mainly for premium)
    autoRenew: {
      type: Boolean,
      default: false,
    },

    // Track trial usage
    hasUsedTrial: {
      type: Boolean,
      default: false,
    },

    // Payment tracking
    lastPaymentDate: {
      type: Date,
    },

    nextPaymentDate: {
      type: Date,
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "failed", "free"],
      default: "free", // for trial
    },

    // Cancellation details
    cancelledAt: {
      type: Date,
    },

    cancellationReason: {
      type: String,
    },

    // Metrics
    listingsCount: {
      type: Number,
      default: 0,
    },

    maxListings: {
      type: Number,
      default: function () {
        return this.planType === "trial" ? 1 : -1; // -1 means unlimited for premium
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
subscriptionSchema.index({ createdAt: -1 });

// Virtual for checking if subscription is currently active
subscriptionSchema.virtual("isActive").get(function () {
  return this.status === "active" && this.endDate > new Date();
});

// Virtual for checking if subscription is expired
subscriptionSchema.virtual("isExpired").get(function () {
  return this.endDate <= new Date() || this.status === "expired";
});

// Virtual for days remaining
subscriptionSchema.virtual("daysRemaining").get(function () {
  if (this.isExpired) return 0;
  const now = new Date();
  const diffTime = this.endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Static methods
subscriptionSchema.statics.findActiveSubscription = function (userId) {
  return this.findOne({
    userId,
    status: "active",
    endDate: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

subscriptionSchema.statics.hasUsedTrial = async function (userId) {
  const trialSubscription = await this.findOne({
    userId,
    planType: "trial",
  });
  return !!trialSubscription;
};

subscriptionSchema.statics.canCreateListing = async function (userId) {
  console.log("🔍 Checking canCreateListing for user:", userId);

  const activeSubscription = await this.findActiveSubscription(userId);
  console.log(
    "🔍 Active subscription found:",
    activeSubscription
      ? {
          id: activeSubscription._id,
          status: activeSubscription.status,
          planType: activeSubscription.planType,
          endDate: activeSubscription.endDate,
          userId: activeSubscription.userId,
        }
      : "None"
  );

  if (!activeSubscription) {
    // Let's also check all subscriptions for this user for debugging
    const allUserSubs = await this.find({ userId }).select(
      "status planType endDate createdAt"
    );
    console.log(
      "📋 All subscriptions for user:",
      userId,
      allUserSubs.map((s) => ({
        id: s._id,
        status: s.status,
        planType: s.planType,
        endDate: s.endDate,
        createdAt: s.createdAt,
      }))
    );
    return { canCreate: false, reason: "No active subscription" };
  }

  if (activeSubscription.planType === "premium") {
    return {
      canCreate: true,
      reason: "Premium subscription - unlimited listings",
    };
  }

  // For trial users, check listing count
  if (activeSubscription.listingsCount >= activeSubscription.maxListings) {
    return { canCreate: false, reason: "Trial listing limit reached" };
  }

  return { canCreate: true, reason: "Trial subscription - within limit" };
};

// Instance methods
subscriptionSchema.methods.extend = function (days) {
  this.endDate = new Date(this.endDate.getTime() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

subscriptionSchema.methods.cancel = function (reason = null) {
  this.status = "cancelled";
  this.cancelledAt = new Date();
  this.autoRenew = false;
  if (reason) this.cancellationReason = reason;
  return this.save();
};

subscriptionSchema.methods.expire = function () {
  this.status = "expired";
  this.autoRenew = false;
  return this.save();
};

subscriptionSchema.methods.incrementListingCount = function () {
  this.listingsCount += 1;
  return this.save();
};

subscriptionSchema.methods.decrementListingCount = function () {
  if (this.listingsCount > 0) {
    this.listingsCount -= 1;
  }
  return this.save();
};

// Pre-save middleware to handle automatic expiration
subscriptionSchema.pre("save", function (next) {
  if (this.endDate <= new Date() && this.status === "active") {
    console.warn(
      `⚠️ Subscription ${this._id} being marked as expired - endDate: ${
        this.endDate
      }, now: ${new Date()}`
    );
    this.status = "expired";
  }
  next();
});

// Static method to create trial subscription
subscriptionSchema.statics.createTrialSubscription = async function (userId) {
  const hasUsedTrial = await this.hasUsedTrial(userId);

  if (hasUsedTrial) {
    throw new Error("User has already used their free trial");
  }

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 7); // 7 days trial

  return this.create({
    userId,
    planType: "trial",
    status: "active",
    endDate: trialEndDate,
    price: 0,
    paymentStatus: "free",
    hasUsedTrial: true,
    maxListings: 1,
  });
};

// Static method to create premium subscription
subscriptionSchema.statics.createPremiumSubscription = async function (
  userId,
  stripeSubscriptionId,
  stripeCustomerId,
  stripePaymentMethodId
) {
  const premiumEndDate = new Date();
  premiumEndDate.setMonth(premiumEndDate.getMonth() + 1); // 1 month

  return this.create({
    userId,
    planType: "premium",
    status: "active",
    endDate: premiumEndDate,
    price: 27,
    currency: "AED",
    stripeSubscriptionId,
    stripeCustomerId,
    stripePaymentMethodId,
    paymentStatus: "paid",
    autoRenew: true,
    maxListings: -1, // unlimited
    lastPaymentDate: new Date(),
    nextPaymentDate: premiumEndDate,
  });
};

// Method to handle subscription renewal
subscriptionSchema.methods.renew = function () {
  if (this.planType === "premium") {
    this.endDate = new Date(this.endDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Add 30 days
    this.lastPaymentDate = new Date();
    this.nextPaymentDate = new Date(this.endDate);
    this.status = "active";
    this.paymentStatus = "paid";
  } else {
    throw new Error("Only premium subscriptions can be renewed");
  }
  return this.save();
};

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
