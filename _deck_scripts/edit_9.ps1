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

# ---- in-run text edits across whole slide ----
$nStat = 0; $nFive = 0
foreach ($tn in $doc.SelectNodes("//a:t", $ns)) {
  if ($tn.InnerText -eq '5 / 5') { $tn.InnerText = '6 / 6'; $nStat++ }
  elseif ($tn.InnerText -match 'five security phases') { $tn.InnerText = $tn.InnerText.Replace('five security phases','six security phases'); $nFive++ }
}
Write-Output ("in-run: stat5/5->{0}, fiveSecurityPhases->{1}" -f $nStat, $nFive)
if ($nStat -ne 1 -or $nFive -ne 1) { throw "unexpected in-run counts" }

# ---- shrink id=24 list uniformly to sz800 / spcAft200 ----
$sp = $doc.SelectSingleNode("//p:sp[p:nvSpPr/p:cNvPr/@id='24']", $ns)
$tx = $sp.SelectSingleNode("p:txBody", $ns)
foreach ($rp in $tx.SelectNodes(".//a:rPr", $ns))       { if ($rp.HasAttribute('sz')) { $rp.SetAttribute('sz','800') } }
foreach ($ep in $tx.SelectNodes(".//a:endParaRPr", $ns)) { if ($ep.HasAttribute('sz')) { $ep.SetAttribute('sz','800') } }
foreach ($pt in $tx.SelectNodes(".//a:spcAft/a:spcPts", $ns)) { $pt.SetAttribute('val','200') }

# ---- append 4 new bullets, cloning the last run-bearing paragraph ----
$MDASH = [char]0x2014
$MDOT  = [char]0x00B7
$bullets = @(
  ('Deployment & Pipeline Security ' + $MDASH + ' sixth phase: scans GitHub Actions workflows, Dockerfiles & compose for 5 misconfiguration rules (unpinned actions, CI secrets, root/privileged containers, PR-target injection)'),
  ('CI/CD integration ' + $MDASH + ' X-API-Key auth with SHA-256-hashed per-org keys + single-file fortifylens-cli (exit 1 fails the build on critical/high)'),
  ('Scan provenance ' + $MDASH + ' findings tagged ci/manual with commit SHA & branch; reports show a "via CI ' + $MDOT + ' commit abc1234" badge'),
  ('Cross-phase AI correlation now consumes pipeline findings')
)

$tmpl = $null
foreach ($pp in $tx.SelectNodes("a:p", $ns)) { if ($pp.SelectSingleNode("a:r/a:t", $ns)) { $tmpl = $pp } }
if (-not $tmpl) { throw "no template paragraph with a run" }

foreach ($b in $bullets) {
  $np = $tmpl.CloneNode($true)
  $np.SelectSingleNode("a:r/a:t", $ns).InnerText = $b
  [void]$tx.AppendChild($np)
}

$finalCount = $tx.SelectNodes("a:p", $ns).Count
Write-Output ("id24 paragraph count after = {0}" -f $finalCount)
if ($finalCount -ne 8) { throw "expected 8 paragraphs" }

# ---- save UTF8 no BOM ----
$settings = New-Object System.Xml.XmlWriterSettings
$settings.Encoding = New-Object System.Text.UTF8Encoding($false)
$settings.Indent = $false
$settings.OmitXmlDeclaration = $false
$w = [System.Xml.XmlWriter]::Create($p, $settings)
$doc.Save($w)
$w.Close()
Write-Output "EDITED slide9.xml"
