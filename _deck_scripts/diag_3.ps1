$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$p = Join-Path $x 'slide3.xml'
$doc = New-Object System.Xml.XmlDocument
$doc.PreserveWhitespace = $false
$doc.Load($p)
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
$ns.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
$tree = $doc.SelectSingleNode("//p:spTree", $ns)

foreach ($child in $tree.ChildNodes) {
  if ($child.LocalName -ne 'sp' -and $child.LocalName -ne 'pic') { continue }
  $nv = if ($child.LocalName -eq 'sp') { "p:nvSpPr/p:cNvPr" } else { "p:nvPicPr/p:cNvPr" }
  $cn = $child.SelectSingleNode($nv, $ns)
  $id = $cn.GetAttribute('id'); $nm = $cn.GetAttribute('name')
  $off = $child.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns)
  $ext = $child.SelectSingleNode("p:spPr/a:xfrm/a:ext", $ns)
  $ox = if($off){$off.GetAttribute('x')}else{'-'}; $oy = if($off){$off.GetAttribute('y')}else{'-'}
  $cx = if($ext){$ext.GetAttribute('cx')}else{'-'}; $cy = if($ext){$ext.GetAttribute('cy')}else{'-'}
  $geom = $child.SelectSingleNode("p:spPr/a:prstGeom", $ns)
  $gv = if($geom){$geom.GetAttribute('prst')}else{'-'}
  $fill = $child.SelectSingleNode("p:spPr/a:solidFill/a:srgbClr", $ns)
  $fv = if($fill){$fill.GetAttribute('val')}else{'-'}
  $t  = $child.SelectSingleNode(".//a:t", $ns)
  $tv = if($t){$t.InnerText}else{''}
  if ($tv.Length -gt 26) { $tv = $tv.Substring(0,26) + '...' }
  Write-Output ("{0,-4} id={1,-3} x={2,-9} y={3,-9} cx={4,-8} cy={5,-8} geom={6,-9} fill={7,-7} | {8}" -f $child.LocalName,$id,$ox,$oy,$cx,$cy,$gv,$fv,$tv)
}
$ids = [regex]::Matches([System.IO.File]::ReadAllText($p), '<p:cNvPr id="(\d+)"') | ForEach-Object { [int]$_.Groups[1].Value }
Write-Output ("MAXID=" + ($ids | Measure-Object -Maximum).Maximum)
