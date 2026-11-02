param(
    [switch]$Force
)

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $repositoryRoot ".taskweave-release"
$privateKeyPath = Join-Path $secretDirectory "taskweave-updater.key"

if ((Test-Path -LiteralPath $privateKeyPath) -and -not $Force) {
    throw "Updater key already exists at $privateKeyPath. Keep using the same key, or pass -Force only when no release has ever been distributed."
}

New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
Push-Location $repositoryRoot
try {
    $arguments = @("run", "tauri", "signer", "generate", "--", "-w", $privateKeyPath)
    if ($Force) {
        $arguments += "--force"
    }
    & npm.cmd @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri did not generate the updater key."
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Updater signing files were created in: $secretDirectory"
Write-Host "Keep the private key and its password safe. Losing either prevents future automatic updates."
