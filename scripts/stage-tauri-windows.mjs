import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Skipping Windows sidecar staging on this platform.");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE;
if (!targetTriple) {
  try {
    targetTriple = execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
  } catch {
    targetTriple = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  }
}
if (!targetTriple) {
  throw new Error("Could not determine the Rust host target triple.");
}

const binDir = path.join(root, "src-tauri", "binaries");
mkdirSync(binDir, { recursive: true });

const destination = path.join(binDir, `node-${targetTriple}.exe`);
if (!existsSync(process.execPath)) {
  throw new Error(`Node executable not found at ${process.execPath}`);
}

copyFileSync(process.execPath, destination);
console.log(`Staged Node sidecar: ${destination}`);

const serverBundle = path.join(root, "desktop", "build", "server.cjs");
if (!existsSync(serverBundle)) {
  console.warn("desktop/build/server.cjs is missing. Run `npm run desktop:server` before packaging.");
}
