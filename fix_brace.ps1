$path = 'c:\Users\91798\Documents\projectAnalyser\frontend\app\page.tsx'
$lines = [System.IO.File]::ReadAllLines($path)
$out = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($i -ne 573) {
    [void]$out.Add($lines[$i])
  }
}
[System.IO.File]::WriteAllLines($path, $out)
Write-Host "Done. Lines: $($out.Count)"
