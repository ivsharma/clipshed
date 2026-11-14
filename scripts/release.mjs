import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageFiles = ["package.json", "shared/package.json", "server/package.json", "web/package.json"];
const changelogPath = path.join(root, "CHANGELOG.md");
const kinds = new Set(["patch", "minor", "major"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const kind = args.find((argument) => !argument.startsWith("--"));

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function npm(script) {
  execSync(`npm ${script}`, { cwd: root, stdio: "inherit" });
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitRun(args) {
  execFileSync("git", args, { cwd: root, stdio: "inherit" });
}

function nextVersion(current, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) fail(`Current version "${current}" is not a stable semantic version.`);

  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function unreleasedNotes(changelog) {
  const heading = "## [Unreleased]";
  const start = changelog.indexOf(heading);
  if (start === -1) fail("CHANGELOG.md must contain a ## [Unreleased] section.");

  const bodyStart = start + heading.length;
  const nextHeading = changelog.indexOf("\n## [", bodyStart);
  const body = changelog.slice(bodyStart, nextHeading === -1 ? changelog.length : nextHeading).trim();
  if (!body) {
    fail("Add release notes under ## [Unreleased] before running a release.");
  }
  return body;
}

function promoteUnreleased(changelog, version, body) {
  const heading = "## [Unreleased]";
  const start = changelog.indexOf(heading);
  const bodyStart = start + heading.length;
  const nextHeading = changelog.indexOf("\n## [", bodyStart);
  const rest = nextHeading === -1 ? "" : changelog.slice(nextHeading);

  return `${changelog.slice(0, bodyStart)}\n\n## [${version}] - ${new Date().toISOString().slice(0, 10)}\n\n${body}\n${rest}`;
}

if (!kind || !kinds.has(kind)) {
  fail("Usage: npm run release:patch | npm run release:minor | npm run release:major");
}

const rootPackage = readJson("package.json");
const version = nextVersion(rootPackage.version, kind);

if (dryRun) {
  console.log(`Dry run: ${rootPackage.version} -> ${version}`);
  process.exit(0);
}

const status = git(["status", "--porcelain"]);
if (status) fail("The working tree is dirty. Commit or stash your changes before releasing.");

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`Releases must be created from main (current branch: ${branch}).`);

try {
  git(["rev-parse", "--verify", "--quiet", `refs/tags/v${version}`]);
  fail(`Tag v${version} already exists.`);
} catch (error) {
  if (error.status !== 1) throw error;
}

let changelog;
try {
  changelog = readFileSync(changelogPath, "utf8");
} catch {
  fail("CHANGELOG.md was not found.");
}
const notes = unreleasedNotes(changelog);
if (changelog.includes(`## [${version}]`)) fail(`CHANGELOG.md already contains a ${version} section.`);

console.log(`\nPreparing ${version} release...\n`);

npm("run version:check");
npm("run typecheck");
npm("test");
npm("run desktop:check");
npm("run desktop:verify");
npm("run build");
npm("run desktop:server");

for (const file of packageFiles) {
  const packageJson = readJson(file);
  packageJson.version = version;
  writeJson(file, packageJson);
}

npm("install --package-lock-only --ignore-scripts --no-audit --no-fund");
writeFileSync(changelogPath, promoteUnreleased(changelog, version, notes));
npm("run version:check");

gitRun(["add", ...packageFiles, "package-lock.json", "CHANGELOG.md"]);
gitRun(["commit", "-m", `chore(release): v${version}`]);
gitRun(["tag", "-a", `v${version}`, "-m", `Clipshed ${version}`]);

console.log(`\nReleased ${version} locally.`);
console.log("Push it with:");
console.log("  git push origin main --follow-tags");
console.log("Build the artifacts with:");
console.log("  npm run desktop:dist");
