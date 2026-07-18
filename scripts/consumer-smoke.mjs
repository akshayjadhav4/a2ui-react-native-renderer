import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPackedArtifact } from "./pack-check.mjs";

const packageName = "a2ui-react-native-renderer";
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const keepTemporaryFiles = process.env.A2UI_KEEP_SMOKE_TEMP === "1";
const smokeRoot = mkdtempSync(join(tmpdir(), "a2ui-consumer-smoke-"));

try {
  console.log(`Consumer smoke workspace: ${smokeRoot}`);
  const { tarballPath } = createPackedArtifact(join(smokeRoot, "artifact"));

  verifyExpoConsumer(tarballPath);
  verifyBareConsumer(tarballPath);
  console.log("Packed consumer smoke checks passed");
} finally {
  if (keepTemporaryFiles) {
    console.log(`Preserved consumer smoke workspace: ${smokeRoot}`);
  } else {
    rmSync(smokeRoot, { recursive: true, force: true });
  }
}

function verifyExpoConsumer(tarballPath) {
  const consumerRoot = join(smokeRoot, "expo");
  copyConsumer(join(repositoryRoot, "example/expo"), consumerRoot);
  installPackedDependency(consumerRoot, tarballPath);
  assertIsolatedPackage(consumerRoot);

  run("pnpm", ["exec", "tsc", "--noEmit"], consumerRoot);
  run(
    "pnpm",
    ["exec", "expo", "export", "--platform", "ios", "--output-dir", "dist/ios"],
    consumerRoot,
  );
  run(
    "pnpm",
    [
      "exec",
      "expo",
      "export",
      "--platform",
      "android",
      "--output-dir",
      "dist/android",
    ],
    consumerRoot,
  );
}

function verifyBareConsumer(tarballPath) {
  const consumerRoot = join(smokeRoot, "bare");
  copyConsumer(
    join(repositoryRoot, "test/fixtures/bare-consumer"),
    consumerRoot,
  );
  installPackedDependency(consumerRoot, tarballPath);
  assertIsolatedPackage(consumerRoot);
  mkdirSync(join(consumerRoot, "dist/ios"), { recursive: true });
  mkdirSync(join(consumerRoot, "dist/android"), { recursive: true });

  run("pnpm", ["run", "typecheck"], consumerRoot);
  run("pnpm", ["run", "bundle:ios"], consumerRoot);
  run("pnpm", ["run", "bundle:android"], consumerRoot);
}

function copyConsumer(sourceRoot, destinationRoot) {
  cpSync(sourceRoot, destinationRoot, {
    recursive: true,
    filter: (source) => {
      const path = relative(sourceRoot, source);
      const firstSegment = path.split(/[\\/]/, 1)[0];
      return ![".expo", ".vscode", "dist", "node_modules"].includes(
        firstSegment,
      );
    },
  });
}

function installPackedDependency(consumerRoot, tarballPath) {
  const packageJsonPath = join(consumerRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    [packageName]: `file:${tarballPath}`,
  };
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  run(
    "pnpm",
    ["install", "--ignore-scripts", "--no-frozen-lockfile", "--prefer-offline"],
    consumerRoot,
  );
}

function assertIsolatedPackage(consumerRoot) {
  const installedRoot = realpathSync(
    join(consumerRoot, "node_modules", packageName),
  );
  if (isInside(repositoryRoot, installedRoot)) {
    throw new Error(`${packageName} resolved back to the source repository`);
  }

  for (const path of [
    "package.json",
    "lib/module/index.js",
    "lib/typescript/index.d.ts",
  ]) {
    if (!existsSync(join(installedRoot, path))) {
      throw new Error(`Installed package is missing ${path}`);
    }
  }

  for (const unpublishedPath of ["src", "test", "example", "scripts"]) {
    if (existsSync(join(installedRoot, unpublishedPath))) {
      throw new Error(`Installed package leaked ${unpublishedPath}/`);
    }
  }
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function run(command, args, cwd) {
  console.log(`\n[${relative(smokeRoot, cwd)}] ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
  });
}
