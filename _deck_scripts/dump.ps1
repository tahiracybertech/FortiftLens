$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
function DumpTexts($file, $pattern) {
  $p = Join-Path $x $file
  $t = [System.IO.File]::ReadAllText($p)
  $ms = [regex]::Matches($t, '<a:t>(.*?)</a:t>')
  Write-Output ("==== {0} : {1} runs ====" -f $file, $ms.Count)
  $i = 0
  foreach ($m in $ms) {
    $v = $m.Groups[1].Value
    if ($v -match $pattern) {
      # show with codepoints for arrow detection
      $cps = ($v.ToCharArray() | ForEach-Object { '{0:X4}' -f [int]$_ }) -join ' '
      Write-Output ("  run[{0}]: {1}" -f $i, $v)
    }
    $i++
  }
}
DumpTexts 'slide6.xml' 'Cross-Phase|Pipeline|Five'
DumpTexts 'slide9.xml' 'five|Phase|Shipped|Progress'
