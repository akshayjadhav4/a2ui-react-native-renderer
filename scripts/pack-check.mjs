import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const requiredFiles = [
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "RELEASING.md",
  "SECURITY.md",
  "docs/api.md",
  "docs/architecture.md",
  "docs/catalogs.md",
  "docs/concepts.md",
  "docs/errors-and-security.md",
  "docs/migration.md",
  "docs/streaming-and-actions.md",
  "docs/testing.md",
  "package.json",
  "lib/module/index.js",
  "lib/typescript/index.d.ts",
  "lib/module/catalog-schema.js",
  "lib/typescript/catalog-schema.d.ts",
  "lib/module/testing.js",
  "lib/typescript/testing.d.ts",
];
const localDependencyPrefixes = ["file:", "link:", "workspace:"];

export function createPackedArtifact(destination) {
  mkdirSync(destination, { recursive: true });
  const output = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--pack-destination",
      destination,
      "--cache",
      join(repositoryRoot, ".npm-cache"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_foreground_scripts: "false",
        npm_config_ignore_scripts: "true",
      },
    },
  );
  const results = JSON.parse(output);
  if (!Array.isArray(results) || results.length !== 1) {
    throw new Error("npm pack did not produce exactly one artifact");
  }

  const [metadata] = results;
  if (
    typeof metadata?.filename !== "string" ||
    !Array.isArray(metadata.files)
  ) {
    throw new Error("npm pack returned malformed metadata");
  }

  const tarballPath = join(destination, metadata.filename);
  inspectPackedArtifact(tarballPath, metadata);
  return { tarballPath, metadata };
}

function inspectPackedArtifact(tarballPath, metadata) {
  const paths = metadata.files.map((file) => file.path);
  for (const path of paths) {
    if (!isAllowedPackagePath(path)) {
      throw new Error(`Unexpected file in package: ${path}`);
    }
  }

  for (const requiredFile of requiredFiles) {
    if (!paths.includes(requiredFile)) {
      throw new Error(`Required package file is missing: ${requiredFile}`);
    }
  }

  const extractionRoot = mkdtempSync(join(tmpdir(), "a2ui-pack-check-"));
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", extractionRoot]);
    const packageRoot = join(extractionRoot, "package");
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    );
    assertPackageMetadata(packageJson, packageRoot);
    assertNoLocalPaths(packageRoot);
  } finally {
    rmSync(extractionRoot, { recursive: true, force: true });
  }
}

function isAllowedPackagePath(path) {
  return (
    path === "LICENSE" ||
    path === "README.md" ||
    path === "CHANGELOG.md" ||
    path === "CONTRIBUTING.md" ||
    path === "RELEASING.md" ||
    path === "SECURITY.md" ||
    path === "package.json" ||
    path.startsWith("docs/") ||
    path.startsWith("lib/")
  );
}

function assertPackageMetadata(packageJson, packageRoot) {
  if (packageJson.name !== "a2ui-react-native-renderer") {
    throw new Error("Packed package has an unexpected name");
  }
  if (packageJson.version !== "1.0.0" || packageJson.license !== "Apache-2.0") {
    throw new Error(
      "Packed package must match the 1.0.0 / Apache-2.0 release candidate",
    );
  }
  if (
    Object.keys(packageJson.dependencies ?? {}).length > 0 ||
    Object.keys(packageJson.optionalDependencies ?? {}).length > 0 ||
    packageJson.peerDependencies?.ajv !== undefined
  ) {
    throw new Error(
      "Packed renderer gained a runtime schema-export dependency",
    );
  }

  const forbiddenDependencies = [
    "@a2ui/web_core",
    "lit",
    "lit-html",
    "lit-element",
  ];
  if (
    forbiddenDependencies.some(
      (name) => packageJson.dependencies?.[name] !== undefined,
    )
  ) {
    throw new Error("Packed renderer includes a web runtime dependency");
  }

  for (const target of [
    packageJson.main,
    packageJson.module,
    packageJson["react-native"],
    packageJson.types,
  ]) {
    if (typeof target !== "string") {
      throw new Error("Packed package is missing a public entrypoint");
    }
    readFileSync(resolve(packageRoot, target), "utf8");
  }

  const catalogSchemaExport = packageJson.exports?.["./catalog-schema"];
  if (
    catalogSchemaExport?.import !== "./lib/module/catalog-schema.js" ||
    catalogSchemaExport?.types !== "./lib/typescript/catalog-schema.d.ts"
  ) {
    throw new Error("Packed package is missing the catalog-schema subpath");
  }

  const testingExport = packageJson.exports?.["./testing"];
  if (
    testingExport?.import !== "./lib/module/testing.js" ||
    testingExport?.types !== "./lib/typescript/testing.d.ts"
  ) {
    throw new Error("Packed package is missing the testing subpath");
  }

  for (const dependencyGroup of [
    packageJson.dependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ]) {
    for (const [name, specifier] of Object.entries(dependencyGroup ?? {})) {
      if (
        typeof specifier !== "string" ||
        localDependencyPrefixes.some((prefix) => specifier.startsWith(prefix))
      ) {
        throw new Error(`Packed dependency ${name} uses a local specifier`);
      }
    }
  }
}

function assertNoLocalPaths(packageRoot) {
  for (const path of walkFiles(packageRoot)) {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`Packed package contains a symlink: ${path}`);
    }
    if (!stats.isFile() || !isTextArtifact(path)) {
      continue;
    }

    const contents = readFileSync(path, "utf8");
    if (contents.includes(repositoryRoot)) {
      throw new Error(`Packed file contains the repository path: ${path}`);
    }
    if (
      path.startsWith(join(packageRoot, "lib")) &&
      /@a2ui\/web_core|basic_catalog|lit-html|lit-element|@lit\//.test(contents)
    ) {
      throw new Error(`Packed runtime contains a web renderer module: ${path}`);
    }
  }
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function isTextArtifact(path) {
  return /\.(?:d\.ts|js|json|map|md)$/.test(path);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  const destination = mkdtempSync(join(tmpdir(), "a2ui-pack-artifact-"));
  try {
    const { metadata } = createPackedArtifact(destination);
    console.log(
      `Packed artifact verified: ${String(metadata.entryCount)} files, ${String(metadata.size)} bytes`,
    );
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}
