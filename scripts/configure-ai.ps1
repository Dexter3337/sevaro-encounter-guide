# Run in your own terminal. Read-Host masks the key; nothing is sent to chat.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
$secureKey = Read-Host 'OpenAI API key (hidden)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ($apiKey -notmatch '^sk-[A-Za-z0-9_-]+$') { throw 'The key format is invalid; no file was changed.' }
  $existing = if (Test-Path -LiteralPath $envFile) { [IO.File]::ReadAllText($envFile) } else { '' }
  $line = 'OPENAI_API_KEY=' + $apiKey
  if ($existing -match '(?m)^OPENAI_API_KEY=.*$') {
    $updated = [regex]::Replace($existing, '(?m)^OPENAI_API_KEY=.*$', [System.Text.RegularExpressions.MatchEvaluator]{param($m) $line})
  } else { $updated = $existing.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine }
  if ($updated -notmatch '(?m)^OPENAI_MODEL=') { $updated += 'OPENAI_MODEL=gpt-4.1-mini' + [Environment]::NewLine }
  [IO.File]::WriteAllText($envFile, $updated, [Text.UTF8Encoding]::new($false))
  Write-Host 'LLM key saved privately. Existing ElevenLabs configuration preserved. Restart pnpm dev.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  $apiKey = $null; $line = $null; $existing = $null; $updated = $null
  $secureKey.Dispose()
}
