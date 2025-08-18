import admin from "firebase-admin";
import process from "process";

let firebaseApp = null;

const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null;

    if (!serviceAccount) {
      console.warn(
        "Firebase service account not configured. Push notifications disabled."
      );
      return null;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("Firebase Admin initialized for push notifications");
    return firebaseApp;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error.message);
    return null;
  }
};

export const sendPushNotification = async ({
  tokens,
  title,
  body,
  data = {},
  imageUrl,
}) => {
  try {
    const app = initializeFirebase();
    if (!app || !tokens?.length) return { success: false, results: [] };

    const messaging = admin.messaging(app);

    // Ensure tokens is an array
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];

    const message = {
      notification: {
        title: title || "New Notification",
        body: body || "",
        ...(imageUrl && { imageUrl }),
      },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)])
        ),
        click_action: data.url || "",
      },
    };

    // Use sendEachForMulticast instead of sendMulticast for better compatibility
    const multicastMessage = {
      ...message,
      tokens: tokenArray,
    };

    let response;
    try {
      // Try sendEachForMulticast first (newer method)
      response = await messaging.sendEachForMulticast(multicastMessage);
    } catch (multicastError) {
      console.log(
        "sendEachForMulticast not available, trying individual sends...",
        multicastError.message
      );

      // Fallback: send to each token individually
      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const token of tokenArray) {
        try {
          const individualMessage = {
            ...message,
            token: token,
          };

          const result = await messaging.send(individualMessage);
          results.push({ success: true, messageId: result });
          successCount++;
        } catch (err) {
          results.push({
            success: false,
            error: {
              code: err.code,
              message: err.message,
            },
          });
          failureCount++;
        }
      }

      response = {
        responses: results,
        successCount,
        failureCount,
      };
    }

    // Clean up invalid tokens
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === "messaging/registration-token-not-registered" ||
          resp.error?.code === "messaging/invalid-registration-token")
      ) {
        invalidTokens.push(tokenArray[idx]);
      }
    });

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
      results: response.responses,
    };
  } catch (error) {
    console.error("Push notification error:", error.message);
    return { success: false, error: error.message, results: [] };
  }
};

export const cleanupInvalidTokens = async (userId, invalidTokens) => {
  try {
    if (!invalidTokens?.length) return;

    const User = (await import("../models/User.js")).default;
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: { $in: invalidTokens } } },
    });
  } catch (error) {
    console.error("Failed to cleanup invalid tokens:", error.message);
  }
};
