import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
  .filter((name) => fs.existsSync(path.join(appsDir, name, "package.json")));

if (appDirs.length === 0) {
  console.log("No installable apps found in apps/.");
  process.exit(0);
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

const npmCmd = resolveNpmCommand();

for (const appName of appDirs) {
  console.log(`\n==> Installing ${appName}`);
  const prefixPath = path.join("apps", appName);
  const result =
    process.platform === "win32"
      ? spawnSync(`${npmCmd} --prefix "${prefixPath}" install`, {
          stdio: "inherit",
          shell: true
        })
      : spawnSync(npmCmd, ["--prefix", prefixPath, "install"], {
          stdio: "inherit"
        });
  if (result.error) {
    console.error(`Failed to start npm for ${appName}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Install failed for ${appName}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nAll app installs completed.");
