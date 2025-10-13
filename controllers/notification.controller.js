import Notification from "../models/Notification.js";
import NotificationPreference from "../models/NotificationPreference.js";
import User from "../models/User.js";
import {
  sendEmail,
  getListingNotificationEmail,
} from "../utils/emailService.js";
import { getIO } from "../utils/socket.js";
import {
  sendPushNotification,
  cleanupInvalidTokens,
} from "../utils/fcmService.js";
import process from "process";
import { capitalizeWords } from "./listing.controller.js";

export const buildNotification = ({
  userId,
  title,
  message,
  type,
  storeId,
  listingId,
  channels,
  metadata,
}) => ({
  userId,
  title,
  message,
  type: type || "system",
  storeId,
  listingId,
  channels: {
    inApp: channels?.inApp ?? true,
    email: channels?.email ?? false,
    push: channels?.push ?? true,
  },
  metadata,
});
export const createAndDispatchNotification = async (payload, io) => {
  if (!io) io = getIO();
  if (payload.channels?.inApp === false) {
    await handleEmailAndPushOnly(payload);
    return null;
  }
  const notif = await Notification.create(payload);
  try {
    io?.to?.(`user:${notif.userId}`)?.emit?.("notification:new", notif);
  } catch (e) {
  }
await handleEmailAndPushOnly(payload, notif);
  return notif;
};
const handleEmailAndPushOnly = async (payload, notif = null) => {
  if (payload.channels?.email) {
    const to = payload?.metadata?.toEmail;
    if (to) {
      const appUrl = process.env.CLIENT_URL;
      const ctaUrl = payload?.metadata?.slug
        ? `${appUrl}/ad/${payload.metadata.slug}`
        : payload?.listingId
        ? `${appUrl}/ad/${payload.listingId}`
        : undefined;
      const tpl = getListingNotificationEmail({
        title: payload.title,
        message: payload?.metadata?.metaLine || payload.message,
        image: payload?.metadata?.image,
        ctaUrl,
        storeName: "Rixdu",
      });
      await sendEmail({ to, ...tpl });
    }
  }
  if (payload.channels?.push) {
    try {
      const user = await User.findById(payload.userId)
        .select("fcmTokens")
        .lean();
      if (user?.fcmTokens?.length > 0) {
        const tokens = user.fcmTokens
          .filter((t) => t.token)
          .map((t) => t.token);
        if (tokens.length > 0) {
          const pushResult = await sendPushNotification({
            tokens,
            title: payload.title,
            body: payload?.metadata?.metaLine || payload.message,
            imageUrl: payload?.metadata?.image,
            data: {
              type: payload.type || "system",
              notificationId: notif?._id?.toString() || "no-db-record",
              storeId: payload.storeId || "",
              listingId: payload.listingId || "",
              slug: payload?.metadata?.slug || "",
            },
          });
          if (pushResult.invalidTokens?.length > 0) {
            await cleanupInvalidTokens(
              payload.userId,
              pushResult.invalidTokens
            );
          }
        }
      }
    } catch (e) {
  }
}
};
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unread, storeId } = req.query;
    const query = { userId: req.user.id };
    if (unread === "true") query.isRead = false;
    if (storeId) query.storeId = storeId;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      Notification.find(query)
        .populate("listingId", "title slug serviceType _id")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Notification.countDocuments(query),
    ]);
    res.json({
      success: true,
      count: items.length,
      total,
      page: pageNum,
      data: items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const toggleRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findOne({ _id: id, userId: req.user.id });
    if (!notif)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    notif.isRead = !notif.isRead;
    await notif.save();
    res.json({ success: true, data: notif });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Notification.deleteOne({
      _id: id,
      userId: req.user.id,
    });
    if (result.deletedCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      userId: req.user.id,
    });
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} notifications deleted`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const getPreferences = async (req, res) => {
  try {
    const items = await NotificationPreference.find({
      userId: req.user.id,
    }).lean();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const upsertPreference = async (req, res) => {
  try {
    const { storeId, channels } = req.body;
    if (!storeId)
      return res
        .status(400)
        .json({ success: false, message: "storeId is required" });
    const pref = await NotificationPreference.findOneAndUpdate(
      { userId: req.user.id, storeId },
      {
        $set: {
          channels: {
            email: !!channels?.email,
            inApp: !!channels?.inApp,
            push: !!channels?.push,
          },
        },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: pref });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
export const resolveChannelsForUserStore = async (
  userId,
  storeId,
  fallback = { email: false, inApp: true, push: true }
) => {
  const pref = await NotificationPreference.findOne({ userId, storeId }).lean();
  return {
    email: pref?.channels?.email ?? fallback.email,
    inApp: pref?.channels?.inApp ?? fallback.inApp,
    push: pref?.channels?.push ?? fallback.push,
  };
};
export const createNotificationWithPreferences = async ({
  userId,
  title,
  message,
  type,
  storeId,
  listingId,
  metadata,
  io,
}) => {
  const channels = await resolveChannelsForUserStore(userId, storeId);
  const payload = buildNotification({
    userId,
    title,
    message,
    type,
    storeId,
    listingId,
    channels,
    metadata,
  });
  return await createAndDispatchNotification(payload, io);
};
export const notifyStoreSubscribersOnListing = async ({
  storeId,
  listing,
  io,
  extraUsers = [],
}) => {
  const selectPrimaryImageFromListing = (l) => {
    try {
      const v = l?.values;
      if (!v) return null;
      const read = (key) => {
        try {
          if (typeof v.get === "function") return v.get(key);
          return v[key];
        } catch {
          return undefined;
        }
      };
      const pickUrl = (item) => {
        if (!item) return null;
        if (typeof item === "string") return item;
        if (item.url) return item.url;
        if (item.secure_url) return item.secure_url;
        return null;
      };
      const fields = [
        "images",
        "photos",
        "gallery",
        "image",
        "thumbnail",
        "cover",
        "banner",
        "files",
        "file",
      ];
      for (const key of fields) {
        const val = read(key);
        if (!val) continue;
        if (Array.isArray(val)) {
          for (const it of val) {
            if (
              it?.mimeType?.startsWith?.("image/") ||
              it?.url ||
              it?.secure_url
            ) {
              const u = pickUrl(it);
              if (u) return u;
            }
          }
        } else {
          if (
            val?.mimeType?.startsWith?.("image/") ||
            val?.url ||
            typeof val === "string"
          ) {
            const u = pickUrl(val);
            if (u) return u;
          }
        }
      }
    } catch (e) {
  }
return null;
  };
  if (!io) io = getIO();
  const prefs = await NotificationPreference.find({ storeId }).lean();
  const userChannels = new Map();
  for (const p of prefs) {
    if (p.userId)
      userChannels.set(
        p.userId.toString(),
        p.channels || { inApp: true, push: true }
      );
  }
  for (const u of extraUsers) {
    const id = (u?.userId || u)?.toString?.() || String(u?.userId || u);
    if (!id) continue;
    if (!userChannels.has(id))
      userChannels.set(id, u.channels || { inApp: true, push: true });
  }
  if (userChannels.size === 0) return { created: 0 };
  const getListingTitle = (l) => {
    try {
      const v = l?.values;
      const read = (key) => {
        try {
          if (typeof v.get === "function") return v.get(key);
          return v[key];
        } catch {
          return undefined;
        }
      };
      return (v && (read("title") || read("name"))) || "New listing";
    } catch {
      return "New listing";
    }
  };
  const listingTitle = getListingTitle(listing);
  const buildDetails = () => {
    try {
      const v = listing?.values;
      const read = (key) => {
        try {
          if (typeof v.get === "function") return v.get(key);
          return v[key];
        } catch {
          return undefined;
        }
      };
      const nums = ["price", "amount", "budget", "rent", "salary"];
      let priceVal;
      for (const k of nums) {
        const val = read(k);
        if (val !== undefined && val !== null && val !== "") {
          priceVal = val;
          break;
        }
      }
      const currency = read("currency") || read("unit") || "";
      const formatted =
        priceVal != null
          ? `${currency ? currency + " " : ""}${priceVal}`.trim()
          : null;
      const parts = [];
      if (formatted) parts.push(formatted);
      if (listing?.city) parts.push(capitalizeWords(listing.city));
      return { metaLine: parts.join(" • ") };
    } catch {
      return { metaLine: "" };
    }
  };
  const { metaLine } = buildDetails();
  const title = String(listingTitle);
  const message = metaLine || String(listingTitle);
  const ownerId = listing?.userId?.toString?.();
  const docs = Array.from(userChannels.entries())
    .filter(([uid]) => uid !== ownerId)
    .map(([uid, channels]) => ({
      userId: uid,
      title,
      message,
      type: "listing_created",
      storeId,
      listingId: listing?._id,
      channels: {
        inApp: !!channels?.inApp,
        email: !!channels?.email,
        push: !!channels?.push,
      },
      metadata: {
        slug: listing?.slug,
        image: selectPrimaryImageFromListing(listing) || undefined,
        metaLine,
      },
    }));
  const inAppDocs = docs.filter((doc) => doc.channels.inApp);
  const nonInAppDocs = docs.filter((doc) => !doc.channels.inApp);
  const inserted =
    inAppDocs.length > 0
      ? await Notification.insertMany(inAppDocs, { ordered: false })
      : [];
  try {
    for (const n of inserted) {
      io?.to?.(`user:${n.userId}`)?.emit?.("notification:new", n);
    }
  } catch (e) {
  }
for (const doc of nonInAppDocs) {
    try {
      await handleEmailAndPushOnly(doc);
    } catch (e) {
  }
}
  try {
    const emailUserIds = docs
      .filter((n) => n.channels?.email)
      .map((n) => n.userId?.toString?.())
      .filter(Boolean);
    if (emailUserIds.length > 0) {
      const users = await User.find({ _id: { $in: emailUserIds } })
        .select("email name")
        .lean();
      const appUrl = process.env.CLIENT_URL;
      const ctaUrl = listing?.slug
        ? `${appUrl}/ad/${listing.slug}`
        : listing?._id
        ? `${appUrl}/ad/${listing._id}`
        : undefined;
      const image = selectPrimaryImageFromListing(listing) || undefined;
      const tasks = [];
      for (const u of users) {
        if (!u?.email) continue;
        const tpl = getListingNotificationEmail({
          title,
          message,
          image,
          ctaUrl,
          storeName: "Rixdu",
        });
        tasks.push(sendEmail({ to: u.email, ...tpl }).catch(() => {}));
      }
      if (tasks.length) await Promise.allSettled(tasks);
    }
  } catch (e) {
  }
try {
    const pushUserIds = docs
      .filter((n) => n.channels?.push)
      .map((n) => n.userId?.toString?.())
      .filter(Boolean);
    if (pushUserIds.length > 0) {
      const usersWithTokens = await User.find({
        _id: { $in: pushUserIds },
        "fcmTokens.token": { $nin: [null, ""] },
      })
        .select("_id fcmTokens")
        .lean();
      if (usersWithTokens.length > 0) {
        const allTokensSet = new Set();
        const userTokenMap = new Map();
        for (const user of usersWithTokens) {
          const tokens =
            user.fcmTokens?.filter((t) => t?.token)?.map((t) => t.token) || [];
          if (tokens.length > 0) {
            tokens.forEach((t) => allTokensSet.add(t));
            userTokenMap.set(user._id.toString(), tokens);
          }
        }
        const allTokens = Array.from(allTokensSet);
        if (allTokens.length > 0) {
          let image;
          try {
            image = selectPrimaryImageFromListing(listing) || undefined;
          } catch {
            image = undefined;
          }
          const chunkSize = 500;
          const chunks = [];
          for (let i = 0; i < allTokens.length; i += chunkSize) {
            chunks.push(allTokens.slice(i, i + chunkSize));
          }
          for (const chunk of chunks) {
            try {
              const pushResult = await sendPushNotification({
                tokens: chunk,
                title,
                body: message,
                imageUrl: image,
                data: {
                  type: "listing_created",
                  storeId: storeId || "",
                  listingId: listing?._id?.toString() || "",
                  slug: listing?.slug || "",
                },
              });
              if (pushResult.invalidTokens?.length > 0) {
                const cleanupTasks = [];
                for (const [userId, userTokens] of userTokenMap.entries()) {
                  const invalidForUser = pushResult.invalidTokens.filter(
                    (token) => userTokens.includes(token)
                  );
                  if (invalidForUser.length > 0) {
                    cleanupTasks.push(
                      cleanupInvalidTokens(userId, invalidForUser)
                    );
                  }
                }
                if (cleanupTasks.length > 0) {
                  const results = await Promise.allSettled(cleanupTasks);
                  results.forEach((r, idx) => {
                    if (r.status === "rejected") {
                    }
                  });
                }
              }
            } catch (e) {
  }
}
        }
      }
    }
  } catch (e) {
  }
return {
    created: inserted.length,
    totalProcessed: docs.length,
    inAppNotifications: inserted.length,
    emailOnlyNotifications: nonInAppDocs.filter((d) => d.channels.email).length,
    pushOnlyNotifications: nonInAppDocs.filter(
      (d) => d.channels.push && !d.channels.email
    ).length,
  };
};
export const registerFCMToken = async (req, res) => {
  try {
    const { token, deviceId, userAgent } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    const userId = req.user.id;
    const User = (await import("../models/User.js")).default;
    const existingUser = await User.findById(userId);
    const existingToken = existingUser?.fcmTokens?.find(
      (t) => t.token === token
    );

    if (existingToken) {
      return res.json({
        success: true,
        message: "FCM token already registered",
        alreadyExists: true,
      });
    }
    await User.findByIdAndUpdate(userId, {
      $pull: {
        fcmTokens: {
          $or: [{ token: token }, { deviceId: deviceId }],
        },
      },
    });
    await User.findByIdAndUpdate(userId, {
      $push: {
        fcmTokens: {
          token,
          deviceId: deviceId || `device_${Date.now()}`,
          userAgent: userAgent || "",
          createdAt: new Date(),
        },
      },
    });

    res.json({
      success: true,
      message: "FCM token registered successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to register FCM token",
    });
  }
};
export const unregisterFCMToken = async (req, res) => {
  try {
    const { token, deviceId } = req.body;
    if (!token && !deviceId) {
      return res.status(400).json({
        success: false,
        message: "Either token or deviceId is required",
      });
    }
    const userId = req.user.id;
    const query = {};
    if (token) query.token = token;
    if (deviceId) query.deviceId = deviceId;
    const result = await User.findByIdAndUpdate(
      userId,
      { $pull: { fcmTokens: query } },
      { new: true }
    );
    res.json({
      success: true,
      message: "FCM token unregistered successfully",
      remainingTokens: result?.fcmTokens?.length || 0,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to unregister FCM token",
    });
  }
};
export const createTestNotification = async (req, res) => {
  try {
    const { title, message, storeId } = req.body;
    const userId = req.user.id;
    const notification = await createNotificationWithPreferences({
      userId,
      title: title || "Test Notification",
      message: message || "This is a test notification from Rixdu!",
      type: "system",
      storeId: storeId || null,
      metadata: {
        isTest: true,
        createdAt: new Date(),
      },
    });
    res.json({
      success: true,
      message: "Test notification created and sent successfully",
      notification: notification
        ? {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            channels: notification.channels,
          }
        : {
            message:
              "Notification not created - user has in-app notifications disabled",
            channelsProcessed:
              "email and/or push notifications may have been sent",
          },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to create test notification",
      error: err.message,
    });
  }
};
