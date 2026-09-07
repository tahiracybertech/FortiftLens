$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
function Probe($file, $needles) {
  $p = Join-Path $x $file
  $t = [System.IO.File]::ReadAllText($p)
  Write-Output ("==== {0}  len={1} ====" -f $file, $t.Length)
  foreach ($n in $needles) {
    $c = ([regex]::Matches($t, [regex]::Escape($n))).Count
    Write-Output ("  [{0}] x{1}  {2}" -f $(if($c -gt 0){'OK'}else{'MISS'}), $c, $n)
  }
}
Probe 'slide7.xml'  @('<a:t>All 5 analysis phases</a:t>')
Probe 'slide10.xml' @('<a:t>Maps a weak requirement to the exact flaw it caused</a:t>')
Probe 'slide6.xml'  @('<a:t>Five-phase pipeline</a:t>','SCA','Cross-Phase')
Probe 'slide9.xml'  @('<a:t>5 / 5</a:t>','five security phases','all five phases complete','five phases','What&#8217;s Shipped',"What's Shipped")
Probe 'slide1.xml'  @('id="19"','id="18"','Cross-Phase')
