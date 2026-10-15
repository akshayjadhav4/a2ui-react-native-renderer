import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
const exporterSentinel = "Unsupported catalog schema at";

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
  assertBundleIsolation(consumerRoot, ["dist/ios", "dist/android"]);
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
  assertBundleIsolation(consumerRoot, ["dist/ios", "dist/android"]);
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
    "lib/module/catalog-schema.js",
    "lib/typescript/catalog-schema.d.ts",
    "lib/module/testing.js",
    "lib/typescript/testing.d.ts",
  ]) {
    if (!existsSync(join(installedRoot, path))) {
      throw new Error(`Installed package is missing ${path}`);
    }
  }

  const exporterSource = readFileSync(
    join(installedRoot, "lib/module/catalog/convertCatalogSchema.js"),
    "utf8",
  );
  if (!exporterSource.includes(exporterSentinel)) {
    throw new Error("Packed exporter sentinel is missing");
  }
  run(
    "node",
    [
      "--input-type=module",
      "-e",
      'import { exportA2UICatalogSchema } from "a2ui-react-native-renderer/catalog-schema"; if (typeof exportA2UICatalogSchema !== "function") process.exit(1);',
    ],
    consumerRoot,
  );

  run(
    "node",
    [
      "--input-type=module",
      "-e",
      `
    import { createA2UITestHarness } from "a2ui-react-native-renderer/testing";
    import { z } from "zod";
    const catalog = { id: "urn:packed:harness", components: { Text: { schema: z.object({ text: z.string() }), presenter: null } }, functions: [] };
    const harness = createA2UITestHarness({ catalogs: [catalog] });
    try {
      harness.engine.applyMessages([
        { version: "v0.9.1", createSurface: { surfaceId: "form", catalogId: catalog.id } },
        { version: "v0.9.1", updateComponents: { surfaceId: "form", components: [{ id: "root", component: "Text", text: "Packed" }] } }
      ]);
      if (harness.engine.getSurface("form")?.components.root.props.text !== "Packed" || harness.engine.getErrors().length) process.exitCode = 1;
    } finally { harness.engine.dispose(); }
  `,
    ],
    consumerRoot,
  );

  for (const unpublishedPath of ["src", "test", "example", "scripts"]) {
    if (existsSync(join(installedRoot, unpublishedPath))) {
      throw new Error(`Installed package leaked ${unpublishedPath}/`);
    }
  }
}

function assertBundleIsolation(consumerRoot, outputDirectories) {
  const forbidden = [
    exporterSentinel,
    "createA2UITestHarness",
    "@a2ui/web_core",
    "basic_catalog",
    "lit-html",
    "lit-element",
  ];
  for (const directory of outputDirectories) {
    const outputRoot = join(consumerRoot, directory);
    const bundles = walkFiles(outputRoot).filter((file) =>
      /\.(?:js|bundle|hbc|map)$/.test(file),
    );
    if (bundles.length === 0) {
      throw new Error(`No native bundle artifact found in ${directory}`);
    }
    for (const file of bundles) {
      const contents = readFileSync(file);
      for (const marker of forbidden) {
        if (contents.includes(marker)) {
          throw new Error(`Native bundle ${file} contains ${marker}`);
        }
      }
    }
  }
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(file) : [file];
  });
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
