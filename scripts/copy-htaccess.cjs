const fs = require("fs");
const path = require("path");

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function main() {
  const root = path.resolve(__dirname, "..");
  const src = path.join(root, ".htaccess");
  const distDir = path.join(root, "dist");
  const dst = path.join(distDir, ".htaccess");

  if (!fs.existsSync(src)) {
    console.warn(`[copy-htaccess] Missing ${src} (skipping)`);
    return;
  }
  if (!fs.existsSync(distDir)) {
    console.warn(`[copy-htaccess] Missing ${distDir} (skipping)`);
    return;
  }

  copyFile(src, dst);
  console.log(`[copy-htaccess] Copied ${src} -> ${dst}`);
}

main();



