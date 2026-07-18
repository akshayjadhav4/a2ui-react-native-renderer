import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = process.cwd();

test("documents every package-root export", () => {
  const indexPath = path.join(repositoryRoot, "src/index.ts");
  const source = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const exports = source.statements.flatMap((statement) => {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause === undefined ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      return [];
    }

    return statement.exportClause.elements.map((element) => element.name.text);
  });
  const api = readFileSync(path.join(repositoryRoot, "docs/api.md"), "utf8");
  const missing = exports.filter((name) => !api.includes(`\`${name}\``));

  assert.ok(exports.length > 0);
  assert.deepEqual(missing, []);
});

test("keeps README documentation links and limitations valid", () => {
  const readme = readFileSync(path.join(repositoryRoot, "README.md"), "utf8");
  const links = Array.from(
    readme.matchAll(
      /\]\((\.\/(?:docs\/[^)]+\.md|(?:CHANGELOG|CONTRIBUTING|RELEASING)\.md))\)/g,
    ),
    (match) => match[1],
  );

  assert.ok(links.length > 0);
  for (const link of links) {
    assert.equal(
      existsSync(path.resolve(repositoryRoot, link)),
      true,
      `Missing README document ${link}`,
    );
  }

  assert.match(readme, /Only A2UI `v0\.9` messages are accepted/);
  assert.match(readme, /No Basic Catalog .* is bundled/);
  assert.match(readme, /No transport, agent, model, chat UI/);
});
