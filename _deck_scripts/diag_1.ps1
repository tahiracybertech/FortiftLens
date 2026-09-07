$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$p = Join-Path $x 'slide1.xml'
$doc = New-Object System.Xml.XmlDocument
$doc.PreserveWhitespace = $false
$doc.Load($p)
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
$ns.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')

$tree = $doc.SelectSingleNode("//p:spTree", $ns)
foreach ($sp in $tree.SelectNodes("p:sp", $ns)) {
  $cn = $sp.SelectSingleNode("p:nvSpPr/p:cNvPr", $ns)
  $id = $cn.GetAttribute('id'); $nm = $cn.GetAttribute('name')
  $off = $sp.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns)
  $ext = $sp.SelectSingleNode("p:spPr/a:xfrm/a:ext", $ns)
  $ox = if($off){$off.GetAttribute('x')}else{'-'}; $oy = if($off){$off.GetAttribute('y')}else{'-'}
  $cx = if($ext){$ext.GetAttribute('cx')}else{'-'}; $cy = if($ext){$ext.GetAttribute('cy')}else{'-'}
  $fill = $sp.SelectSingleNode("p:spPr/a:solidFill/a:srgbClr", $ns)
  $ln   = $sp.SelectSingleNode("p:spPr/a:ln/a:solidFill/a:srgbClr", $ns)
  $geom = $sp.SelectSingleNode("p:spPr/a:prstGeom", $ns)
  $fv = if($fill){$fill.GetAttribute('val')}else{'-'}
  $lv = if($ln){$ln.GetAttribute('val')}else{'-'}
  $gv = if($geom){$geom.GetAttribute('prst')}else{'-'}
  $t  = $sp.SelectSingleNode(".//a:t", $ns)
  $tv = if($t){$t.InnerText}else{''}
  Write-Output ("id={0,-3} x={1,-8} y={2,-8} cx={3,-8} cy={4,-8} fill={5,-7} ln={6,-7} geom={7,-9} txt={8}" -f $id,$ox,$oy,$cx,$cy,$fv,$lv,$gv,$tv)
}
Write-Output "--- pics ---"
foreach ($pic in $tree.SelectNodes("p:pic", $ns)) {
  $cn = $pic.SelectSingleNode("p:nvPicPr/p:cNvPr", $ns)
  Write-Output ("pic id={0} name={1}" -f $cn.GetAttribute('id'), $cn.GetAttribute('name'))
}
$ids = [regex]::Matches([System.IO.File]::ReadAllText($p), '<p:cNvPr id="(\d+)"') | ForEach-Object { [int]$_.Groups[1].Value }
Write-Output ("MAXID=" + ($ids | Measure-Object -Maximum).Maximum)
