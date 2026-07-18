import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");

export function findReleaseReadinessErrors({
  packageJson,
  changelog,
  approved,
  clean,
}) {
  const errors = [];
  const version = packageJson.version;

  if (packageJson.private !== false) {
    errors.push('package.json must set "private" to false');
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    errors.push("package version must be a stable x.y.z release");
  }
  if (readRepositoryUrl(packageJson.repository) === undefined) {
    errors.push("package.json must define repository.url");
  }
  if (typeof packageJson.homepage !== "string" || packageJson.homepage === "") {
    errors.push("package.json must define homepage");
  }
  if (
    typeof packageJson.bugs?.url !== "string" ||
    packageJson.bugs.url === ""
  ) {
    errors.push("package.json must define bugs.url");
  }
  if (
    typeof version === "string" &&
    !new RegExp(
      `^## \\[${escapeRegularExpression(version)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
      "m",
    ).test(changelog)
  ) {
    errors.push(`CHANGELOG.md must contain a dated ${String(version)} heading`);
  }
  if (!clean) {
    errors.push("git worktree must be clean");
  }
  if (!approved) {
    errors.push("A2UI_APPROVE_PUBLISH=1 is required");
  }

  return errors;
}

function readRepositoryUrl(repository) {
  if (typeof repository === "string" && repository !== "") {
    return repository;
  }
  if (
    typeof repository === "object" &&
    repository !== null &&
    typeof repository.url === "string" &&
    repository.url !== ""
  ) {
    return repository.url;
  }
  return undefined;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertReleaseReady() {
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const changelog = readFileSync(
    resolve(repositoryRoot, "CHANGELOG.md"),
    "utf8",
  );
  const clean =
    execFileSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim() === "";
  const errors = findReleaseReadinessErrors({
    packageJson,
    changelog,
    approved: process.env.A2UI_APPROVE_PUBLISH === "1",
    clean,
  });

  if (errors.length > 0) {
    throw new Error(`Release is not ready:\n- ${errors.join("\n- ")}`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  assertReleaseReady();
  console.log("Release readiness verified");
}
