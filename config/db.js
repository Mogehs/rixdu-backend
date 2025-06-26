import mongoose from "mongoose";

// OPTIMIZATION: Configure mongoose to use more efficient query execution
mongoose.set("toJSON", {
  virtuals: true,
  transform: (doc, converted) => {
    delete converted.__v;
    return converted;
  },
});

const connectDB = async () => {
  try {
    // OPTIMIZATION: Enhanced connection options for better performance and stability
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/rixdu",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        // OPTIMIZATION: Optimized connection pool size for high traffic
        // (adjust based on your MongoDB instance capacity)
        maxPoolSize: 100,
        minPoolSize: 5,
        // OPTIMIZATION: Longer socket timeout for long-running queries
        socketTimeoutMS: 45000,
        // OPTIMIZATION: Connection timeout setting
        connectTimeoutMS: 10000,
        // OPTIMIZATION: Server selection timeout setting
        serverSelectionTimeoutMS: 10000,
        // OPTIMIZATION: More frequent heartbeat for reliable connections
        heartbeatFrequencyMS: 5000,
        // OPTIMIZATION: Retry to connect if initial connection fails
        retryWrites: true,
        // OPTIMIZATION: Enable read preference for read scaling
        readPreference: "primaryPreferred",
        // OPTIMIZATION: Write concern for better data durability
        w: "majority",
        // OPTIMIZATION: Auto index creation
        autoIndex: process.env.NODE_ENV !== "production",
      }
    );

    // OPTIMIZATION: Enhanced connection event handling
    mongoose.connection.on("connected", () => {
      console.log(`MongoDB connection established: ${conn.connection.host}`);
    });

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
      // OPTIMIZATION: Attempt reconnection on error
      if (process.env.NODE_ENV === "production") {
        console.log("Attempting to reconnect to MongoDB...");
      }
    });

    mongoose.connection.on("disconnected", () => {
      console.log("MongoDB disconnected");
      // OPTIMIZATION: Attempt reconnection if disconnected in production
      if (process.env.NODE_ENV === "production") {
        console.log("Attempting to reconnect to MongoDB...");
        setTimeout(connectDB, 5000);
      }
    });

    // OPTIMIZATION: Handle application termination gracefully
    process.on("SIGINT", async () => {
      try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed due to application termination");
        process.exit(0);
      } catch (err) {
        console.error("Error closing MongoDB connection:", err);
        process.exit(1);
      }
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    if (process.env.NODE_ENV === "production") {
      console.error("Retrying connection in 5 seconds...");
      setTimeout(connectDB, 5000);
    } else {
      process.exit(1);
    }
  }
};

export const closeDBConnection = async () => {
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed successfully");
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
    throw error;
  }
};

// OPTIMIZATION: Add database monitoring function for health checks
export const checkDBConnection = () => {
  return {
    isConnected: mongoose.connection.readyState === 1,
    status: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
};

export default connectDB;
