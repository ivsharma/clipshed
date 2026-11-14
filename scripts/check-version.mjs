import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageFiles = ["package.json", "shared/package.json", "server/package.json", "web/package.json"];
const semver = /^\d+\.\d+\.\d+$/;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
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

if (mismatches.length) {
  console.error(`Version drift detected. Expected ${rootVersion} everywhere:`);
  for (const mismatch of mismatches) console.error(`  ${mismatch}`);
  console.error("Run the release script or sync the package and lockfile versions.");
  process.exit(1);
}

const refName = process.env.GITHUB_REF_NAME;
if (process.env.GITHUB_ACTIONS === "true" && refName?.startsWith("v") && refName.slice(1) !== rootVersion) {
  console.error(`Release tag ${refName} does not match package version ${rootVersion}.`);
  process.exit(1);
}

console.log(`Version ${rootVersion} is consistent across the packages and package-lock.json.`);
