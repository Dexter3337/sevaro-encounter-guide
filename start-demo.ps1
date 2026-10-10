param([switch]$Production)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $taskNode)) { throw 'Node 22.12+ is required. See README.md.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/vite/bin/vite.js'))) { throw 'Install dependencies first: pnpm install --frozen-lockfile. See README.md.' }
if ($Production) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist/index.html'))) { throw 'Build first: pnpm build.' }
  & $taskNode node_modules/vite/bin/vite.js preview --host 127.0.0.1
} else {
  & $taskNode node_modules/vite/bin/vite.js --host 127.0.0.1
}
