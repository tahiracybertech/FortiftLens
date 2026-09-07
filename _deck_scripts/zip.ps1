$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path $env:TEMP 'deck_edit'
$src  = Join-Path $root 'x'
$out  = Join-Path $root 'out.pptx'
if (Test-Path $out) { Remove-Item $out -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $out)
$fi = Get-Item $out
Write-Output ("OUT={0}  bytes={1}" -f $out, $fi.Length)
# sanity: list a few entries, ensure no wrapper folder
$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
$names = $zip.Entries | ForEach-Object { $_.FullName }
$zip.Dispose()
Write-Output ("entryCount={0}" -f $names.Count)
Write-Output ("hasContentTypes=" + ($names -contains '[Content_Types].xml'))
Write-Output ("hasSlide1=" + ($names -contains 'ppt/slides/slide1.xml'))
$wrapper = $names | Where-Object { $_ -like 'x/*' }
Write-Output ("wrapperEntries=" + $wrapper.Count)
