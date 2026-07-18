# Errors And Security

A2UI is remotely produced executable presentation data. Treat every message,
component property, binding, URL, and action context as untrusted input.

## Validation Boundary

Before publishing a surface update, the engine checks:

- A2UI v0.9 message shape and operation;
- registered and unique catalog IDs;
- component names and Zod property schemas;
- duplicate IDs and the reserved `root`;
- child references, graph cycles, and depth;
- binding and structural JSON pointers;
- configured message, graph, and data-model limits.

Validation is necessary but does not make a presenter safe. Consumers must also
restrict native capabilities exposed by their own components and functions.

## Error Codes

| Code                      | Meaning                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `INVALID_MESSAGE`         | Message does not satisfy the v0.9 operation contract          |
| `UNSUPPORTED_VERSION`     | Message declares a protocol version other than v0.9           |
| `UNKNOWN_CATALOG`         | Surface requests a catalog not registered in its engine       |
| `DUPLICATE_CATALOG`       | Engine configuration repeats a catalog ID                     |
| `UNKNOWN_COMPONENT`       | Graph requests a component absent from the surface catalog    |
| `INVALID_COMPONENT_PROPS` | Component properties fail the consumer Zod schema             |
| `INVALID_ROOT`            | Surface has no valid reserved root                            |
| `INVALID_REFERENCE`       | Component ID, child link, or graph relation is invalid        |
| `BINDING_ERROR`           | Data binding or structural pointer is invalid                 |
| `FUNCTION_ERROR`          | Function lookup, arguments, execution, or return value failed |
| `PRESENTER_ERROR`         | Consumer presenter or fallback failed during React rendering  |
| `RESOURCE_LIMIT_EXCEEDED` | Configured batch, graph, depth, or data limit was exceeded    |

Errors include safe routing identifiers where available. `cause` may contain
sensitive runtime detail and should be restricted to trusted telemetry.

## Diagnostics Modes

- `auto` follows React Native's `__DEV__` global.
- `development` logs a sanitized code-and-identifiers diagnostic when no custom
  fallback exists.
- `production` displays and logs no default diagnostic.

`renderFallback` may provide an application-native error state in any mode. If
the fallback itself throws, the renderer returns `null`. `onError` remains the
authoritative channel for telemetry and recovery.

## Resource Limits

Defaults are conservative correctness boundaries, not universal performance
targets:

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  limits: {
    maxComponentsPerSurface: 250,
    maxComponentDepth: 40,
    maxDataModelBytes: 256 * 1024,
    maxMessagesPerBatch: 250,
  },
});
```

Choose lower limits for expensive presenters or constrained devices. Apply
transport-level response-size and timeout limits as well; those concerns are
outside this package.

## Consumer Security Checklist

- Register only components and functions the agent is allowed to invoke.
- Validate URLs and permit only required schemes before calling `Linking`.
- Require user confirmation for purchases, destructive actions, permissions,
  external navigation, and sensitive data submission.
- Keep secrets, credentials, and authorization decisions out of A2UI data
  models.
- Treat event names and context as requests, not authorization.
- Enforce authorization again on the server receiving an action.
- Avoid render-time network requests and non-deterministic function effects.
- Send structured telemetry without raw messages or complete data models unless
  an explicit privacy policy permits it.
- Pin and review catalog IDs used by the model or server.

## Reporting Vulnerabilities

Do not open a public issue containing exploit details or sensitive data. Follow
the private reporting instructions in [SECURITY.md](../SECURITY.md).
