const fs = require("fs");
const path = require("path");

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function main() {
  const root = path.resolve(__dirname, "..");
  const distDir = path.join(root, "dist");

  if (!fs.existsSync(distDir)) {
    console.warn(`[copy-htaccess] Missing ${distDir} (skipping)`);
    return;
  }

  const jobs = [
    // Single canonical .htaccess (place this in your cPanel document root)
    { src: path.join(root, ".htaccess"), dst: path.join(distDir, ".htaccess") },
  ];

  for (const j of jobs) {
    if (!fs.existsSync(j.src)) {
      console.warn(`[copy-htaccess] Missing ${j.src} (skipping)`);
      continue;
    }
    copyFile(j.src, j.dst);
    console.log(`[copy-htaccess] Copied ${j.src} -> ${j.dst}`);
  }
}

main();




