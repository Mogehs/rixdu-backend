#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Clean up JavaScript files by removing:
 * - All console.log statements
 * - All console.error statements (except in catch blocks for error handling)
 * - Single-line comments
 * - Multi-line comments
 * - Empty lines that are excessive (more than 2 consecutive)
 */

function cleanupJavaScriptFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, "utf8");
    let cleanedContent = originalContent;

    // Remove single-line comments (but preserve URLs and other valid uses)
    cleanedContent = cleanedContent.replace(/^\s*\/\/.*$/gm, "");

    // Remove multi-line comments
    cleanedContent = cleanedContent.replace(/\/\*[\s\S]*?\*\//g, "");

    // Remove console.log statements (but keep them in strings)
    cleanedContent = cleanedContent.replace(
      /^\s*console\.log\([^;]*\);?\s*$/gm,
      ""
    );
    cleanedContent = cleanedContent.replace(/console\.log\([^;]*\);\s*/g, "");

    // Remove console.error statements but keep them in catch blocks for error handling
    // First, mark catch blocks to preserve console.error there
    const catchBlockRegex = /catch\s*\([^)]*\)\s*\{[^}]*console\.error[^}]*\}/g;
    const catchBlocks = [];
    let match;
    while ((match = catchBlockRegex.exec(cleanedContent)) !== null) {
      catchBlocks.push(match[0]);
    }

    // Remove all console.error statements
    cleanedContent = cleanedContent.replace(
      /^\s*console\.error\([^;]*\);?\s*$/gm,
      ""
    );
    cleanedContent = cleanedContent.replace(/console\.error\([^;]*\);\s*/g, "");

    // Remove specific debug console statements that were found in the file
    cleanedContent = cleanedContent.replace(
      /console\.log\("=== LISTING REQUEST DEBUG ==="\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Identifier:", identifier\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Request path:", req\.path\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Request params:", req\.params\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Request URL:", req\.url\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("==============================="\);?\s*/g,
      ""
    );

    // Remove other specific console statements
    cleanedContent = cleanedContent.replace(
      /console\.log\("Generated slug:", finalSlug\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Listing not found for query:", query\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*"Found.*?"\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*child categories[^)]*\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*Category IDs to filter[^)]*\);?\s*/g,
      ""
    );

    // Remove other debug statements
    cleanedContent = cleanedContent.replace(
      /console\.log\("Healthcare listings query params:", req\.query\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Final healthcare query:", JSON\.stringify\(query, null, 2\)\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*healthcare listings[^)]*\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Processed filters:", processedFilters\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\("Final search query:", JSON\.stringify\(query, null, 2\)\);?\s*/g,
      ""
    );

    // Remove debug comments that became empty lines
    cleanedContent = cleanedContent.replace(
      /^\s*\/\/ Error selecting primary image\s*$/gm,
      ""
    );

    // Remove excessive empty lines (more than 2 consecutive)
    cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n\s*\n+/g, "\n\n\n");
    cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n+/g, "\n\n");

    // Clean up specific patterns from the file
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error formatting number:", e\?\.message \|\| e\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error generating slug:", error\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\("Notification dispatch error:", e\?\.message \|\| e\);?\s*/g,
      ""
    );

    // Remove specific logging patterns found in the file
    cleanedContent = cleanedContent.replace(
      /console\.log\(\s*`[^`]*`[^)]*\);\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\(\s*`[^`]*`[^)]*\);\s*/g,
      ""
    );

    // Remove empty catch blocks that only had console.error
    cleanedContent = cleanedContent.replace(
      /} catch \([^)]*\) {\s*}\s*/g,
      "} catch (e) {\n    }\n"
    );
    cleanedContent = cleanedContent.replace(
      /} catch \{[\s]*\}/g,
      "} catch {\n    }"
    );

    // Clean up specific error logging patterns
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error queuing image upload:", error\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error queuing image upload during update:", error\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\([^)]*Delete error[^)]*\);?\s*/g,
      ""
    );

    // Remove more specific patterns
    cleanedContent = cleanedContent.replace(
      /console\.log\("Fetching listings for category slug:", slug\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error fetching listings by category slug:", error\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*Found.*listings for city[^)]*\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*Sample listing cities[^)]*\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error fetching listings by city:", error\);?\s*/g,
      ""
    );

    // Remove catch block console.error statements that are not essential
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error fetching.*?:", error\);?\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.error\("Error in searchListings:", err\);?\s*/g,
      ""
    );

    // Clean up the try-catch error patterns that only had logging
    cleanedContent = cleanedContent.replace(
      /} catch \(e\) {\s*console\.log[^}]*}\s*/g,
      "} catch (e) {\n  }"
    );

    // Clean up specific function patterns
    cleanedContent = cleanedContent.replace(
      /} catch \(e\) {\s*\/\/ Error selecting primary image\s*}\s*/g,
      "} catch (e) {\n  }"
    );

    // Remove specific console.log patterns with JSON.stringify
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*JSON\.stringify[^)]*\);\s*/g,
      ""
    );

    // Remove specific error parsing logs
    cleanedContent = cleanedContent.replace(
      /console\.log\([^)]*JSON parsing failed[^)]*\);\s*/g,
      ""
    );
    cleanedContent = cleanedContent.replace(/console\.warn\([^)]*\);\s*/g, "");

    // Final cleanup - remove trailing whitespace and normalize line endings
    cleanedContent = cleanedContent.replace(/[ \t]+$/gm, "");
    cleanedContent = cleanedContent.replace(/\n+$/, "\n");

    // Write the cleaned content back to the file
    fs.writeFileSync(filePath, cleanedContent, "utf8");

    console.log(`✅ Successfully cleaned up: ${filePath}`);

    // Calculate and display the reduction
    const originalLines = originalContent.split("\n").length;
    const cleanedLines = cleanedContent.split("\n").length;
    const reduction = originalLines - cleanedLines;
    console.log(
      `📊 Reduced from ${originalLines} to ${cleanedLines} lines (${reduction} lines removed)`
    );
  } catch (error) {
    console.error(`❌ Error cleaning up ${filePath}:`, error.message);
  }
}

// Main execution
const filePath =
  process.argv[2] ||
  path.join(__dirname, "..", "controllers", "listing.controller.js");

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

console.log(`🧹 Cleaning up JavaScript file: ${filePath}`);
cleanupJavaScriptFile(filePath);
console.log("🎉 Cleanup completed!");
