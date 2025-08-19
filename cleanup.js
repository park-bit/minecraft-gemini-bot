import fs from "fs";
import path from "path";

const projectRoot = process.cwd();

// Folders to remove completely
const removeDirs = [
  "components",       // React components
  "icons",            // UI icons if nested
  "public"            // frontend assets if present
];

// Files to remove
const removeFiles = [
  "index.html",
  "index.tsx",
  "App.tsx",
  "vite.config.ts",
  "tsconfig.json",
  "apiKey.js",
  ".env.local"
];

// Extensions to remove (frontend only)
const removeExts = [".tsx", ".html", ".ts"];

// Helper: delete file if exists
function safeDelete(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
    console.log("❌ Removed:", filePath);
  }
}

// Remove specific files
removeFiles.forEach(file => {
  safeDelete(path.join(projectRoot, file));
});

// Remove entire directories
removeDirs.forEach(dir => {
  safeDelete(path.join(projectRoot, dir));
});

// Walk through and remove files with matching extensions
function walkAndClean(dir) {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkAndClean(filePath);
    } else {
      if (removeExts.some(ext => file.endsWith(ext))) {
        safeDelete(filePath);
      }
    }
  });
}

walkAndClean(projectRoot);

console.log("\n✅ Cleanup complete. Only bot + Gemini code should remain!");
