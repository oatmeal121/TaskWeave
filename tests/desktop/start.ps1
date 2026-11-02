$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path '.').Path
$qaExecutable = Join-Path $taskRoot 'src-tauri\target\debug\taskweave.exe'
$launch = New-Object System.Diagnostics.ProcessStartInfo
$launch.FileName = $qaExecutable
$launch.WorkingDirectory = $taskRoot
$launch.UseShellExecute = $false
$launch.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$launch.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=9352 --remote-debugging-address=127.0.0.1'
$process = [System.Diagnostics.Process]::Start($launch)
$process.Id | Set-Content -Encoding ASCII 'src-tauri/target/native-reminder-qa.pid'
Write-Output "Started isolated QA process $($process.Id)"
