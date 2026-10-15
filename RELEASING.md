# Releasing

Releases are currently manual and protected by npm two-factor authentication.
Hosted CI, trusted publishing, and provenance are intentionally deferred while
the package has one maintainer.

Publishing any version requires explicit maintainer approval. Migration work
does not authorize a release, choose the next version, or change the license.

## Prerequisites

- The source repository is public and its final GitHub owner/URL is known.
- `package.json` has exact `repository`, `homepage`, and `bugs` URLs for that
  repository.
- The npm account owns or can create the unscoped package name and requires 2FA
  for publishing.
- Node.js 20 or newer and pnpm 10.15.1 are installed.
- The release is prepared on the default branch with a clean worktree.
- The maintainer has reviewed the package API, changelog, and tarball contents.
- The maintainer has approved the documentation audit for the exact candidate
  commit and reviewed the remaining device-verification limitations.

## Documentation Approval Before Release

Review every file in `docs/` against the candidate implementation, including
the package-owned protocol core, hook/direct-surface and explicit-engine
lifetimes, progressive graphs, binding setters, actions/errors, reactivity,
catalog export, and the optional testing entry. Check links and compile the
guide fixtures with `pnpm typecheck`; run the documentation tests and package
contents check. Confirm that `tasks/` remains local and absent from the tarball.

Present corrections, verification results and unresolved limitations to the
maintainer, and obtain explicit confirmation before publishing. This is a
manual release requirement; the publish guard does not record documentation
approval automatically. Reaudit affected sections if the candidate changes.

## Prepare A Version

1. Recheck name availability immediately before preparation:

   ```sh
   pnpm view a2ui-react-native-renderer version --json
   ```

   Registry `E404` is expected only for the first release. It does not reserve
   the name.

2. Update `package.json`:

   - set `version` to the explicitly approved next stable version;
   - set `private` to `false`;
   - add the exact public repository, homepage, and issue URLs.

3. Move the relevant `CHANGELOG.md` entries from `[Unreleased]` to a dated
   heading matching that approved version and release date. Update the
   version/license assertions in `scripts/pack-check.mjs` when approved metadata
   changes: they currently protect the migration's `0.1.1` / Apache-2.0 values.
   The publish readiness guard currently accepts stable versions only;
   prerelease publishing needs a separately reviewed guard/test update.

4. Install from the committed lockfile and run the complete gate:

   ```sh
   pnpm install --frozen-lockfile
   pnpm release:check
   ```

5. Review the real packed artifact:

   ```sh
   pnpm pack:check
   npm pack --dry-run
   ```

   Confirm that it contains compiled ESM, declarations, source maps, README,
   license, changelog, and intended documentation only. Confirm that no local
   paths, source fixtures, credentials, tokens, or workspace dependencies are
   present.

6. Commit the release metadata and verify the worktree is clean:

   ```sh
   git status --short
   ```

## Publish

Publishing requires both npm 2FA and the explicit local approval variable:

```sh
A2UI_APPROVE_PUBLISH=1 npm publish --access public
```

The `prepublishOnly` guard reruns release readiness and the complete local gate.
Do not pass an npm token through the command line or commit one to any file.

## Verify And Tag

After npm reports success:

```sh
npm view a2ui-react-native-renderer version dist-tags repository --json
```

Install the registry version into a new temporary Expo consumer and repeat the
basic render check. Then tag the exact committed release:

```sh
VERSION="$(node -p "require('./package.json').version")"
git tag -a "v$VERSION" -m "a2ui-react-native-renderer v$VERSION"
git push origin "v$VERSION"
```

The npm version, changelog heading, commit, and git tag must agree.

## Failed Release

Do not overwrite an npm version; registry versions are immutable. Before a
successful publish, fix the candidate and rerun every check. After a broken
version is public, deprecate it with a clear message and publish a corrected
patch release. Unpublishing is reserved for exceptional security or legal
cases.

## Future Trusted Publishing

If hosted release automation becomes worthwhile, adopt npm trusted publishing
through a public cloud-hosted workflow, require OIDC `id-token: write`, preserve
manual release approval, and enable provenance. Remove the manual publish path
only after the trusted publisher succeeds end to end.

Official references:

- [Publishing unscoped public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)
- [Requiring 2FA for publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)
