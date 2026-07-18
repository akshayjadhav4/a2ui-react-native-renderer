# Spec: a2ui-react-native-renderer

## Status

- Phase: Specify
- State: Approved on 2026-07-17
- Target initial release: `0.1.0`
- Target protocol: A2UI v0.9
- npm name: `a2ui-react-native-renderer` (confirmed available on 2026-07-17)

## Assumptions Confirmed

1. This is a new standalone repository and npm package.
2. The package is catalog-agnostic and ships no component presenters.
3. Consumers supply their own component schemas and React Native presenters.
4. The package targets Expo and bare React Native applications.
5. The package processes official A2UI v0.9 messages rather than a simplified custom UI format.
6. Apache-2.0 is the initial license.
7. Component schemas are required for production validation.

## Objective

Build a production-grade, transport-agnostic A2UI v0.9 renderer for React Native that can be installed from npm and used with any agent, AI SDK, or network transport.

The primary user is a React Native library or application developer who wants to:

- receive official A2UI messages from an agent;
- register an application-owned catalog of native presenters;
- render and incrementally update one or more A2UI surfaces;
- receive typed A2UI user actions;
- recover safely from malformed or unsupported agent output;
- use the same renderer in Expo and bare React Native.

The package is a renderer and protocol runtime. It is not a chat SDK, agent SDK, transport, component library, or design system.

### Primary User Story

```tsx
import { Text } from "react-native";
import { z } from "zod";
import { A2UIRenderer, defineA2UICatalog } from "a2ui-react-native-renderer";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

export function AgentSurface({ messages }: { messages: A2UIMessage[] }) {
  return (
    <A2UIRenderer
      catalogs={[catalog]}
      messages={messages}
      onAction={(action) => sendActionToAgent(action)}
      onError={(error) => reportRendererError(error)}
    />
  );
}
```

### Advanced User Story

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: sendActionToAgent,
  onError: reportRendererError,
});

agentStream.onMessage((message) => {
  engine.applyMessage(message);
});

export function AgentSurface({ surfaceId }: { surfaceId: string }) {
  return (
    <A2UIProvider engine={engine}>
      <A2UISurface surfaceId={surfaceId} />
    </A2UIProvider>
  );
}
```

## Goals

- Publish a small, documented npm package with stable public boundaries.
- Follow the official A2UI v0.9 message lifecycle.
- Make catalogs explicit, immutable, and scoped to an engine instance.
- Keep protocol processing independent of React component presentation.
- Validate all untrusted messages and component properties before rendering.
- Preserve the last valid UI when a malformed incremental update arrives.
- Provide predictable development diagnostics and production recovery.
- Avoid global runtime state and cross-surface updates.
- Support long-lived streaming runtimes without requiring a specific transport.
- Make the simple case require one renderer component and one catalog definition.

## Non-Goals

- Shipping the official Basic Catalog component implementations.
- Shipping Expo UI, Uniwind, NativeWind, icons, images, or media presenters.
- Owning AG-UI, TanStack AI, Vercel AI SDK, CopilotKit, or another transport.
- Owning chat messages, surface placement in a transcript, persistence, or replay.
- Generating A2UI with an LLM.
- Providing server prompt schemas or model-routing logic.
- Supporting A2UI protocol versions other than v0.9 in the initial release.
- Supporting React Native Web as a guaranteed platform in the initial release.
- Including native iOS or Android source code.

## Architecture

### Layer 1: Public React API

The public React API owns convenience composition only:

- `A2UIRenderer`: creates or accepts an engine, applies message batches, discovers active surfaces, and renders them.
- `A2UIProvider`: provides an existing engine through React context.
- `A2UISurface`: subscribes to one surface and renders its root component.
- Engine hooks for advanced consumers, limited to stable read-only snapshots and errors.

The convenience renderer must create its internal engine once per mounted instance. It must not recreate the engine when React renders again.

### Layer 2: Engine

`createA2UIEngine` owns:

- registered catalog instances;
- A2UI protocol processor state;
- surface snapshots;
- data models and binding contexts;
- action dispatch;
- structured error collection;
- external-store subscriptions compatible with `useSyncExternalStore`.

Engine state is instance-scoped. There is no module-level catalog registry, singleton engine, or mutable global configuration.

### Layer 3: Protocol Adapter

The protocol adapter wraps `@a2ui/web_core/v0_9` and translates its state into renderer-owned, stable public types.

The adapter owns:

- `createSurface`;
- `updateComponents`;
- `updateDataModel`;
- `deleteSurface`;
- binding and template scope integration;
- function invocation;
- core protocol error normalization.

Types from `@a2ui/web_core` must not leak throughout the package. They may be re-exported intentionally as stable aliases only where they are part of the official A2UI contract.

### Layer 4: Catalog Registry

The package ships catalog registration tools but no catalog content.

```tsx
const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    ComponentName: {
      schema: ComponentPropsSchema,
      presenter: ComponentPresenter,
    },
  },
  functions: optionalFunctions,
  themeSchema: optionalThemeSchema,
});
```

Each component registration contains:

- a Zod schema for catalog-specific component properties;
- a React Native presenter;
- no transport or model behavior.

The presenter receives resolved properties, a child-rendering function, the current binding scope, and action dispatch. The exact presenter contract will be finalized in the implementation plan without exposing internal `@a2ui/web_core` contexts.

Catalog IDs are mandatory and unique within an engine. Duplicate IDs are rejected during engine creation.

### Layer 5: Render Resolver

The render resolver:

1. locates the catalog identified by `createSurface.catalogId`;
2. resolves the surface root;
3. locates each registered presenter;
4. validates component properties;
5. resolves bindings and functions;
6. invokes the presenter inside a component-level error boundary.

Presenters remain ordinary React Native components and may use React Native, Expo, a design system, or application-specific native modules.

### Layer 6: Diagnostics And Recovery

All failures produce a structured `A2UIRendererError` through `onError` and the engine error API.

Development behavior:

- invalid initial surfaces render a visible diagnostic boundary;
- diagnostics identify the error code, catalog, surface, component, and JSON path when known;
- presenter exceptions render a local diagnostic fallback;
- diagnostics never expose secrets or entire data models by default.

Production behavior:

- errors never crash the React Native application;
- internal diagnostics are not rendered by default;
- invalid initial surfaces render `null` or a consumer-provided fallback;
- invalid updates do not replace the last valid surface revision;
- `onError` is still called in production;
- raw A2UI JSON is never rendered as fallback text.

### Data Flow

```text
Agent or transport
    -> official A2UI v0.9 messages
    -> package validation boundary
    -> @a2ui/web_core protocol processor
    -> engine surface snapshot
    -> registered catalog presenter
    -> React Native view tree

Native interaction
    -> presenter dispatch
    -> A2UI UserAction
    -> consumer onAction callback
    -> consumer-owned transport
```

## Public API Boundary

### Initial Stable Exports

- `A2UIRenderer`
- `A2UIProvider`
- `A2UISurface`
- `createA2UIEngine`
- `defineA2UICatalog`
- `defineA2UIComponent`
- `defineA2UIFunction`
- `useA2UISurface`
- `useA2UIErrors`
- official message, action, surface, catalog, presenter, and error types

### Explicitly Internal

- `@a2ui/web_core` rendering contexts
- React adapters and component wrappers
- mutable surface records
- message dispatcher implementation
- JSON pointer internals
- diagnostic components
- catalog maps
- protocol-version adapters

No deep imports are supported. Every supported import must be exported from the package root or a documented version entry point.

## Error Contract

```ts
interface A2UIRendererError {
  code:
    | "INVALID_MESSAGE"
    | "UNSUPPORTED_VERSION"
    | "UNKNOWN_CATALOG"
    | "DUPLICATE_CATALOG"
    | "UNKNOWN_COMPONENT"
    | "INVALID_COMPONENT_PROPS"
    | "INVALID_ROOT"
    | "INVALID_REFERENCE"
    | "BINDING_ERROR"
    | "FUNCTION_ERROR"
    | "PRESENTER_ERROR"
    | "RESOURCE_LIMIT_EXCEEDED";
  message: string;
  severity: "warning" | "error";
  surfaceId?: string;
  catalogId?: string;
  componentId?: string;
  path?: string;
  cause?: unknown;
}
```

Error codes are part of the public API and require a semver-compatible migration strategy once published.

## Validation And Resource Limits

All A2UI messages are untrusted input.

The engine validates:

- protocol version and message shape;
- registered catalog ID;
- duplicate component IDs;
- root existence;
- child and component references;
- component property schemas;
- JSON pointer syntax;
- obvious component reference cycles;
- action structure;
- data model updates before commit.

Configurable default limits protect mobile applications from accidental or malicious oversized UI:

- 500 components per surface;
- component tree depth of 64;
- 1 MiB data model per surface;
- 1,000 messages in a single `applyMessages` call.

Exceeding a limit rejects the relevant update and reports `RESOURCE_LIMIT_EXCEEDED`.

## Compatibility

- A2UI: v0.9 only for `0.x` initial releases.
- React: `>=18.2` peer dependency.
- React Native: `>=0.76` peer dependency.
- Zod: `>=3.25 <4` peer dependency, matching the v0.9 core contract.
- Runtime: Hermes and JavaScriptCore.
- Platforms: iOS and Android.
- Architectures: React Native Legacy Architecture and New Architecture because the package contains no native module.
- Expo: supported when the React and React Native peer ranges are satisfied; no Expo package is required.

Future A2UI protocol versions must use an explicit versioned adapter or entry point. Installing a minor package update must not reinterpret v0.9 messages as a different protocol version.

## Tech Stack

- TypeScript with `strict` enabled.
- React and React Native as peer dependencies.
- `@a2ui/web_core` v0.9 as the protocol engine dependency.
- Zod v3 as the consumer-facing component schema contract.
- `react-native-builder-bob` for JavaScript and declaration build outputs.
- ESLint and Prettier for static quality.
- Node's built-in test runner for pure engine and catalog tests.
- React Native Testing Library for renderer integration tests where a React Native host is required.
- pnpm for local development and deterministic lockfiles.
- Local release scripts for build, test, package inspection, and consumer smoke
  verification.

The package contains no native source, Expo dependency, styling framework, network client, or state-management dependency.

## Commands

The final repository must expose these executable commands:

```sh
# Install
pnpm install --frozen-lockfile

# Build JavaScript and declarations
pnpm build

# Type-check source, tests, and public examples
pnpm typecheck

# Lint without modifying files
pnpm lint

# Check formatting without modifying files
pnpm format:check

# Run all tests
pnpm test

# Run tests with enforced coverage thresholds
pnpm test:coverage

# Build and inspect the exact npm tarball
pnpm pack:check

# Start the Expo example
pnpm example start

# Bundle the example for both supported platforms
pnpm example:export

# Run every release gate without publishing
pnpm release:check
```

Publishing is an interactive maintainer operation protected by npm 2FA. It is
never part of the ordinary build, test, or local development commands.

## Project Structure

```text
a2ui-react-native-renderer/
  src/
    index.ts                 Public exports only
    react/                   Provider, renderer, surface, hooks
    engine/                  External store and surface lifecycle
    protocol/v0_9/           @a2ui/web_core adapter
    catalog/                 Consumer catalog definitions and registry
    rendering/               Tree resolver and presenter adapter
    validation/              Message, graph, and resource validation
    errors/                  Public errors and diagnostic boundaries
    types/                   Stable package-owned public types
  test/
    unit/                    Pure engine, catalog, validation tests
    integration/             React Native renderer lifecycle tests
    fixtures/                Valid and invalid A2UI message sequences
    types/                   Public TypeScript API tests
  example/
    expo/                    Example consumer with its own small catalog
  docs/
    architecture.md          Maintainer architecture and invariants
    catalogs.md              Consumer catalog authoring
    streaming.md             Transport-neutral streaming integration
    errors.md                Error handling and recovery
    migration.md             Breaking-change and protocol-version guidance
  tasks/
    spec.md                  Approved product specification
    plan.md                  Approved implementation plan
    todo.md                  Incremental implementation tasks
  package.json
  tsconfig.json
  LICENSE
  README.md
  CHANGELOG.md
  RELEASING.md
  CONTRIBUTING.md
  SECURITY.md
```

## Code Style

Prefer explicit immutable configuration, package-owned public types, and narrow functions.

```tsx
export function defineA2UIComponent<Props>(
  definition: A2UIComponentDefinition<Props>,
): A2UIComponentDefinition<Props> {
  return Object.freeze(definition);
}

const TextComponent = defineA2UIComponent({
  schema: z.object({ text: z.string() }),
  presenter: TextPresenter,
});
```

Conventions:

- Public React components and public types use `PascalCase`.
- Functions, hooks, and variables use `camelCase`.
- Hooks begin with `use`.
- Files use descriptive lowercase names; React component files may use `PascalCase.tsx` consistently if selected during scaffolding.
- Protocol names such as `surfaceId`, `catalogId`, and `updateComponents` retain official A2UI spelling.
- Do not use `any` in public interfaces.
- Do not export internal implementation types accidentally through inferred declarations.
- Comments explain protocol invariants and non-obvious decisions, not ordinary statements.
- Source remains ASCII unless protocol fixtures require Unicode.

## Testing Strategy

### Unit Tests

Cover:

- catalog registration and duplicate rejection;
- message parsing and validation;
- each surface lifecycle message;
- data model update and deletion semantics;
- JSON pointer decoding and relative template scopes;
- component graph validation and cycle detection;
- action dispatch and context resolution;
- function invocation failures;
- resource limits;
- structured error normalization;
- atomic rejection of invalid updates.

### Renderer Integration Tests

Cover:

- presenter selection by catalog and component name;
- resolved properties passed to presenters;
- nested child rendering;
- multiple independent surfaces;
- only affected surfaces notifying subscribers;
- presenter exceptions contained by error boundaries;
- development diagnostic fallback;
- production null/custom fallback;
- last valid revision retained after invalid updates;
- engine stability across React rerenders.

### Public Type Tests

Compile documented examples and verify:

- schema-inferred presenter properties;
- invalid presenter properties fail TypeScript;
- no internal types are required by consumers;
- both simple and advanced APIs compile under supported React versions.

### Consumer Smoke Tests

The local release gate creates the package tarball and installs it into the Expo
example as a consumer would. The example must bundle for iOS and Android without
monorepo aliases, source-relative imports, or unpublished files.

Before a release candidate, the tarball must also be installed in a clean bare React Native fixture and successfully bundled for both platforms.

### Coverage

- Minimum 90% statements, lines, and functions for engine, validation, and catalog modules.
- Minimum 85% branch coverage for those modules.
- Coverage thresholds may not be lowered to make the release gate pass without approval.

## Performance Requirements

- Creating a renderer must not recreate its engine during ordinary React rerenders.
- Applying an update for one surface must not notify unrelated surface subscribers.
- Read APIs used with `useSyncExternalStore` must return referentially stable snapshots until relevant state changes.
- Rendering must not clone the complete data model for every component.
- Validation and state application must occur once per new message batch, not once per React render.
- The package must not start timers, network requests, or background tasks.
- Performance fixtures must cover a 500-component surface without stack overflow or application crash.

Performance benchmarks are diagnostic in `0.x`; correctness gates remain mandatory. Numeric latency budgets will be established after measurements on the example application.

## Package And Release Requirements

- npm package name is `a2ui-react-native-renderer`.
- npm tarball contains only compiled output, declarations, source maps where useful, README, LICENSE, and required metadata.
- `package.json` contains accurate `main`, `module`, `react-native`, `types`, and `exports` fields.
- React, React Native, and Zod are peer dependencies and development dependencies, not bundled duplicates.
- Runtime dependencies are minimal and audited.
- `sideEffects` is declared accurately.
- Source maps resolve to repository source.
- README documents installation, simple usage, streaming usage, catalog authoring, actions, errors, and limitations.
- Every release has release notes and a changelog entry.
- The complete local release gate is mandatory before publication; hosted CI is deferred while the package has one maintainer.
- Publishing uses a public GitHub repository and an interactive npm account protected by 2FA.
- Trusted publishing and provenance attestations are deferred until hosted release automation is intentionally adopted.
- The first npm publication is manually approved after inspecting `npm pack --dry-run` output.

The official React Native documentation recommends scaffolding reusable libraries with `create-react-native-library`; the implementation plan may use its JavaScript-library output or reproduce the relevant `react-native-builder-bob` setup without native module boilerplate.

## Boundaries

### Always Do

- Treat all A2UI messages as untrusted input.
- Validate before mutating a visible surface.
- Preserve official A2UI naming at protocol boundaries.
- Emit structured errors in development and production.
- Keep catalog and engine state instance-scoped.
- Run build, typecheck, lint, tests, and tarball smoke checks before release.
- Add tests for every protocol bug fixed.
- Update this specification before changing public behavior.
- Use semver and document breaking public API changes.

### Ask First

- Add a runtime dependency.
- Change the minimum React or React Native version.
- Add support for another A2UI protocol version.
- Change a public error code or presenter contract.
- Add a bundled component or catalog.
- Add native iOS or Android code.
- Change release automation or npm ownership.
- Lower test coverage or remove a release gate.

### Never Do

- Bundle application-specific components.
- Import Expo, AG-UI, TanStack AI, CopilotKit, or a network transport.
- Use mutable global catalog or engine state.
- Render raw model JSON as an error fallback.
- Crash the host application because a presenter or message is invalid.
- Silently swallow production errors without invoking the configured error channel.
- publish secrets, local paths, workspace dependencies, or unpublished files.
- publish from an unreviewed dirty working tree.
- remove failing tests to complete a release.

## Success Criteria

The initial package is ready for npm `0.1.0` when all of the following are true:

1. A clean Expo application can install the packed tarball and render a consumer-defined catalog.
2. A clean bare React Native application can install the tarball and bundle on iOS and Android.
3. The simple API renders valid official A2UI v0.9 message arrays without requiring manual provider setup.
4. The advanced API supports incremental surface creation, component updates, data updates, deletion, and actions.
5. Multiple catalogs and surfaces remain isolated within one engine.
6. Unknown catalogs, missing components, invalid properties, invalid roots, and presenter exceptions never crash the host application.
7. Development shows actionable diagnostics, while production emits structured errors and preserves the last valid surface when possible.
8. The package has no dependency on Expo, a styling system, chat state, AG-UI, an AI SDK, or network transport.
9. No global mutable runtime state exists.
10. Public API examples compile and are exercised by tests.
11. Unit, integration, type, coverage, and tarball smoke gates pass through the documented local release gate.
12. `npm pack --dry-run` contains only intended publishable files.
13. README accurately states A2UI version support and does not claim Basic Catalog conformance.
14. The public GitHub repository includes Apache-2.0 license, contribution, security, and release documentation.
15. npm publication is manually approved, protected by 2FA, and follows the documented inspected-tarball release procedure.

## Release Repository

- Public repository:
  `https://github.com/akshayjadhav4/a2ui-react-native-renderer`.
- npm publication remains separately gated by version approval, npm 2FA, and an
  explicit publish authorization.
