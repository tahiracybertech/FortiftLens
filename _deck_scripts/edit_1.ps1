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

# chip width 1755648, gap 146304 -> pitch 1901952 ; 6 chips centered, left margin 463296
$pitch = 1901952; $left = 463296
$posMap = @{
  '10' = ($left + 0*$pitch); '11' = ($left + 0*$pitch)
  '12' = ($left + 1*$pitch); '13' = ($left + 1*$pitch)
  '14' = ($left + 2*$pitch); '15' = ($left + 2*$pitch)
  '16' = ($left + 3*$pitch); '17' = ($left + 3*$pitch)
  '18' = ($left + 4*$pitch); '19' = ($left + 4*$pitch)
}
foreach ($id in $posMap.Keys) {
  $sp = $doc.SelectSingleNode("//p:sp[p:nvSpPr/p:cNvPr/@id='$id']", $ns)
  $off = $sp.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns)
  $off.SetAttribute('x', [string]$posMap[$id])
}
Write-Output ("repositioned chips: " + (($posMap.Keys | Sort-Object {[int]$_} | ForEach-Object { "$_=" + $posMap[$_] }) -join ' '))

# chip6 x
$cx6 = $left + 5*$pitch
$sp18 = $doc.SelectSingleNode("//p:sp[p:nvSpPr/p:cNvPr/@id='18']", $ns)
$sp19 = $doc.SelectSingleNode("//p:sp[p:nvSpPr/p:cNvPr/@id='19']", $ns)

# clone border
$b = $sp18.CloneNode($true)
$bcn = $b.SelectSingleNode("p:nvSpPr/p:cNvPr", $ns); $bcn.SetAttribute('id','22'); $bcn.SetAttribute('name','Shape 22')
$b.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns).SetAttribute('x', [string]$cx6)
$b.SelectSingleNode("p:spPr/a:ln/a:solidFill/a:srgbClr", $ns).SetAttribute('val','8B5CF6')

# clone text
$t = $sp19.CloneNode($true)
$tcn = $t.SelectSingleNode("p:nvSpPr/p:cNvPr", $ns); $tcn.SetAttribute('id','23'); $tcn.SetAttribute('name','Text 23')
$t.SelectSingleNode("p:spPr/a:xfrm/a:off", $ns).SetAttribute('x', [string]$cx6)
$t.SelectSingleNode(".//a:t", $ns).InnerText = 'Pipeline'

[void]$tree.InsertAfter($b, $sp19)
[void]$tree.InsertAfter($t, $b)
Write-Output ("chip6 x={0} rightEdge={1} (slide 12192000)" -f $cx6, ($cx6+1755648))

$settings = New-Object System.Xml.XmlWriterSettings
$settings.Encoding = New-Object System.Text.UTF8Encoding($false)
$settings.Indent = $false
$settings.OmitXmlDeclaration = $false
$w = [System.Xml.XmlWriter]::Create($p, $settings)
$doc.Save($w); $w.Close()
Write-Output "EDITED slide1.xml"
