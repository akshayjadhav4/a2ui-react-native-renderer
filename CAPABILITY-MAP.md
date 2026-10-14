# Capability Map: Headless A2UI Renderer Improvements

**Status:** Reviewed on 2026-10-04; updated on 2026-10-14. `wire-compatibility`, `binding-semantics`, `progressive-surfaces`, `catalog-contract`, `react-surface-api`, `render-reactivity`, and `consumer-tooling` are implemented. All seven modules are complete.

## Assumptions

1. This initiative improves the existing `0.1.1` package rather than creating a new renderer.
2. Applications continue to own all React Native component implementations, visual styling, transports, and agent integrations. The package will not ship a Basic Catalog or other presenters.
3. Existing public APIs remain usable where practical. Breaking changes require an explicit migration path.
4. The scope includes the concrete compatibility, streaming, binding, authoring, and React rendering gaps identified in the recent review. Performance work follows measurement.
5. The approved initial-release documents in `tasks/` remain historical records; this initiative will have its own specifications and plan.

## Modules

| Module id              | Responsibility and independently testable outcome                                                                                                                      | Depends on                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `wire-compatibility`   | Own the narrow A2UI protocol core needed by React Native; accept v0.9/v0.9.1 messages, emit actions, and verify behavior against official fixtures without `web_core`. | —                                           |
| `binding-semantics`    | Give consumer presenters accurate resolved values and an explicit writable/read-only binding contract.                                                                 | —                                           |
| `progressive-surfaces` | Represent pending roots, children, and data as loading states while preserving validation and safe recovery; expose structured errors for optional agent feedback.     | `wire-compatibility`, `binding-semantics`   |
| `catalog-contract`     | Keep app-owned component definitions as the source of truth for renderer validation and an exportable agent-facing catalog contract.                                   | `wire-compatibility`, `binding-semantics`   |
| `react-surface-api`    | Make live message ingestion, one-surface placement, lifecycle, and app-owned loading/error UI straightforward in React Native.                                         | `progressive-surfaces`                      |
| `render-reactivity`    | Measure and reduce unnecessary presenter renders for updates to unrelated bound values within one surface.                                                             | `binding-semantics`, `progressive-surfaces` |
| `consumer-tooling`     | Provide a small catalog/surface test harness and a real streaming example using only app-owned components.                                                             | `catalog-contract`, `react-surface-api`     |

**Build order:** `wire-compatibility` and `binding-semantics` → `progressive-surfaces` and `catalog-contract` → `react-surface-api` and `render-reactivity` → `consumer-tooling` (after `catalog-contract` and `react-surface-api`).

## Boundaries for the next phase

- Module specs will define exact public APIs, migration behavior, and measurable acceptance criteria before implementation.
- No package-owned catalog, styling system, chat UI, transport client, or model SDK is planned.
- Each module can be scoped or deferred independently during review. The `wire-compatibility` contract supplies protocol types to dependent modules; catalog definitions belong to `catalog-contract`.
