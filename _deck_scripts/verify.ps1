$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP 'deck_edit'
Write-Output ("TEMP_ROOT=" + $root)
$x = Join-Path $root 'x\ppt\slides'
if (Test-Path $x) {
    $c = (Get-ChildItem (Join-Path $x '*.xml')).Count
    Write-Output ("X_EXISTS slidecount=" + $c)
} else {
    Write-Output 'X_MISSING'
}
$p1 = Join-Path $root 'pretty\slide1.xml'
if (Test-Path $p1) { Write-Output 'PRETTY1_EXISTS' } else { Write-Output 'PRETTY1_MISSING' }
$h = Join-Path $env:TEMP 'deck_edit_orig_hash.txt'
if (Test-Path $h) { Write-Output ('ORIGHASH=' + (Get-Content $h -Raw)) } else { Write-Output 'NOHASH' }
# Verify original file untouched
$orig = 'C:\Users\wasee\Downloads\FortifyLens_Pitch_Deck (4).pptx'
if (Test-Path $orig) {
    $cur = (Get-FileHash $orig -Algorithm SHA256).Hash
    Write-Output ('CURRENT_ORIG_HASH=' + $cur)
} else {
    Write-Output 'ORIG_MISSING'
}
# Check presentation.xml slide size
$pres = Join-Path $root 'x\ppt\presentation.xml'
if (Test-Path $pres) {
    $t = Get-Content $pres -Raw
    if ($t -match '<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"') {
        Write-Output ('SLDSZ cx=' + $matches[1] + ' cy=' + $matches[2])
    }
}
