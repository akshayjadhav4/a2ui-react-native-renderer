import type { A2UIRendererError } from "./types.js";

const MAX_IDENTIFIER_LENGTH = 120;

export type A2UIDiagnosticsMode = "auto" | "development" | "production";

export function formatA2UIDiagnostic(error: A2UIRendererError): string {
  const identifiers = [
    formatIdentifier("surface", error.surfaceId),
    formatIdentifier("catalog", error.catalogId),
    formatIdentifier("component", error.componentId),
    formatIdentifier("path", error.path),
  ].filter((value): value is string => value !== undefined);

  return [`A2UI ${error.code}`, ...identifiers].join(" | ");
}

export function shouldShowDevelopmentDiagnostics(
  mode: A2UIDiagnosticsMode,
): boolean {
  if (mode === "development") {
    return true;
  }

  if (mode === "production") {
    return false;
  }

  return (globalThis as { readonly __DEV__?: boolean }).__DEV__ === true;
}

function formatIdentifier(
  label: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const sanitized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .slice(0, MAX_IDENTIFIER_LENGTH);
  return `${label}=${sanitized}`;
}
