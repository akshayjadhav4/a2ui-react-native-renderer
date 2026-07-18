# Releasing

Releases are currently manual and protected by npm two-factor authentication.
Hosted CI, trusted publishing, and provenance are intentionally deferred while
the package has one maintainer.

No command in this guide may publish `0.1.0` without explicit maintainer
approval.

## Prerequisites

- The source repository is public and its final GitHub owner/URL is known.
- `package.json` has exact `repository`, `homepage`, and `bugs` URLs for that
  repository.
- The npm account owns or can create the unscoped package name and requires 2FA
  for publishing.
- Node.js 20 or newer and pnpm 10.15.1 are installed.
- The release is prepared on the default branch with a clean worktree.
- The maintainer has reviewed the package API, changelog, and tarball contents.

## Prepare A Version

1. Recheck name availability immediately before preparation:

   ```sh
   pnpm view a2ui-react-native-renderer version --json
   ```

   Registry `E404` is expected only for the first release. It does not reserve
   the name.

2. Update `package.json`:

   - set `version` to the approved stable version, initially `0.1.0`;
   - set `private` to `false`;
   - add the exact public repository, homepage, and issue URLs.

3. Move the relevant `CHANGELOG.md` entries from `[Unreleased]` to a dated
   heading such as `## [0.1.0] - 2026-07-18`.

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
git tag -a v0.1.0 -m "a2ui-react-native-renderer v0.1.0"
git push origin v0.1.0
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
