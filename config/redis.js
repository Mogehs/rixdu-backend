import Redis from "ioredis";
import process from "process";
import dotenv from "dotenv";

dotenv.config();

console.log("Connecting to Redis...", process.env.REDIS_URL);

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:");
});

export default redis;
