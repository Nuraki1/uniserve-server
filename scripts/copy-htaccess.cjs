const fs = require("fs");
const path = require("path");

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function main() {
  const root = path.resolve(__dirname, "..");
  const src = path.join(root, ".htaccess");
  const dist = path.join(root, "dist");
  const dst = path.join(dist, ".htaccess");

  if (!fs.existsSync(src)) {
    console.warn(`[copy-htaccess] Source not found: ${src} (skipping)`);
    return;
  }
  if (!fs.existsSync(dist)) {
    console.warn(`[copy-htaccess] Dist folder not found: ${dist} (skipping)`);
    return;
  }

  copyFile(src, dst);
  console.log(`[copy-htaccess] Copied ${src} -> ${dst}`);
}

main();


