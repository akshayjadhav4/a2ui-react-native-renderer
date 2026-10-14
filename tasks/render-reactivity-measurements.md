# Render Reactivity Measurements

**Module:** `render-reactivity`

**Baseline:** `fce62dd` on `codex/native-core`, measured on 2026-10-14 before optimization.

## Reproduce

```sh
pnpm build
node tasks/render-reactivity-baseline.mjs
```

The harness uses built package imports, real engines, React 19.2.3, and
`react-test-renderer` on Node 24.18.1. It renders synthetic native host elements,
counts catalog presenter calls after one update, verifies final output/data and
absence of engine errors, then unmounts/disposes the fixture. Each case runs
three times in ordinary development rendering, without Strict Mode; all three
runs had identical counts. These are JS render-work measurements, not device
FPS, wall-clock latency, layout, or native bridge measurements.

## Baseline and proposed targets

| Scenario                                                    | Initial calls | Calls after one update | Unchanged item scope values | Proposed maximum after optimization |
| ----------------------------------------------------------- | ------------: | ---------------------: | --------------------------: | ----------------------------------: |
| Two absolute-bound siblings at root scope; change one field |             3 |                      3 |                           0 |                                   3 |
| Three template items; change one item's bound name          |             4 |                      4 |                           2 |                                   2 |
| Three template items; change a field outside their scopes   |             4 |                      4 |                           3 |                                   1 |
| Three template inputs; local setter changes one name        |             4 |                      4 |                           2 |                                   2 |
| Three template items; change an unbound field in one scope  |             4 |                      4 |                           2 |                                   2 |
| Static children; replace one child definition               |             3 |                      3 |                           2 |                                   1 |
| 499 template items; change one bound name                   |           500 |                    500 |                         498 |                                   2 |

The targets are draft spec requirements, not achieved results. The 499-item
target would reduce presenter calls by 99.6% for that fixture. Internal node
subscriptions and prop resolution may still visit other nodes; count reduction
does not establish a frame-time improvement on a device.

## Why scope matters

`A2UIPresenterProps` includes the full `scope.value`. Absolute-bound children
at `/` receive the full data model. Changing one root field changes that value
for every root-scoped child, so those renders cannot safely be skipped merely
because a child's resolved string is unchanged. Template item scopes retain
unchanged sibling object references when another item is edited, which gives
the renderer a safe opportunity to preserve those presenters.

The component-node adapter currently receives the entire new surface snapshot
on each update. Its resolution and `renderChild` callback depend on that
snapshot, producing fresh props, setters, and child callbacks. The measurement
confirms that even unchanged template scopes reach their presenters again.

## Optimization ledger

### Attempt 1: Independent nodes and stable presenter inputs — retained

On 2026-10-14, mounted nodes subscribed directly to existing surface snapshots,
child callbacks stopped capturing snapshots, setters were cached by component
and scope ownership, and a conservative memoized host preserved healthy
presenters. Functions still resolve on each new accepted snapshot before the
presenter comparison. No public API or protocol notification changed.

The unchanged harness command ran each fixture three times with identical
counts and correct final output/data:

| Scenario                         | Before | After |
| -------------------------------- | -----: | ----: |
| Root-scoped absolute siblings    |      3 |     3 |
| One relative template item       |      4 |     2 |
| Outside template scope           |      4 |     1 |
| Local template input write       |      4 |     2 |
| Unbound scope field changes      |      4 |     2 |
| One child definition replacement |      3 |     1 |
| 499 template items, one edit     |    500 |     2 |

All six targets are met. The large fixture reduces presenter calls by 99.6%.
The root-scoped control still observes the full changed scope. Internal
subscription and resolution work remains proportional to mounted nodes; these
counts do not establish device FPS or a constant-time update path.
