$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like "*$root\node_modules\electron*") -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*electron-vite*' -and $_.CommandLine -like "*$root*")
  )
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
