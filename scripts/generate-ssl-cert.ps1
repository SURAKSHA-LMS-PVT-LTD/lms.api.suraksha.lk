# ============================================
# SSL Certificate Generation Script (PowerShell)
# ============================================
# Generates self-signed SSL certificates for development
# ⚠️ WARNING: Self-signed certificates are for DEVELOPMENT ONLY!
# For production, use Let's Encrypt or commercial certificates

param(
    [string]$Domain = "localhost",
    [int]$ValidDays = 365,
    [string]$OutputDir = "ssl"
)

Write-Host "🔐 SSL Certificate Generator for Development" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if OpenSSL is installed
try {
    $null = Get-Command openssl -ErrorAction Stop
    Write-Host "✅ OpenSSL found" -ForegroundColor Green
} catch {
    Write-Host "❌ OpenSSL not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install OpenSSL first:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    Write-Host "2. Install Win64 OpenSSL v3.x.x" -ForegroundColor Yellow
    Write-Host "3. Add OpenSSL to PATH (usually C:\Program Files\OpenSSL-Win64\bin)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Create SSL directory if it doesn't exist
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Host "✅ Created directory: $OutputDir" -ForegroundColor Green
} else {
    Write-Host "📁 Using existing directory: $OutputDir" -ForegroundColor Yellow
}

# Certificate details
$PrivateKeyPath = Join-Path $OutputDir "private.key"
$CertPath = Join-Path $OutputDir "certificate.crt"
$Subject = "/C=US/ST=Development/L=DevCity/O=Development/OU=Development/CN=$Domain"

Write-Host ""
Write-Host "📋 Certificate Details:" -ForegroundColor Cyan
Write-Host "   Domain: $Domain"
Write-Host "   Valid for: $ValidDays days"
Write-Host "   Private Key: $PrivateKeyPath"
Write-Host "   Certificate: $CertPath"
Write-Host ""

# Check if certificates already exist
if ((Test-Path $PrivateKeyPath) -or (Test-Path $CertPath)) {
    Write-Host "⚠️  Certificate files already exist!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite them? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "❌ Operation cancelled" -ForegroundColor Red
        exit 0
    }
}

# Generate self-signed certificate
Write-Host "🔧 Generating self-signed certificate..." -ForegroundColor Cyan
try {
    & openssl req -x509 -nodes -days $ValidDays -newkey rsa:2048 `
        -keyout $PrivateKeyPath `
        -out $CertPath `
        -subj $Subject `
        -addext "subjectAltName=DNS:$Domain,DNS:*.$Domain,IP:127.0.0.1,IP:::1"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Certificate generated successfully!" -ForegroundColor Green
        Write-Host ""
        
        # Set file permissions (Windows)
        Write-Host "🔒 Setting file permissions..." -ForegroundColor Cyan
        try {
            # Remove inheritance and set explicit permissions
            $acl = Get-Acl $PrivateKeyPath
            $acl.SetAccessRuleProtection($true, $false)
            $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                $env:USERNAME, "Read", "Allow"
            )
            $acl.SetAccessRule($rule)
            Set-Acl $PrivateKeyPath $acl
            Write-Host "✅ Private key permissions set (Read-only for current user)" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Warning: Could not set strict permissions on private key" -ForegroundColor Yellow
            Write-Host "   This is OK for development, but protect this file!" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "📝 Next Steps:" -ForegroundColor Cyan
        Write-Host "   1. Add to your .env file:" -ForegroundColor White
        Write-Host "      SSL_ENABLED=true" -ForegroundColor Gray
        Write-Host "      SSL_KEY_PATH=./$OutputDir/private.key" -ForegroundColor Gray
        Write-Host "      SSL_CERT_PATH=./$OutputDir/certificate.crt" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   2. Restart your application" -ForegroundColor White
        Write-Host ""
        Write-Host "   3. Access via HTTPS: https://localhost:3000" -ForegroundColor White
        Write-Host ""
        Write-Host "⚠️  IMPORTANT:" -ForegroundColor Yellow
        Write-Host "   - Your browser will show a security warning (expected for self-signed certs)" -ForegroundColor Yellow
        Write-Host "   - Click 'Advanced' and 'Proceed' to accept the certificate" -ForegroundColor Yellow
        Write-Host "   - This is ONLY for development - use proper certificates in production!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "📚 For production setup, see: docs/SSL_CERTIFICATE_SETUP.md" -ForegroundColor Cyan
        Write-Host ""
        
        # Display certificate info
        Write-Host "📄 Certificate Information:" -ForegroundColor Cyan
        & openssl x509 -in $CertPath -noout -subject -dates -fingerprint
        Write-Host ""
        
    } else {
        throw "OpenSSL command failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error generating certificate: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "✅ SSL certificate generation complete!" -ForegroundColor Green
Write-Host ""
