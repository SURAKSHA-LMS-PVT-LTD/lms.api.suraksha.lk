# Script to remove excessive debug and log statements
# Keeps: logger.error(), logger.warn()
# Removes: logger.debug(), logger.log(), logger.verbose() with success/progress messages

$files = @(
    "src\modules\user\user.service.ts",
    "src\modules\sms\services\sms.service.ts",
    "src\common\services\cache-validation.service.ts",
    "src\common\services\cache-user-management.service.ts",
    "src\auth\auth.service.ts",
    "src\auth\services\first-login.service.ts",
    "src\auth\services\password-reset.service.ts",
    "src\auth\controllers\first-login.controller.ts",
    "src\common\services\cloud-storage.service.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Remove lines with logger.debug (entire line)
        $content = $content -replace '(?m)^\s*this\.logger\.debug\([^)]*\);\s*\r?\n', ''
        
        # Remove lines with logger.log that have success/progress indicators
        $content = $content -replace '(?m)^\s*this\.logger\.log\([^)]*[✅🔍📊📤📋🎯💾🎉📸🆔🎓👪🚀💰📢🔐📝📡🎭⭐💳]\s*[^)]*\);\s*\r?\n', ''
        
        # Remove lines with logger.verbose
        $content = $content -replace '(?m)^\s*this\.logger\.verbose\([^)]*\);\s*\r?\n', ''
        
        # Write back
        Set-Content -Path $file -Value $content -NoNewline
        Write-Host "Cleaned: $file" -ForegroundColor Green
    }
}

Write-Host "`nLog cleanup complete!" -ForegroundColor Cyan
