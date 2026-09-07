$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$enc = New-Object System.Text.UTF8Encoding($false)

function EditFile($name, $pairs) {
  $p = Join-Path $x $name
  $t = [System.IO.File]::ReadAllText($p)
  foreach ($k in $pairs.Keys) {
    $c = ([regex]::Matches($t, [regex]::Escape($k))).Count
    if ($c -ne 1) { throw "Anchor count $c (expected 1) for [$k] in $name" }
    $t = $t.Replace($k, $pairs[$k])
  }
  [System.IO.File]::WriteAllText($p, $t, $enc)
  Write-Output "EDITED $name"
}

# Slide 7: All 5 -> All 6
$p7 = @{ '<a:t>All 5 analysis phases</a:t>' = '<a:t>All 6 analysis phases</a:t>' }
EditFile 'slide7.xml' $p7

# Slide 10: append CI/CD text to FortifyLens cross-phase-insight cell
$p10 = @{ '<a:t>Maps a weak requirement to the exact flaw it caused</a:t>' = '<a:t>Maps a weak requirement to the exact flaw it caused + CI/CD pipeline misconfigurations.</a:t>' }
EditFile 'slide10.xml' $p10
