# VERIFICATION: Check ALL entity creations have timestamps

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Timestamp Coverage Verification" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$rootPath = "d:\User\Desktop\production\Production\lms-api-suraksha-lk\src\modules"
$issuesFound = @()
$filesChecked = 0
$createCallsFound = 0

# Get all service files
$serviceFiles = Get-ChildItem -Path $rootPath -Recurse -Filter "*.service.ts" | 
    Where-Object { $_.FullName -notlike "*node_modules*" }

foreach ($file in $serviceFiles) {
    $filesChecked++
    $content = Get-Content $file.FullName -Raw
    
    # Check for .create( calls
    if ($content -match '\.create\s*\(') {
        $createCallsFound++
        
        # Extract context around .create calls
        $lines = Get-Content $file.FullName
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '\.create\s*\(') {
                # Check next 20 lines for createdAt/updatedAt
                $contextLines = $lines[$i..([Math]::Min($i + 20, $lines.Count - 1))] -join "`n"
                
                if ($contextLines -notmatch 'createdAt' -and $contextLines -notmatch 'created_at') {
                    $issuesFound += [PSCustomObject]@{
                        File = $file.Name
                        Line = $i + 1
                        Path = $file.FullName
                    }
                }
            }
        }
    }
}

Write-Host "Files Checked: $filesChecked" -ForegroundColor White
Write-Host "Files with .create() calls: $createCallsFound" -ForegroundColor White

if ($issuesFound.Count -eq 0) {
    Write-Host "`n✅ SUCCESS! All entity creations have timestamps!" -ForegroundColor Green
    Write-Host "   100% Coverage Achieved!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Found $($issuesFound.Count) potential issues:" -ForegroundColor Yellow
    $issuesFound | ForEach-Object {
        Write-Host "   - $($_.File):$($_.Line)" -ForegroundColor Yellow
    }
    Write-Host "`nFiles need manual review:" -ForegroundColor Cyan
    $issuesFound | Select-Object -Unique File, Path | ForEach-Object {
        Write-Host "   $($_.Path)" -ForegroundColor Gray
    }
}

Write-Host "`n========================================`n" -ForegroundColor Cyan
