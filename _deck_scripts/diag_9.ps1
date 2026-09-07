$ErrorActionPreference = 'Stop'
$x = Join-Path $env:TEMP 'deck_edit\x\ppt\slides'
$p = Join-Path $x 'slide9.xml'

$doc = New-Object System.Xml.XmlDocument
$doc.PreserveWhitespace = $false
$doc.Load($p)

$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
$ns.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
$ns.AddNamespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships')

$sp = $doc.SelectSingleNode("//p:sp[p:nvSpPr/p:cNvPr/@id='24']", $ns)
if (-not $sp) { throw "id=24 not found" }
$xfrm = $sp.SelectSingleNode("p:spPr/a:xfrm", $ns)
Write-Output ("id24 off x={0} y={1} ext cx={2} cy={3}" -f $xfrm.SelectSingleNode('a:off',$ns).GetAttribute('x'), $xfrm.SelectSingleNode('a:off',$ns).GetAttribute('y'), $xfrm.SelectSingleNode('a:ext',$ns).GetAttribute('cx'), $xfrm.SelectSingleNode('a:ext',$ns).GetAttribute('cy'))
$tx = $sp.SelectSingleNode("p:txBody", $ns)
$paras = $tx.SelectNodes("a:p", $ns)
Write-Output ("id24 paragraph count = {0}" -f $paras.Count)
$i=0
foreach ($pp in $paras) {
  $tn = $pp.SelectSingleNode("a:r/a:t", $ns)
  $sz = $pp.SelectSingleNode("a:r/a:rPr", $ns)
  $szv = if ($sz) { $sz.GetAttribute('sz') } else { '(no run)' }
  $txt = if ($tn) { $tn.InnerText } else { '(empty)' }
  Write-Output ("  p[{0}] sz={1} :: {2}" -f $i, $szv, $txt)
  $i++
}
