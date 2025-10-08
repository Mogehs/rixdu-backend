import mongoose from "mongoose";
import dotenv from "dotenv";
import Listing from "../models/Listing.js";
import Category from "../models/Category.js";

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

// Generate new slug format for existing listings
const generateNewSlug = async (listing) => {
  try {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 6);
    const uniqueId = `${timestamp}${randomStr}`;

    // Get category names for the path
    let categorySegments = [];

    if (listing.categoryPath && listing.categoryPath.length > 0) {
      // Get category names from categoryPath
      const categories = await Category.find({
        _id: { $in: listing.categoryPath },
      })
        .select("name slug")
        .lean();

      // Sort categories by their position in the path
      const sortedCategories = listing.categoryPath
        .map((pathId) =>
          categories.find((cat) => cat._id.toString() === pathId.toString())
        )
        .filter(Boolean);

      categorySegments = sortedCategories.map((cat) =>
        (cat.slug || cat.name)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
      );
    } else if (listing.categoryId) {
      // Fallback: get single category if no path
      const category = await Category.findById(listing.categoryId)
        .select("name slug")
        .lean();
      if (category) {
        const categorySlug = (category.slug || category.name)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        categorySegments = [categorySlug];
      }
    }

    // Process title from listing values
    let titleSlug = "";
    if (listing.values) {
      let titleValue = null;

      // Handle Map-based values (from populated documents)
      if (listing.values.get && typeof listing.values.get === "function") {
        titleValue = listing.values.get("title") || listing.values.get("name");
      }
      // Handle plain object values (from lean queries)
      else if (typeof listing.values === "object") {
        titleValue = listing.values.title || listing.values.name;
      }

      // Also check common field variations
      if (!titleValue && typeof listing.values === "object") {
        const possibleTitleFields = [
          "title",
          "Title",
          "name",
          "Name",
          "heading",
          "Heading",
          "productName",
          "itemName",
          "listingTitle",
          "adTitle",
        ];

        for (const field of possibleTitleFields) {
          if (listing.values[field]) {
            titleValue = listing.values[field];
            break;
          }
        }
      }

      if (titleValue && String(titleValue).trim()) {
        titleSlug = String(titleValue)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .substring(0, 40); // Limit title length
      }
    }

    // Build the final slug: /category/subcategory/title-uniqueId
    const pathSegments = [...categorySegments];

    if (titleSlug) {
      pathSegments.push(`${titleSlug}-${uniqueId}`);
    } else {
      pathSegments.push(`listing-${uniqueId}`);
    }

    // Join with "/" and ensure it starts with "/"
    const finalSlug = "/" + pathSegments.filter(Boolean).join("/");

    return finalSlug;
  } catch (error) {
    console.error("Error generating slug for listing:", listing._id, error);
    // Fallback to simple slug
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 6);
    return `/listing-${timestamp}${randomStr}`;
  }
};

// Check if slug already exists
const isSlugUnique = async (slug, excludeId = null) => {
  const query = { slug };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await Listing.findOne(query).lean();
  return !existing;
};

// Ensure slug is unique by adding suffix if needed
const ensureUniqueSlug = async (baseSlug, listingId) => {
  let finalSlug = baseSlug;
  let counter = 1;

  while (!(await isSlugUnique(finalSlug, listingId))) {
    const slugParts = baseSlug.split("-");
    const lastPart = slugParts.pop();
    const baseSlugWithoutId = slugParts.join("-");
    finalSlug = `${baseSlugWithoutId}-${lastPart}-${counter}`;
    counter++;
  }

  return finalSlug;
};

// Main migration function
const migrateSlugs = async () => {
  try {
    console.log("Starting slug migration...");

    // Get all listings
    const listings = await Listing.find({})
      .populate("categoryId", "name slug")
      .lean();

    console.log(`Found ${listings.length} listings to migrate`);

    let successCount = 0;
    let errorCount = 0;

    // Process listings in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          listings.length / batchSize
        )}`
      );

      for (const listing of batch) {
        try {
          // Generate new slug
          const newSlug = await generateNewSlug(listing);

          // Ensure uniqueness
          const uniqueSlug = await ensureUniqueSlug(newSlug, listing._id);

          // Update the listing
          await Listing.findByIdAndUpdate(
            listing._id,
            { slug: uniqueSlug },
            { new: true }
          );

          console.log(
            `✅ Updated listing ${listing._id}: ${
              listing.slug || "no-slug"
            } → ${uniqueSlug}`
          );
          successCount++;
        } catch (error) {
          console.error(
            `❌ Error updating listing ${listing._id}:`,
            error.message
          );
          errorCount++;
        }
      }

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n=== Migration Complete ===");
    console.log(`✅ Successfully updated: ${successCount} listings`);
    console.log(`❌ Errors: ${errorCount} listings`);
  } catch (error) {
    console.error("Migration failed:", error);
  }
};

// Dry run function to preview changes without making them
const dryRun = async () => {
  try {
    console.log("Starting dry run (no changes will be made)...");

    const listings = await Listing.find({})
      .populate("categoryId", "name slug")
      .limit(10) // Just show first 10 for preview
      .lean();

    console.log(`\nPreviewing first 10 listings:\n`);

    for (const listing of listings) {
      const newSlug = await generateNewSlug(listing);
      console.log(`📝 ${listing._id}:`);
      console.log(`   Current: ${listing.slug || "no-slug"}`);
      console.log(`   New:     ${newSlug}`);

      // Debug: Show available values
      if (listing.values && typeof listing.values === "object") {
        const availableKeys = Object.keys(listing.values);
        console.log(`   Values:  ${availableKeys.join(", ")}`);

        // Show actual title/name values if they exist
        const titleValue = listing.values.title || listing.values.name;
        if (titleValue) {
          console.log(`   Title:   "${titleValue}"`);
        }
      }
      console.log("");
    }
  } catch (error) {
    console.error("Dry run failed:", error);
  }
};

// Run the script
const run = async () => {
  await connectDB();

  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  if (isDryRun) {
    await dryRun();
  } else {
    console.log("⚠️  This will update ALL listing slugs in the database!");
    console.log("💡 Use --dry-run flag to preview changes first");
    console.log("⏳ Starting migration in 5 seconds...");

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await migrateSlugs();
  }

  process.exit(0);
};

// Handle errors
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

run();
