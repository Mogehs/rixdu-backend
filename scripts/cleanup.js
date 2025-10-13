#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Comprehensive JavaScript file cleanup utility
 * Removes logs, comments, and cleans up formatting
 */

function cleanupJavaScriptFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, "utf8");
    let content = originalContent;

    // Statistics tracking
    const stats = {
      originalLines: originalContent.split("\n").length,
      originalChars: originalContent.length,
      consoleStatements: 0,
      comments: 0,
      emptyLines: 0,
    };

    console.log(`\n🧹 Processing: ${path.basename(filePath)}`);

    // 1. Remove single-line comments
    const singleLineComments = content.match(/^\s*\/\/.*$/gm) || [];
    stats.comments += singleLineComments.length;
    content = content.replace(/^\s*\/\/.*$/gm, "");

    // 2. Remove multi-line comments
    const multiLineComments = content.match(/\/\*[\s\S]*?\*\//g) || [];
    stats.comments += multiLineComments.length;
    content = content.replace(/\/\*[\s\S]*?\*\//g, "");

    // 3. Remove console statements
    const consoleStatements =
      content.match(
        /^\s*console\.(log|error|warn|info|debug|table|time|timeEnd)\([^;]*\);?\s*$/gm
      ) || [];
    stats.consoleStatements += consoleStatements.length;
    content = content.replace(
      /^\s*console\.(log|error|warn|info|debug|table|time|timeEnd)\([^;]*\);?\s*$/gm,
      ""
    );

    // Remove inline console statements
    const inlineConsole =
      content.match(
        /console\.(log|error|warn|info|debug|table|time|timeEnd)\([^;]*\);\s*/g
      ) || [];
    stats.consoleStatements += inlineConsole.length;
    content = content.replace(
      /console\.(log|error|warn|info|debug|table|time|timeEnd)\([^;]*\);\s*/g,
      ""
    );

    // 4. Clean up empty catch blocks
    content = content.replace(
      /} catch \([^)]*\) {\s*}\s*/g,
      "} catch (e) {\n  }\n"
    );
    content = content.replace(/} catch \{[\s]*\}/g, "} catch {\n  }");

    // 5. Remove excessive empty lines
    const beforeEmptyLineCleanup = content.split("\n").length;
    content = content.replace(/\n\s*\n\s*\n\s*\n+/g, "\n\n\n");
    content = content.replace(/\n\s*\n\s*\n+/g, "\n\n");
    const afterEmptyLineCleanup = content.split("\n").length;
    stats.emptyLines = beforeEmptyLineCleanup - afterEmptyLineCleanup;

    // 6. Remove trailing whitespace
    content = content.replace(/[ \t]+$/gm, "");

    // 7. Ensure file ends with single newline
    content = content.replace(/\n+$/, "\n");

    // 8. Clean up specific debug patterns
    content = content.replace(
      /console\.log\("=== [^"]*DEBUG[^"]*==="\);[\s\S]*?console\.log\("=+"\);\s*/g,
      ""
    );

    // Write cleaned content
    fs.writeFileSync(filePath, content, "utf8");

    // Calculate final statistics
    const finalLines = content.split("\n").length;
    const finalChars = content.length;
    const linesRemoved = stats.originalLines - finalLines;
    const charsRemoved = stats.originalChars - finalChars;
    const lineReduction = ((linesRemoved / stats.originalLines) * 100).toFixed(
      1
    );
    const charReduction = ((charsRemoved / stats.originalChars) * 100).toFixed(
      1
    );

    // Display results
    console.log(
      `  📊 Lines: ${stats.originalLines} → ${finalLines} (-${linesRemoved} | -${lineReduction}%)`
    );
    console.log(
      `  📝 Chars: ${stats.originalChars} → ${finalChars} (-${charsRemoved} | -${charReduction}%)`
    );
    console.log(
      `  🗑️  Removed: ${stats.consoleStatements} console statements, ${stats.comments} comments, ${stats.emptyLines} empty lines`
    );

    if (linesRemoved > 0 || charsRemoved > 0) {
      console.log(`  ✅ Cleanup successful`);
    } else {
      console.log(`  ℹ️  File was already clean`);
    }

    return {
      processed: true,
      linesRemoved,
      charsRemoved,
      consoleStatements: stats.consoleStatements,
      comments: stats.comments,
    };
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return { processed: false, error: error.message };
  }
}

function processDirectory(dirPath, recursive = false) {
  const results = [];

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isFile() && item.endsWith(".js") && !item.includes(".min.")) {
        const result = cleanupJavaScriptFile(itemPath);
        results.push({ file: itemPath, ...result });
      } else if (
        stat.isDirectory() &&
        recursive &&
        !item.startsWith(".") &&
        item !== "node_modules"
      ) {
        const subResults = processDirectory(itemPath, recursive);
        results.push(...subResults);
      }
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${dirPath}: ${error.message}`);
  }

  return results;
}

function showSummary(results) {
  const processed = results.filter((r) => r.processed);
  const totalLinesRemoved = processed.reduce(
    (sum, r) => sum + r.linesRemoved,
    0
  );
  const totalCharsRemoved = processed.reduce(
    (sum, r) => sum + r.charsRemoved,
    0
  );
  const totalConsoleRemoved = processed.reduce(
    (sum, r) => sum + r.consoleStatements,
    0
  );
  const totalCommentsRemoved = processed.reduce(
    (sum, r) => sum + r.comments,
    0
  );

  console.log(`\n📈 SUMMARY`);
  console.log(`  📁 Files processed: ${processed.length}`);
  console.log(`  📉 Total lines removed: ${totalLinesRemoved}`);
  console.log(`  📝 Total characters removed: ${totalCharsRemoved}`);
  console.log(`  🗑️  Console statements removed: ${totalConsoleRemoved}`);
  console.log(`  💬 Comments removed: ${totalCommentsRemoved}`);

  const errors = results.filter((r) => !r.processed);
  if (errors.length > 0) {
    console.log(`  ⚠️  Errors: ${errors.length}`);
  }
}

// Main execution
const args = process.argv.slice(2);
let recursive = false;

// Check for recursive flag
if (args.includes("-r") || args.includes("--recursive")) {
  recursive = true;
  args.splice(
    args.indexOf(args.find((arg) => arg === "-r" || arg === "--recursive")),
    1
  );
}

console.log(`🚀 JavaScript Cleanup Tool`);
console.log(`📅 ${new Date().toLocaleString()}`);

if (args.length === 0) {
  console.log(`\nℹ️  Usage:`);
  console.log(`  node cleanup.js <file-or-directory> [-r|--recursive]`);
  console.log(`\nExample:`);
  console.log(`  node cleanup.js controllers/listing.controller.js`);
  console.log(`  node cleanup.js controllers/ -r`);
  process.exit(0);
}

const results = [];

for (const arg of args) {
  const targetPath = path.resolve(arg);

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Path not found: ${targetPath}`);
    continue;
  }

  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    if (targetPath.endsWith(".js")) {
      const result = cleanupJavaScriptFile(targetPath);
      results.push({ file: targetPath, ...result });
    } else {
      console.log(`ℹ️  Skipping non-JavaScript file: ${targetPath}`);
    }
  } else if (stat.isDirectory()) {
    console.log(
      `\n📁 Processing directory: ${targetPath} ${
        recursive ? "(recursive)" : ""
      }`
    );
    const dirResults = processDirectory(targetPath, recursive);
    results.push(...dirResults);
  }
}

if (results.length > 0) {
  showSummary(results);
}

console.log(`\n🎉 Cleanup completed!`);
