# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| 0.1.x   | Yes       |

## Reporting A Vulnerability

Please report vulnerabilities privately through a
[GitHub security advisory](https://github.com/akshayjadhav4/a2ui-react-native-renderer/security/advisories/new).
Do not publish exploit details or sensitive payloads in a public issue. Include
the affected version or commit, impact, reproduction steps, and a minimal
sanitized A2UI payload when possible.

## Security Boundary

This package validates A2UI protocol and catalog data before rendering, but the
consumer owns transport authentication, authorization, native capability
policy, action handling, telemetry privacy, and catalog presenter security. See
[Errors And Security](./docs/errors-and-security.md).
