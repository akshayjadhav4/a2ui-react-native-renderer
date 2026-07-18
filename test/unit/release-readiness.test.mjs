import assert from "node:assert/strict";
import test from "node:test";

import { findReleaseReadinessErrors } from "../../scripts/assert-release-ready.mjs";

const readyPackage = {
  name: "a2ui-react-native-renderer",
  version: "0.1.0",
  private: false,
  repository: {
    type: "git",
    url: "git+https://github.com/example/a2ui-react-native-renderer.git",
  },
  homepage: "https://github.com/example/a2ui-react-native-renderer#readme",
  bugs: { url: "https://github.com/example/a2ui-react-native-renderer/issues" },
};
const readyChangelog = "## [0.1.0] - 2026-07-18\n";

test("accepts an explicitly approved release from a clean worktree", () => {
  assert.deepEqual(
    findReleaseReadinessErrors({
      packageJson: readyPackage,
      changelog: readyChangelog,
      approved: true,
      clean: true,
    }),
    [],
  );
});

test("rejects development metadata and missing human approval", () => {
  const errors = findReleaseReadinessErrors({
    packageJson: {
      name: "a2ui-react-native-renderer",
      version: "0.0.0-development",
      private: true,
    },
    changelog: "## [Unreleased]\n",
    approved: false,
    clean: false,
  });

  assert.deepEqual(errors, [
    'package.json must set "private" to false',
    "package version must be a stable x.y.z release",
    "package.json must define repository.url",
    "package.json must define homepage",
    "package.json must define bugs.url",
    "CHANGELOG.md must contain a dated 0.0.0-development heading",
    "git worktree must be clean",
    "A2UI_APPROVE_PUBLISH=1 is required",
  ]);
});
