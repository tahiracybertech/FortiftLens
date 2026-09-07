$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP 'deck_edit'
$out  = Join-Path $root 'out.pptx'
$png  = Join-Path $root 'png'
if (Test-Path $png) { Remove-Item $png -Recurse -Force }
New-Item -ItemType Directory -Path $png | Out-Null

$p = $null; $pres = $null
try {
  $p = New-Object -ComObject PowerPoint.Application
  $pres = $p.Presentations.Open($out, $true, $false, $false)
  $count = $pres.Slides.Count
  Write-Output ("Slides.Count=" + $count)
  if ($count -ne 12) { throw "Expected 12 slides, got $count" }
  foreach ($i in 1,3,6,7,9,10) {
    $sl = $pres.Slides.Item($i)
    $fp = Join-Path $png ("slide{0}.png" -f $i)
    $sl.Export($fp, "PNG", 1280, 720)
    Write-Output ("exported slide{0} -> {1} ({2} bytes)" -f $i, $fp, (Get-Item $fp).Length)
  }
} finally {
  if ($pres) { $pres.Close() }
  if ($p) { $p.Quit() }
  if ($pres) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) }
  if ($p) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($p) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
Write-Output "DONE"
