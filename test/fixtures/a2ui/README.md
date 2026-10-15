# Pinned A2UI schema fixtures

These JSON files are copied from [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) at commit [`1444719acd8833eeb5e70529c7ac47bc50b7390c`](https://github.com/a2ui-project/a2ui/tree/1444719acd8833eeb5e70529c7ac47bc50b7390c). The upstream repository is [Apache-2.0 licensed](https://github.com/a2ui-project/a2ui/blob/1444719acd8833eeb5e70529c7ac47bc50b7390c/LICENSE). They are test-only inputs and are excluded from this package's published `files` list.

The JSON files are excluded from Prettier so the recorded checksums continue to match upstream bytes. This README and the audit document remain formatted normally.

For each version directory, the source paths are:

| Local file              | Upstream source path                                  |
| ----------------------- | ----------------------------------------------------- |
| `common_types.json`     | `specification/<version>/json/common_types.json`      |
| `server_to_client.json` | `specification/<version>/json/server_to_client.json`  |
| `catalog.json`          | `specification/<version>/catalogs/basic/catalog.json` |

The raw source URL is `https://raw.githubusercontent.com/a2ui-project/a2ui/1444719acd8833eeb5e70529c7ac47bc50b7390c/<upstream source path>`. `<version>` is `v0_9` or `v0_9_1`.

SHA-256 checksums:

| Local file                     | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `v0_9/common_types.json`       | `ac79788e95e5bdf0a39808953593a53c1bc9fcdcdb55480f4610613c6591e94c` |
| `v0_9/server_to_client.json`   | `77080edd7d15077e5d345682c7bedec27b59c6df13ed3a72fd3de66318acb2d6` |
| `v0_9/catalog.json`            | `8cc94d0a482e67048f9fc989964ca5da56fe42f531d919315a508989fb22e13e` |
| `v0_9_1/common_types.json`     | `ac79788e95e5bdf0a39808953593a53c1bc9fcdcdb55480f4610613c6591e94c` |
| `v0_9_1/server_to_client.json` | `ed1ee11b4f1e94dd08ebe0d57bedb436cb452cc546d26cae407858ae477af288` |
| `v0_9_1/catalog.json`          | `8cc94d0a482e67048f9fc989964ca5da56fe42f531d919315a508989fb22e13e` |

The common-type and catalog fixtures are byte-identical across these two
versions; the server-to-client schema files differ. Compatibility is checked
by the protocol and catalog-schema tests against these pinned fixtures.
