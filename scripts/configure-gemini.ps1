# Run in your own terminal:  powershell -ExecutionPolicy Bypass -File scripts\configure-gemini.ps1
# Read-Host masks the key; it is written only to .env.local (ignored by Git)
# and never echoed, logged or sent to chat.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
$secureKey = Read-Host 'Gemini API key (hidden)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
function Set-Line([string]$text, [string]$name, [string]$value) {
  $line = "$name=$value"
  if ($text -match "(?m)^$name=.*$") {
    return [regex]::Replace($text, "(?m)^$name=.*$", [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
  }
  return $text.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}
try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
  if ($apiKey -notmatch '^[A-Za-z0-9_.-]{30,}$') { throw 'That does not look like a Gemini API key; no file was changed.' }
  $text = if (Test-Path -LiteralPath $envFile) { [IO.File]::ReadAllText($envFile) } else { '' }
  $text = Set-Line $text 'GEMINI_API_KEY' $apiKey
  if ($text -notmatch '(?m)^GEMINI_MODEL=') { $text = Set-Line $text 'GEMINI_MODEL' 'gemini-3.8-flash' }
  if ($text -notmatch '(?m)^LLM_PROVIDER=') { $text = Set-Line $text 'LLM_PROVIDER' 'gemini' }
  [IO.File]::WriteAllText($envFile, $text, [Text.UTF8Encoding]::new($false))
  Write-Host 'Gemini key saved privately to .env.local. Other keys were preserved. Restart pnpm dev.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  $apiKey = $null; $text = $null
  $secureKey.Dispose()
}
