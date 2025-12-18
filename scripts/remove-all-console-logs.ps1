# Remove ALL console.log and console.error statements from TypeScript files
# This script processes ALL .ts files in src/ directory

Write-Host "🧹 Starting comprehensive console statement removal..." -ForegroundColor Cyan
Write-Host ""

$srcPath = "d:\User\Desktop\LMS\laas\src"
$tsFiles = Get-ChildItem -Path $srcPath -Filter "*.ts" -Recurse

$totalFiles = $tsFiles.Count
$processedFiles = 0
$totalLinesRemoved = 0
$filesModified = 0

foreach ($file in $tsFiles) {
    $processedFiles++
    $relativePath = $file.FullName.Substring($srcPath.Length + 1)
    
    # Skip .d.ts files
    if ($file.Name.EndsWith(".d.ts")) {
        continue
    }
    
    $content = Get-Content $file.FullName -Raw
    $lines = $content -split "`n"
    $originalLineCount = $lines.Count
    
    # Filter out console.log and console.error lines
    $filtered = $lines | Where-Object { 
        $_ -notmatch '^\s*console\.(log|error|warn|info|debug)\(' 
    }
    
    $linesRemoved = $originalLineCount - $filtered.Count
    
    if ($linesRemoved -gt 0) {
        $filtered -join "`n" | Set-Content $file.FullName -NoNewline
        $filesModified++
        $totalLinesRemoved += $linesRemoved
        Write-Host "✅ $relativePath - Removed $linesRemoved lines" -ForegroundColor Green
    }
    
    # Progress indicator
    if ($processedFiles % 10 -eq 0) {
        $percent = [math]::Round(($processedFiles / $totalFiles) * 100)
        Write-Host "   Progress: $processedFiles/$totalFiles ($percent%)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "✨ Cleanup Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "📊 Statistics:" -ForegroundColor Cyan
Write-Host "   Total files scanned: $totalFiles" -ForegroundColor White
Write-Host "   Files modified: $filesModified" -ForegroundColor White
Write-Host "   Console statements removed: $totalLinesRemoved" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Your code is now production-ready!" -ForegroundColor Green
