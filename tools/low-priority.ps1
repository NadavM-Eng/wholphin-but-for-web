# Keeps the build agents' processes out of the way on a machine someone is using.
# Every 20 seconds, drops the scheduling priority of processes started by this project's tooling
# (dev servers, type checker, test runner, headless test browsers, the Android emulator) to BelowNormal,
# so foreground applications always get the CPU first. It never touches other programs.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/low-priority.ps1 [-Hours 8]
param([double]$Hours = 8)

$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$needle = [regex]::Escape($project)
$until = (Get-Date).AddHours($Hours)
$always = '^(chrome-headless-shell|esbuild|tsgo|qemu-system-x86_64-headless|qemu-system-x86_64|emulator|adb|rolldown)\.exe$'
$browsers = '^(msedge|chrome|firefox)\.exe$'

while ((Get-Date) -lt $until) {
  $lowered = 0
  foreach ($p in Get-CimInstance Win32_Process -Property ProcessId, Name, CommandLine) {
    $mine = $false
    if ($p.Name -match $always) { $mine = $true }
    elseif ($p.Name -eq 'node.exe' -and $p.CommandLine -and ($p.CommandLine -match $needle -or $p.CommandLine -match 'playwright|vite|vitest|tsc|oxlint')) { $mine = $true }
    elseif ($p.Name -match $browsers -and $p.CommandLine -match 'playwright') { $mine = $true }
    if (-not $mine) { continue }
    try {
      $proc = Get-Process -Id $p.ProcessId -ErrorAction Stop
      if ($proc.PriorityClass -ne 'BelowNormal' -and $proc.PriorityClass -ne 'Idle') {
        $proc.PriorityClass = 'BelowNormal'
        $lowered++
      }
    } catch { }
  }
  if ($lowered -gt 0) { "{0:HH:mm:ss} lowered {1} process(es)" -f (Get-Date), $lowered }
  Start-Sleep -Seconds 20
}
