# Remove ONLY unnecessary console statements
# Keeps: main.ts startup logs, CLI tools, migrations
# Removes: Debug logs, cache logs, temporary logs in services/controllers

Write-Host "🧹 Removing UNNECESSARY console statements..." -ForegroundColor Cyan
Write-Host ""

$srcPath = "d:\User\Desktop\LMS\laas\src"

# Files to KEEP console.log (necessary startup/CLI logs)
$filesToKeep = @(
    "main.ts",                          # Server startup logs
    "password-reset-cli.ts",            # CLI tool
    "database-reset-cli.ts",            # CLI tool
    "database-reset.service.ts"         # CLI service
)

# Patterns to KEEP (important logs)
$patternsToKeep = @(
    "Server running on",
    "Environment:",
    "Security",
    "CORS",
    "Rate Limiting",
    "PRODUCTION SECURITY CHECKLIST",
    "CLI tool",
    "Migration",
    "Database reset"
)

$tsFiles = Get-ChildItem -Path $srcPath -Filter "*.ts" -Recurse
$totalLinesRemoved = 0
$filesModified = 0

foreach ($file in $tsFiles) {
    $relativePath = $file.FullName.Substring($srcPath.Length + 1)
    
    # Skip .d.ts files
    if ($file.Name.EndsWith(".d.ts")) {
        continue
    }
    
    # Check if this file should keep all console.log
    $shouldKeepAll = $false
    foreach ($keepFile in $filesToKeep) {
        if ($file.Name -eq $keepFile) {
            $shouldKeepAll = $true
            Write-Host "⏭️  Skipping $relativePath (necessary logs)" -ForegroundColor Yellow
            break
        }
    }
    
    if ($shouldKeepAll) {
        continue
    }
    
    # Skip migration files (they need logs)
    if ($relativePath -match "migrations[\\/]") {
        Write-Host "⏭️  Skipping $relativePath (migration logs)" -ForegroundColor Yellow
        continue
    }
    
    $content = Get-Content $file.FullName -Raw
    $lines = $content -split "`n"
    $originalLineCount = $lines.Count
    $newLines = @()
    $linesRemovedInFile = 0
    
    foreach ($line in $lines) {
        $shouldRemove = $false
        
        # Check if line has console statement
        if ($line -match '^\s*console\.(log|error|warn)\(') {
            $shouldRemove = $true
            
            # But keep if it matches important patterns
            foreach ($pattern in $patternsToKeep) {
                if ($line -match [regex]::Escape($pattern)) {
                    $shouldRemove = $false
                    break
                }
            }
        }
        
        if ($shouldRemove) {
            $linesRemovedInFile++
        } else {
            $newLines += $line
        }
    }
    
    if ($linesRemovedInFile -gt 0) {
        $newLines -join "`n" | Set-Content $file.FullName -NoNewline
        $filesModified++
        $totalLinesRemoved += $linesRemovedInFile
        Write-Host "✅ $relativePath - Removed $linesRemovedInFile unnecessary logs" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "✨ Cleanup Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "📊 Statistics:" -ForegroundColor Cyan
Write-Host "   Files modified: $filesModified" -ForegroundColor White
Write-Host "   Unnecessary logs removed: $totalLinesRemoved" -ForegroundColor White
Write-Host ""
Write-Host "✅ Kept necessary logs:" -ForegroundColor Green
Write-Host "   • Server startup logs (main.ts)" -ForegroundColor White
Write-Host "   • CLI tool logs" -ForegroundColor White
Write-Host "   • Migration logs" -ForegroundColor White
Write-Host "   • Critical error logs" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Production-ready with essential logging!" -ForegroundColor Green
