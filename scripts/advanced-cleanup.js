#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Advanced cleanup for JavaScript files by removing:
 * - All console.log, console.error, console.warn statements
 * - Single-line and multi-line comments
 * - Excessive empty lines
 * - Debug statements and logs
 */

function advancedCleanupJavaScriptFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, "utf8");
    let cleanedContent = originalContent;

    // Remove single-line comments but preserve URLs and comment-like patterns in strings
    cleanedContent = cleanedContent.replace(/^(\s*)\/\/.*$/gm, "");

    // Remove multi-line comments
    cleanedContent = cleanedContent.replace(/\/\*[\s\S]*?\*\//g, "");

    // Remove all console statements (log, error, warn, info, debug)
    cleanedContent = cleanedContent.replace(
      /^\s*console\.(log|error|warn|info|debug)\([^;]*\);?\s*$/gm,
      ""
    );
    cleanedContent = cleanedContent.replace(
      /console\.(log|error|warn|info|debug)\([^;]*\);\s*/g,
      ""
    );

    // Remove specific debug blocks
    cleanedContent = cleanedContent.replace(
      /console\.log\("=== LISTING REQUEST DEBUG ==="\);[\s\S]*?console\.log\("==============================="\);\s*/g,
      ""
    );

    // Clean up empty catch blocks that only had console statements
    cleanedContent = cleanedContent.replace(
      /} catch \([^)]*\) {\s*}\s*/g,
      "} catch (e) {\n  }\n"
    );
    cleanedContent = cleanedContent.replace(
      /} catch \{[\s]*\}/g,
      "} catch {\n  }"
    );

    // Remove excessive empty lines (more than 2 consecutive)
    cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n\s*\n+/g, "\n\n\n");
    cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n+/g, "\n\n");

    // Clean up empty lines at the beginning of functions
    cleanedContent = cleanedContent.replace(
      /(\{[\s]*)\n+(\s*[^}\s])/g,
      "$1\n$2"
    );

    // Remove trailing whitespace
    cleanedContent = cleanedContent.replace(/[ \t]+$/gm, "");

    // Ensure file ends with a single newline
    cleanedContent = cleanedContent.replace(/\n+$/, "\n");

    // Normalize spacing around braces
    cleanedContent = cleanedContent.replace(
      /} catch \(e\) {\s*}\s*/g,
      "} catch (e) {\n  }\n"
    );

    // Write the cleaned content back to the file
    fs.writeFileSync(filePath, cleanedContent, "utf8");

    console.log(`✅ Successfully cleaned up: ${filePath}`);

    // Calculate and display the reduction
    const originalLines = originalContent.split("\n").length;
    const cleanedLines = cleanedContent.split("\n").length;
    const reduction = originalLines - cleanedLines;
    const percentReduction = ((reduction / originalLines) * 100).toFixed(1);

    console.log(`📊 Reduced from ${originalLines} to ${cleanedLines} lines`);
    console.log(
      `📉 Removed ${reduction} lines (${percentReduction}% reduction)`
    );

    // Show character reduction
    const originalChars = originalContent.length;
    const cleanedChars = cleanedContent.length;
    const charReduction = originalChars - cleanedChars;
    const percentCharReduction = (
      (charReduction / originalChars) *
      100
    ).toFixed(1);

    console.log(
      `📝 Reduced from ${originalChars} to ${cleanedChars} characters`
    );
    console.log(
      `📉 Removed ${charReduction} characters (${percentCharReduction}% reduction)`
    );
  } catch (error) {
    console.error(`❌ Error cleaning up ${filePath}:`, error.message);
  }
}

// Allow script to accept multiple files or directories
function processPath(inputPath) {
  const fullPath = path.resolve(inputPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Path not found: ${fullPath}`);
    return;
  }

  const stat = fs.statSync(fullPath);

  if (stat.isFile() && fullPath.endsWith(".js")) {
    console.log(`🧹 Cleaning up JavaScript file: ${fullPath}`);
    advancedCleanupJavaScriptFile(fullPath);
  } else if (stat.isDirectory()) {
    console.log(`📁 Processing directory: ${fullPath}`);
    const files = fs.readdirSync(fullPath);

    files.forEach((file) => {
      const filePath = path.join(fullPath, file);
      const fileStat = fs.statSync(filePath);

      if (fileStat.isFile() && file.endsWith(".js")) {
        console.log(`🧹 Cleaning up JavaScript file: ${filePath}`);
        advancedCleanupJavaScriptFile(filePath);
      }
    });
  } else {
    console.log(`ℹ️  Skipping non-JavaScript file: ${fullPath}`);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  // Default to the listing controller if no arguments provided
  const defaultPath = path.join(
    __dirname,
    "..",
    "controllers",
    "listing.controller.js"
  );
  processPath(defaultPath);
} else {
  // Process all provided paths
  args.forEach(processPath);
}

console.log("🎉 Cleanup completed!");
