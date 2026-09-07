$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$files = @('slide1.xml','slide3.xml','slide6.xml','slide7.xml','slide9.xml','slide10.xml')
foreach ($f in $files) {
  $p = Join-Path $x $f
  try {
    $d = New-Object System.Xml.XmlDocument
    $d.PreserveWhitespace = $false
    $d.Load($p)
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $bom = if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { 'BOM!' } else { 'noBOM' }
    Write-Output ("WELLFORMED {0,-12} {1}" -f $f, $bom)
  } catch {
    Write-Output ("BAD {0}: {1}" -f $f, $_.Exception.Message)
  }
}
