import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { findCredentialPatterns } from "./credential-patterns.mjs";

const textExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".html",
  ".css",
  ".md",
  ".sql",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
  ".example",
]);
function isEnvironmentFile(file) {
  return (
    /(?:^|\/)\.env(?:\..*)?$/.test(file) &&
    path.basename(file) !== ".env.example"
  );
}
const findings = [];
let tracked = 0,
  built = 0,
  historyVersions = 0;
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
function inspect(text, location) {
  for (const kind of findCredentialPatterns(text))
    findings.push({ location, kind });
}
const files = git("ls-files", "-z").split("\0").filter(Boolean);
for (const file of files) {
  if (isEnvironmentFile(file))
    findings.push({ location: file, kind: "tracked-environment-file" });
  if (textExtensions.has(path.extname(file)) || file === ".gitignore") {
    inspect(await readFile(file, "utf8"), `tracked:${file}`);
    tracked++;
  }
}
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else {
      if (file.endsWith(".map"))
        findings.push({ location: file, kind: "public-source-map" });
      if (textExtensions.has(path.extname(file))) {
        inspect(await readFile(file, "utf8"), `build:${file}`);
        built++;
      }
    }
  }
}
try {
  if (!(await stat("dist")).isDirectory()) throw new Error();
  await walk("dist");
} catch {
  console.error(
    "Não foi possível inspecionar dist/. Execute npm run build antes da auditoria.",
  );
  process.exit(2);
}
if (process.argv.includes("--history")) {
  const objects = git("rev-list", "--objects", "--all").trim().split("\n");
  const seen = new Set();
  for (const line of objects) {
    const split = line.indexOf(" ");
    if (split < 0) continue;
    const oid = line.slice(0, split),
      file = line.slice(split + 1);
    if (isEnvironmentFile(file))
      findings.push({
        location: `history:${file}:${oid.slice(0, 8)}`,
        kind: "historical-environment-file",
      });
    if (
      seen.has(oid) ||
      (!textExtensions.has(path.extname(file)) && !isEnvironmentFile(file))
    )
      continue;
    seen.add(oid);
    inspect(git("cat-file", "blob", oid), `history:${file}:${oid.slice(0, 8)}`);
    historyVersions++;
  }
}
console.log(
  JSON.stringify(
    {
      trackedTextFiles: tracked,
      buildTextFiles: built,
      historyTextVersions: historyVersions,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exit(1);
