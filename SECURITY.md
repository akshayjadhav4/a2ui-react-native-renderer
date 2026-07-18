# Security Policy

## Supported Versions

The package has not reached its first public release. Security fixes currently
target the latest commit on the default branch. A supported-version table will
be added with `0.1.0`.

## Reporting A Vulnerability

Please report vulnerabilities privately to the repository owner. The final
private reporting address or GitHub security-advisory URL will be added with
the public repository metadata before publication.

Until that channel is recorded, do not publish exploit details or sensitive
payloads in a public issue. Include the affected version or commit, impact,
reproduction steps, and a minimal sanitized A2UI payload when possible.

## Security Boundary

This package validates A2UI protocol and catalog data before rendering, but the
consumer owns transport authentication, authorization, native capability
policy, action handling, telemetry privacy, and catalog presenter security. See
[Errors And Security](./docs/errors-and-security.md).
