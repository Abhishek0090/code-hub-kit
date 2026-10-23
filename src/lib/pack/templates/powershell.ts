import { IGNORABLE_ENTRIES, MANIFEST_FILE, type ScriptMeta } from "./meta";
import { toBase64 } from "../encode";

/**
 * A PowerShell string literal. Windows PowerShell 5.1 reads a .ps1 without a BOM in the ANSI code page,
 * so anything non-ASCII is passed as base64 UTF-8 and decoded at run time.
 */
function ps(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return "'" + s.replace(/'/g, "''") + "'";
  return `([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${toBase64(new TextEncoder().encode(s))}')))`;
}

/** PowerShell extractor for Windows machines without Node. Uses the tar.exe built into Windows 10 (1803) and later. */
export function powershellScript(meta: ScriptMeta, payload: string): string {
  const partLabel = meta.parts > 1 ? ` - part ${meta.part} of ${meta.parts}` : "";
  const say = (s: string) => `  Write-Host ${ps(s)}`;
  return [
    `# ${meta.name.replace(/[^\x20-\x7e]/g, "?")}${partLabel} (${meta.files.length} files). Generated ${meta.generatedAt} by Code Hub.`,
    "# Run in PowerShell:",
    "#   powershell -ExecutionPolicy Bypass -File .\\<this file> [target-folder] [-Force]",
    "# -Force writes into a folder that holds something else.",
    "param([string]$Target = '.', [switch]$Force)",
    "$ErrorActionPreference = 'Stop'",
    "",
    "function Fail($message) {",
    "  [Console]::Error.WriteLine($message)",
    "  exit 1",
    "}",
    "",
    "function Main {",
    `  $name = ${ps(meta.name)}`,
    `  $manifest = '${MANIFEST_FILE}'`,
    `  $ignorable = @(${IGNORABLE_ENTRIES.map((e) => ps(e)).join(", ")})`,
    "  $self = Split-Path -Leaf $PSCommandPath",
    "",
    "  # Don't write over a different project.",
    "  New-Item -ItemType Directory -Force -Path $Target | Out-Null",
    "  $dir = (Resolve-Path -LiteralPath $Target).Path",
    "  $manifestPath = Join-Path $dir $manifest",
    "  $same = $false",
    "  if (Test-Path -LiteralPath $manifestPath) {",
    "    try { $same = ((Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json).name -eq $name) } catch {}",
    "  }",
    "  if (-not $Force -and -not $same) {",
    "    $others = @(Get-ChildItem -Force -LiteralPath $dir | Where-Object {",
    `      $_.Name -ne $self -and $ignorable -notcontains $_.Name -and -not $_.Name.StartsWith('${meta.slug}-')`,
    "    })",
    "    if ($others.Count -gt 0) { Fail \"The folder $dir is not empty. Use an empty folder, or add -Force to update an existing copy.\" }",
    "  }",
    "",
    "  # Check the payload is complete, then unpack it.",
    "  $bytes = [Convert]::FromBase64String(($Payload -replace '\\s', ''))",
    "  $hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)).Replace('-', '').ToLower()",
    `  if ($hash -ne '${meta.payloadSha}') { Fail 'This script is damaged, probably cut off while copying. Copy the whole script again.' }`,
    "  $tmp = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.tgz')",
    "  [IO.File]::WriteAllBytes($tmp, $bytes)",
    "  $tar = 'tar'",
    "  if ($env:SystemRoot -and (Test-Path (Join-Path $env:SystemRoot 'System32\\tar.exe'))) { $tar = Join-Path $env:SystemRoot 'System32\\tar.exe' }",
    "  & $tar -xzf $tmp -C $dir",
    "  $code = $LASTEXITCODE",
    "  Remove-Item -LiteralPath $tmp -Force",
    "  if ($code -ne 0) { Fail 'tar could not unpack the files (needs Windows 10 1803 or newer). Use the Node.js script instead.' }",
    "",
    "  # Verify every file against the hash taken from the original upload.",
    "  $bad = @()",
    "  foreach ($entry in $Files) {",
    "    $file = Join-Path $dir $entry[1]",
    "    if (-not (Test-Path -LiteralPath $file) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash -ne $entry[0]) { $bad += $entry[1] }",
    "  }",
    "  if ($bad.Count -gt 0) { Fail (\"These files did not verify: \" + ($bad -join ', ')) }",
    "  [IO.File]::WriteAllText($manifestPath, '{\"name\":' + ($name | ConvertTo-Json) + \"}`n\")",
    "",
    `  Write-Host ($name + ${ps(`${meta.parts > 1 ? ` part ${meta.part} of ${meta.parts}` : ""}: all ${meta.files.length} files written and verified (SHA-256 matches the upload).`)})`,
    ...(meta.parts > 1 ? [say(`Run all ${meta.parts} parts.`)] : []),
    ...(meta.leftOut.length ? [say("Not included (copy these by hand, they may hold secrets): " + meta.leftOut.join(", "))] : []),
    ...(meta.nextSteps.length ? ['  Write-Host "Next, in ${dir}:"', ...meta.nextSteps.map((s) => say("  " + s))] : []),
    "}",
    "",
    "$Files = @(",
    meta.files.map(([p, h]) => `  ,@('${h}', ${ps(p)})`).join("\n"),
    ")",
    "",
    "$Payload = @'",
    payload,
    "'@",
    "",
    "Main",
    "",
  ].join("\r\n");
}
