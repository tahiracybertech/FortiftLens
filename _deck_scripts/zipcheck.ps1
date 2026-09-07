$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$out = Join-Path $env:TEMP 'deck_edit\out.pptx'
$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
$names = $zip.Entries | ForEach-Object { $_.FullName }
$zip.Dispose()
Write-Output ("total=" + $names.Count)
Write-Output "--- first 15 entries ---"
$names | Select-Object -First 15 | ForEach-Object { Write-Output $_ }
$bs = ($names | Where-Object { $_ -match '\\' }).Count
$fs = ($names | Where-Object { $_ -match '/' }).Count
Write-Output ("backslashEntries={0}  forwardslashEntries={1}" -f $bs, $fs)
