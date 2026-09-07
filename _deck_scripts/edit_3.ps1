$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$p = Join-Path $x 'slide3.xml'
$doc = New-Object System.Xml.XmlDocument
$doc.PreserveWhitespace = $false
$doc.Load($p)
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
$ns.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
$ns.AddNamespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
$tree = $doc.SelectSingleNode("//p:spTree", $ns)

function GetNode($id) {
  $n = $doc.SelectSingleNode("//p:sp[p:nvSpPr/p:cNvPr/@id='$id']", $ns)
  if (-not $n) { $n = $doc.SelectSingleNode("//p:pic[p:nvPicPr/p:cNvPr/@id='$id']", $ns) }
  if (-not $n) { throw "node id=$id not found" }
  return $n
}

# ---- geometry constants ----
$cardW_old = 2084832
$cardW_new = 1709928
$gap = 164592
$pitch = $cardW_new + $gap          # 1874520
$L_old = @(553212, 2802636, 5052060, 7301484, 9550908)
$L_new = @(); for ($i=0; $i -lt 6; $i++) { $L_new += ($L_old[0] + $i*$pitch) }
$s = [double]$cardW_new / [double]$cardW_old
Write-Output ("s={0:F6}  L_new=[{1}]" -f $s, ($L_new -join ','))

function XformWidth($id, $i) {
  $n = GetNode $id
  $off = $n.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns)
  $ext = $n.SelectSingleNode("p:spPr/a:xfrm/a:ext", $ns)
  $ox = [double]$off.GetAttribute('x'); $ocx = [double]$ext.GetAttribute('cx')
  $oc = $ox + $ocx/2
  $nc = $L_new[$i] + ($oc - $L_old[$i])*$s
  $ncx = [long][math]::Round($ocx*$s)
  $nx = [long][math]::Round($nc - $ncx/2)
  $off.SetAttribute('x', [string]$nx); $ext.SetAttribute('cx', [string]$ncx)
}
function XformKeep($id, $i) {
  $n = GetNode $id
  $off = $n.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns)
  $ext = $n.SelectSingleNode("p:spPr/a:xfrm/a:ext", $ns)
  $ox = [double]$off.GetAttribute('x'); $ocx = [double]$ext.GetAttribute('cx')
  $oc = $ox + $ocx/2
  $nc = $L_new[$i] + ($oc - $L_old[$i])*$s
  $nx = [long][math]::Round($nc - $ocx/2)
  $off.SetAttribute('x', [string]$nx)
}

$frames = @(8,16,24,32,40)
$dark   = @(9,17,25,33,41)
$pics   = @(10,18,26,34,42)
$badge  = @(11,19,27,35,43)
$num    = @(12,20,28,36,44)
$title  = @(13,21,29,37,45)
$desc   = @(14,22,30,38,46)

for ($i=0; $i -lt 5; $i++) {
  XformWidth $frames[$i] $i
  XformWidth $title[$i]  $i
  XformWidth $desc[$i]   $i
  XformKeep  $dark[$i]   $i
  XformKeep  $pics[$i]   $i
  XformKeep  $badge[$i]  $i
  XformKeep  $num[$i]    $i
}
Write-Output "cards 0-4 transformed"

# ---- chevrons: reposition to new gap centers ----
$chev = @(15,23,31,39)
for ($i=0; $i -lt 4; $i++) {
  $gc = $L_new[$i] + $cardW_new + $gap/2
  $nx = [long][math]::Round($gc - 347472/2)
  $n = GetNode $chev[$i]
  $n.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns).SetAttribute('x', [string]$nx)
}
Write-Output "chevrons 0-3 repositioned"

# ---- card5 desc append ----
$d46 = (GetNode 46).SelectSingleNode(".//a:t", $ns)
$d46.InnerText = $d46.InnerText + ' Now also correlates CI/CD pipeline misconfigurations.'
Write-Output "card5 desc appended"

# ---- clone card5 (transformed) into card6 ----
$srcIds  = @(40,41,42,43,44,45,46)
$newIds  = @(62,63,64,65,66,67,68)
$refNode = GetNode 46
$insertAfter = $refNode
for ($k=0; $k -lt $srcIds.Count; $k++) {
  $srcN = GetNode $srcIds[$k]
  $cl = $srcN.CloneNode($true)
  $cn = $cl.SelectSingleNode(".//p:cNvPr", $ns)
  $cn.SetAttribute('id', [string]$newIds[$k])
  $cn.SetAttribute('name', $cn.GetAttribute('name') + ' copy6')
  $off = $cl.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns)
  $nx = [long]([double]$off.GetAttribute('x') + $pitch)
  $off.SetAttribute('x', [string]$nx)
  [void]$tree.InsertAfter($cl, $insertAfter)
  $insertAfter = $cl
}
# card6 fills (alternate) + texts
(GetNode 62).SelectSingleNode("p:spPr/a:solidFill/a:srgbClr", $ns).SetAttribute('val','13173A')
(GetNode 63).SelectSingleNode("p:spPr/a:solidFill/a:srgbClr", $ns).SetAttribute('val','1E2761')
(GetNode 66).SelectSingleNode(".//a:t", $ns).InnerText = '6'
(GetNode 67).SelectSingleNode(".//a:t", $ns).InnerText = 'Pipeline Security'
(GetNode 68).SelectSingleNode(".//a:t", $ns).InnerText = 'Scans workflows, Dockerfiles & compose for 5 misconfiguration rules.'
Write-Output "card6 cloned (ids 62-68)"

# ---- clone chevron 5 (gap4) ----
$ch5 = (GetNode 39).CloneNode($true)
$ch5cn = $ch5.SelectSingleNode(".//p:cNvPr", $ns); $ch5cn.SetAttribute('id','69'); $ch5cn.SetAttribute('name','Text 39 copy6')
$gc4 = $L_new[4] + $cardW_new + $gap/2
$ch5x = [long][math]::Round($gc4 - 347472/2)
$ch5.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns).SetAttribute('x', [string]$ch5x)
[void]$tree.InsertAfter($ch5, $insertAfter)
Write-Output ("chevron5 id=69 x={0}" -f $ch5x)

# ---- save ----
$settings = New-Object System.Xml.XmlWriterSettings
$settings.Encoding = New-Object System.Text.UTF8Encoding($false)
$settings.Indent = $false
$settings.OmitXmlDeclaration = $false
$w = [System.Xml.XmlWriter]::Create($p, $settings)
$doc.Save($w); $w.Close()
Write-Output "EDITED slide3.xml"
