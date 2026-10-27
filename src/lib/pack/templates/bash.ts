import { MANIFEST_FILE, type ScriptMeta } from "./meta";

const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";

/**
 * Bash extractor for machines without Node: macOS, Linux and Git Bash on Windows.
 * Needs only tar, base64 (or openssl) and sha256sum (or shasum), which all three ship with.
 *
 * Every code line ends in " #" so the script still runs if a Windows editor saves it with CRLF
 * line endings: the stray "\r" lands in a comment instead of breaking the command.
 */
export function bashScript(meta: ScriptMeta, payload: string): string {
  const partLabel = meta.parts > 1 ? ` - part ${meta.part} of ${meta.parts}` : "";
  const header = [
    "#!/usr/bin/env bash",
    `# ${meta.name}${partLabel} (${meta.files.length} files). Generated ${meta.generatedAt} by Code Hub.`,
    "# Run:  bash <this file> [target-folder]",
    "#       FORCE=1 bash <this file> [target-folder]   to write into a folder that holds something else",
    "# Works in macOS Terminal, Linux and Git Bash on Windows.",
  ];
  const main = [
    "set -euo pipefail",
    "",
    "decode() {",
    "  if printf 'QQ==' | base64 -d >/dev/null 2>&1; then base64 -d",
    "  elif printf 'QQ==' | base64 -D >/dev/null 2>&1; then base64 -D",
    "  else openssl base64 -d -A; fi",
    "}",
    "sha() {",
    "  if command -v sha256sum >/dev/null 2>&1; then sha256sum \"$1\" | cut -d' ' -f1",
    "  else shasum -a 256 \"$1\" | cut -d' ' -f1; fi",
    "}",
    "check() {",
    '  if [ "$(sha "$TARGET/$2" 2>/dev/null || true)" != "$1" ]; then echo "Did not verify: $2" >&2; bad=1; fi',
    "}",
    "",
    "main() {",
    '  TARGET="${1:-.}"',
    `  NAME=${quote(meta.name)}`,
    `  MANIFEST=${quote(MANIFEST_FILE)}`,
    '  SELF="$(basename "$0")"',
    "",
    "  # Don't write over a different project. An existing copy of this one (from git or a zip) is fine.",
    '  mkdir -p "$TARGET"',
    '  if [ "${FORCE:-}" != 1 ] && ! grep -qF -e "\\"name\\":\\"$NAME\\"" -e "\\"name\\": \\"$NAME\\"" "$TARGET/$MANIFEST" 2>/dev/null; then',
    `    PKG_NAME=${quote(meta.packageName ?? "")}`,
    `    pkg="$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$TARGET/package.json" 2>/dev/null | head -n 1 | sed 's/.*"\\([^"]*\\)"$/\\1/' || true)"`,
    '    if [ -n "$PKG_NAME" ] && [ -n "$pkg" ] && [ "$pkg" != "$PKG_NAME" ]; then',
    '      echo "This folder holds a different project (\\"$pkg\\"). Use an empty folder, or run FORCE=1 bash $SELF." >&2',
    "      exit 1",
    "    fi",
    '    present="$(ls -A "$TARGET" | grep -v -x -e "$SELF" -e "$MANIFEST" -e .DS_Store -e Thumbs.db -e desktop.ini | grep -v ' +
      `'^${meta.slug}-' || true)"`,
    `    others="$(printf '%s\\n' "$present" | grep -v -x -F ${meta.knownEntries.map((e) => "-e " + quote(e)).join(" ")} | grep -v '^$' || true)"`,
    '    if [ -n "$others" ] && { [ -z "$PKG_NAME" ] || [ "$pkg" != "$PKG_NAME" ]; }; then',
    `      echo "The folder $TARGET has files that are not part of $NAME ($(printf '%s' "$others" | head -n 3 | tr '\\n' ' '))." >&2`,
    '      echo "Use an empty folder, or write into this one anyway: FORCE=1 bash $SELF" >&2',
    "      exit 1",
    "    fi",
    '    if [ -n "$present" ]; then echo "Found an existing copy of $NAME. Changed files are overwritten; your other files are kept."; fi',
    "  fi",
    "",
    "  # Check the payload is complete, then unpack it.",
    '  TMP="$(mktemp)"',
    "  trap 'rm -f \"$TMP\"' EXIT",
    `  printf '%s' "$P" | tr -d ' \\r\\n' | decode > "$TMP"`,
    `  if [ "$(sha "$TMP")" != ${meta.payloadSha} ]; then`,
    '    echo "This script is damaged, probably cut off while copying. Copy the whole script again." >&2',
    "    exit 1",
    "  fi",
    '  tar -xzf "$TMP" -C "$TARGET"',
    "",
    "  # Verify every file against the hash taken from the original upload.",
    "  bad=0",
    ...meta.files.map(([p, h]) => `  check ${h} ${quote(p)}`),
    '  if [ "$bad" = 1 ]; then exit 1; fi',
    `  printf '{"name":"%s"}\\n' "$NAME" > "$TARGET/$MANIFEST"`,
    "",
    `  echo "$NAME${meta.parts > 1 ? ` part ${meta.part} of ${meta.parts}` : ""}: all ${meta.files.length} files written and verified (SHA-256 matches the upload)."`,
    ...(meta.parts > 1 ? [`  echo "Run all ${meta.parts} parts."`] : []),
    ...(meta.leftOut.length
      ? [`  echo ${quote("Not included (copy these by hand, they may hold secrets): " + meta.leftOut.join(", "))}`]
      : []),
    ...(meta.nextSteps.length
      ? ['  echo "Next, in $TARGET:"', ...meta.nextSteps.map((s) => `  echo ${quote("  " + s)}`)]
      : []),
    "}",
  ];
  const code = main.map((l) => (l.trim() === "" || l.trim().startsWith("#") ? l : l + " #"));
  return [...header, ...code, "", "P='", payload, "' #", 'main "$@" #', ""].join("\n");
}
