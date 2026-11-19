import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageFiles = ["package.json", "shared/package.json", "server/package.json", "web/package.json"];
const semver = /^\d+\.\d+\.\d+$/;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function cargoPackageVersion(relativePath) {
  const section = readText(relativePath).match(/^\[package\][\s\S]*?(?=^\[|\Z)/m)?.[0];
  return section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
}

function cargoLockVersion() {
  return readText("src-tauri/Cargo.lock").match(
    /\[\[package\]\]\r?\nname = "app"\r?\nversion = "([^"]+)"/,
  )?.[1];
}

const rootVersion = readJson("package.json").version;
if (!semver.test(rootVersion)) {
  console.error(`Root package version "${rootVersion}" is not a stable semantic version.`);
  process.exit(1);
}

const mismatches = [];
for (const file of packageFiles) {
  const version = readJson(file).version;
  if (version !== rootVersion) {
    mismatches.push(`${file}: ${version ?? "(missing)"}`);
  }
}

const lock = readJson("package-lock.json");
const lockVersions = [
  ["package-lock.json", lock.version],
  ['package-lock.json packages[""]', lock.packages?.[""]?.version],
  ['package-lock.json packages["shared"]', lock.packages?.shared?.version],
  ['package-lock.json packages["server"]', lock.packages?.server?.version],
  ['package-lock.json packages["web"]', lock.packages?.web?.version],
];
for (const [label, version] of lockVersions) {
  if (version !== rootVersion) {
    mismatches.push(`${label}: ${version ?? "(missing)"}`);
  }
}

const tauriVersion = readJson("src-tauri/tauri.conf.json").version;
if (tauriVersion !== rootVersion) {
  mismatches.push(`src-tauri/tauri.conf.json: ${tauriVersion ?? "(missing)"}`);
}

const cargoVersion = cargoPackageVersion("src-tauri/Cargo.toml");
if (cargoVersion !== rootVersion) {
  mismatches.push(`src-tauri/Cargo.toml: ${cargoVersion ?? "(missing)"}`);
}

const cargoLockVersionValue = cargoLockVersion();
if (cargoLockVersionValue !== rootVersion) {
  mismatches.push(`src-tauri/Cargo.lock app package: ${cargoLockVersionValue ?? "(missing)"}`);
}

if (mismatches.length) {
  console.error(`Version drift detected. Expected ${rootVersion} everywhere:`);
  for (const mismatch of mismatches) console.error(`  ${mismatch}`);
  console.error("Run the release script or sync the package, Tauri, Cargo, and lockfile versions.");
  process.exit(1);
}

const refName = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_ACTIONS === "true" && refName?.startsWith("v") && refName.slice(1) !== rootVersion) {
  console.error(`Release tag ${refName} does not match package version ${rootVersion}.`);
  process.exit(1);
}

console.log(`Version ${rootVersion} is consistent across packages, package-lock.json, and the Tauri/Cargo manifests.`);
