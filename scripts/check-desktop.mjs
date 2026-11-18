import { existsSync } from "node:fs";

const required = ["bin/yt-dlp.exe", "bin/ffmpeg.exe", "bin/qjs.exe"];
const missing = required.filter((file) => !existsSync(file));

if (missing.length) {
  console.error("Desktop build is missing local binaries:");
  for (const file of missing) console.error(`  ${file}`);
  console.error("");
  console.error("Run `npm run setup`, then try again.");
  process.exit(1);
}

console.log("Desktop binaries ready.");
