import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const buildAllIfNone = args.has("--all-if-none");

const rootDir = process.cwd();
const appsDir = path.join(rootDir, "apps");

if (!fs.existsSync(appsDir)) {
  console.error("No apps directory found.");
  process.exit(1);
}

const appDirs = fs
  .readdirSync(appsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(appsDir, name, "package.json")))
  .sort((a, b) => a.localeCompare(b));

if (appDirs.length === 0) {
  console.log("No buildable apps found in apps/.");
  process.exit(0);
}

function runGit(argsList) {
  const result = spawnSync("git", argsList, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveNpmCommand() {
  if (process.platform !== "win32") return "npm";

  const inPath = spawnSync("where", ["npm.cmd"], { stdio: "ignore" });
  if (inPath.status === 0) return "npm.cmd";

  const absolute = path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "nodejs",
    "npm.cmd"
  );
  if (fs.existsSync(absolute)) return `"${absolute}"`;

  throw new Error("npm.cmd not found. Install Node.js and ensure npm is available.");
}

const trackedChanged = runGit(["diff", "--name-only", "--relative", "HEAD"]);
const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
const allChanged = [...new Set([...trackedChanged, ...untracked])];
const appSet = new Set(appDirs);
const changedApps = new Set();

for (const file of allChanged) {
  const normalized = file.replace(/\\/g, "/");
  if (!normalized.startsWith("apps/")) continue;
  const parts = normalized.split("/");
  if (parts.length < 2) continue;
  const appName = parts[1];
  if (appSet.has(appName)) changedApps.add(appName);
}

let targets = Array.from(changedApps).sort((a, b) => a.localeCompare(b));

if (targets.length === 0) {
  if (!buildAllIfNone) {
    console.log("No changed apps detected under apps/. Nothing to build.");
    process.exit(0);
  }
  console.log("No changed apps detected. Falling back to all apps.");
  targets = appDirs;
}

const npmCmd = resolveNpmCommand();

for (const appName of targets) {
  console.log(`\n==> Building ${appName}`);
  const prefixPath = path.join("apps", appName);
  const result =
    process.platform === "win32"
      ? spawnSync(`${npmCmd} --prefix "${prefixPath}" run build`, {
          stdio: "inherit",
          shell: true
        })
      : spawnSync(npmCmd, ["--prefix", prefixPath, "run", "build"], {
          stdio: "inherit"
        });
  if (result.error) {
    console.error(`Failed to start npm for ${appName}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Build failed for ${appName}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nBuild finished.");
