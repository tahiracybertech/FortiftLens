$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path $env:TEMP 'deck_edit'
$src  = Join-Path $root 'x'
$out  = Join-Path $root 'out.pptx'
if (Test-Path $out) { Remove-Item $out -Force }

$srcFull = (Resolve-Path $src).Path.TrimEnd('\') + '\'
$all = Get-ChildItem -Path $src -Recurse -File
# put [Content_Types].xml first
$ct  = $all | Where-Object { $_.Name -eq '[Content_Types].xml' }
$rest = $all | Where-Object { $_.Name -ne '[Content_Types].xml' }
$ordered = @($ct) + @($rest)

$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $ordered) {
    $rel = $f.FullName.Substring($srcFull.Length).Replace('\','/')
    $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $es.Write($bytes, 0, $bytes.Length)
    $es.Dispose()
  }
} finally {
  $zip.Dispose()
}

$fi = Get-Item $out
Write-Output ("OUT={0} bytes={1} files={2}" -f $out, $fi.Length, $ordered.Count)

# verify separators
$z2 = [System.IO.Compression.ZipFile]::OpenRead($out)
$names = $z2.Entries | ForEach-Object { $_.FullName }
$z2.Dispose()
$bs = ($names | Where-Object { $_ -match '\\' }).Count
Write-Output ("entries={0} backslashEntries={1} first={2} hasSlide1={3}" -f $names.Count, $bs, $names[0], ($names -contains 'ppt/slides/slide1.xml'))
