$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$enc = New-Object System.Text.UTF8Encoding($false)
$p = Join-Path $x 'slide6.xml'
$t = [System.IO.File]::ReadAllText($p)

$ARW  = [char]0x2192
$BUL  = [char]0x25CF
$MDOT = [char]0x00B7

$ids = [regex]::Matches($t, '<p:cNvPr id="(\d+)"') | ForEach-Object { [int]$_.Groups[1].Value }
$maxid = ($ids | Measure-Object -Maximum).Maximum
$newid = $maxid + 1
Write-Output ("slide6 maxid={0} newid={1}" -f $maxid, $newid)

function ReplaceOnce([string]$s, [string]$k, [string]$v) {
  $c = ([regex]::Matches($s, [regex]::Escape($k))).Count
  if ($c -ne 1) { throw "Anchor count $c (expected 1) for [$k]" }
  return $s.Replace($k, $v)
}

$t = ReplaceOnce $t '<a:t>Five-phase pipeline</a:t>' '<a:t>Six-phase pipeline</a:t>'

$enumSearch  = "SCA $ARW Cross-Phase"
$enumReplace = "SCA $ARW Pipeline $ARW Cross-Phase"
$t = ReplaceOnce $t $enumSearch $enumReplace

$txt1 = 'CI/CD integration: X-API-Key auth (SHA-256-hashed per-org keys) + single-file fortifylens-cli (exit codes 0 pass / 1 block / 2 error)'
$txt2 = 'Scan provenance: source=ci/manual + commit SHA &amp; branch; "via CI ' + $MDOT + ' commit" badge in reports'

$sp = '<p:sp><p:nvSpPr><p:cNvPr id="' + $newid + '" name="Text ' + $newid + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
'<p:spPr><a:xfrm><a:off x="548640" y="5897880"/><a:ext cx="11091672" cy="411480"/></a:xfrm>' +
'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/></p:spPr>' +
'<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/>' +
'<a:p><a:pPr marL="342900" indent="-342900"><a:spcAft><a:spcPts val="200"/></a:spcAft><a:buSzPct val="100000"/><a:buChar char="' + $BUL + '"/></a:pPr>' +
'<a:r><a:rPr lang="en-US" sz="1000" dirty="0"><a:solidFill><a:srgbClr val="4B5169"/></a:solidFill>' +
'<a:latin typeface="Calibri" pitchFamily="34" charset="0"/><a:ea typeface="Calibri" pitchFamily="34" charset="-122"/><a:cs typeface="Calibri" pitchFamily="34" charset="-120"/></a:rPr>' +
'<a:t>' + $txt1 + '</a:t></a:r><a:endParaRPr lang="en-US" sz="1000" dirty="0"/></a:p>' +
'<a:p><a:pPr marL="342900" indent="-342900"><a:spcAft><a:spcPts val="200"/></a:spcAft><a:buSzPct val="100000"/><a:buChar char="' + $BUL + '"/></a:pPr>' +
'<a:r><a:rPr lang="en-US" sz="1000" dirty="0"><a:solidFill><a:srgbClr val="4B5169"/></a:solidFill>' +
'<a:latin typeface="Calibri" pitchFamily="34" charset="0"/><a:ea typeface="Calibri" pitchFamily="34" charset="-122"/><a:cs typeface="Calibri" pitchFamily="34" charset="-120"/></a:rPr>' +
'<a:t>' + $txt2 + '</a:t></a:r><a:endParaRPr lang="en-US" sz="1000" dirty="0"/></a:p>' +
'</p:txBody></p:sp>'

$anchor = '</p:spTree>'
$c = ([regex]::Matches($t, [regex]::Escape($anchor))).Count
if ($c -ne 1) { throw "spTree close count $c" }
$t = $t.Replace($anchor, $sp + $anchor)

[System.IO.File]::WriteAllText($p, $t, $enc)
Write-Output "EDITED slide6.xml"
