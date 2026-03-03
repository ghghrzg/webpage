import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const skipDirs = new Set([".git", "node_modules"]);
const htmlFiles = [];

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      htmlFiles.push(fullPath);
    }
  }
}

function hasIcoFavicon(html) {
  return /<link\b[^>]*rel=["'][^"']*\bicon\b[^"']*["'][^>]*href=["'][^"']*favicon\.ico[^"']*["'][^>]*>/i.test(html);
}

function hasPngFavicon(html) {
  return /<link\b[^>]*rel=["'][^"']*\bicon\b[^"']*["'][^>]*href=["'][^"']*lucsch_icon\.png[^"']*["'][^>]*>/i.test(html);
}

function injectFavicons(html) {
  const needsIco = !hasIcoFavicon(html);
  const needsPng = !hasPngFavicon(html);
  if (!needsIco && !needsPng) return null;

  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  const viewportRegex = /(^[ \t]*)<meta\s+name=["']viewport["'][^>]*>/im;
  const viewportMatch = html.match(viewportRegex);
  if (viewportMatch) {
    const indent = viewportMatch[1] ?? "";
    const injections = [];
    if (needsIco) injections.push(`${indent}<link rel="icon" href="/favicon.ico" sizes="any" />`);
    if (needsPng) injections.push(`${indent}<link rel="icon" type="image/png" href="/lucsch_icon.png" />`);
    const injectionBlock = injections.join(eol);
    return html.replace(viewportRegex, (match) => `${match}${eol}${injectionBlock}`);
  }

  const headOpenRegex = /(^[ \t]*)<head[^>]*>/im;
  const headOpenMatch = html.match(headOpenRegex);
  if (headOpenMatch) {
    const indent = `${headOpenMatch[1] ?? ""}  `;
    const injections = [];
    if (needsIco) injections.push(`${indent}<link rel="icon" href="/favicon.ico" sizes="any" />`);
    if (needsPng) injections.push(`${indent}<link rel="icon" type="image/png" href="/lucsch_icon.png" />`);
    const injectionBlock = injections.join(eol);
    return html.replace(headOpenRegex, (match) => `${match}${eol}${injectionBlock}`);
  }

  return null;
}

walk(rootDir);

let updatedCount = 0;
for (const filePath of htmlFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const updated = injectFavicons(source);
  if (updated == null || updated === source) continue;
  fs.writeFileSync(filePath, updated, "utf8");
  updatedCount += 1;
}

console.log(`Favicon sync complete. Updated ${updatedCount} HTML file(s).`);
