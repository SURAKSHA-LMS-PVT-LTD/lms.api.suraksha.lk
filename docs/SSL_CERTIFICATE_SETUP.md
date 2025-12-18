# 🔐 SSL/TLS Certificate Setup Guide

## Overview
This guide explains how to set up SSL/TLS certificates for your NestJS Learning Management System to enable HTTPS encryption.

## Table of Contents
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Certificate Options](#certificate-options)
- [Self-Signed Certificates (Development)](#self-signed-certificates-development)
- [Let's Encrypt (Production)](#lets-encrypt-production)
- [Custom CA Certificates](#custom-ca-certificates)
- [Cloud Deployment](#cloud-deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Enable SSL in Environment Variables

Add these to your `.env` file:

```env
# SSL/TLS Configuration
SSL_ENABLED=true
SSL_KEY_PATH=./ssl/private.key
SSL_CERT_PATH=./ssl/certificate.crt
SSL_CA_PATH=./ssl/ca-bundle.crt  # Optional: for intermediate certificates
```

### 2. Create SSL Directory

```powershell
# Windows PowerShell
mkdir ssl
```

```bash
# Linux/Mac
mkdir ssl
```

### 3. Add Certificates

Place your SSL certificate files in the `ssl/` directory:
- `private.key` - Your private key file
- `certificate.crt` - Your SSL certificate
- `ca-bundle.crt` - (Optional) CA bundle for intermediate certificates

---

## Environment Variables

### Required Variables

```env
# Enable SSL/TLS
SSL_ENABLED=true

# Certificate file paths (relative or absolute)
SSL_KEY_PATH=./ssl/private.key
SSL_CERT_PATH=./ssl/certificate.crt
```

### Optional Variables

```env
# CA Bundle (for intermediate certificates from Certificate Authority)
SSL_CA_PATH=./ssl/ca-bundle.crt

# Force HTTPS in production
NODE_ENV=production
```

---

## Certificate Options

### Option 1: Self-Signed Certificates (Development Only)

**⚠️ WARNING: Self-signed certificates should NEVER be used in production!**

#### Generate Self-Signed Certificate (Windows)

Using OpenSSL for Windows:

```powershell
# Install OpenSSL (if not already installed)
# Download from: https://slproweb.com/products/Win32OpenSSL.html

# Generate private key and certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout ssl/private.key `
  -out ssl/certificate.crt `
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

#### Generate Self-Signed Certificate (Linux/Mac)

```bash
# Generate private key and certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/private.key \
  -out ssl/certificate.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

---

### Option 2: Let's Encrypt (Production - Free)

Let's Encrypt provides **free, automated SSL certificates** for production use.

#### Prerequisites
- Domain name pointing to your server
- Port 80 and 443 open
- Root/sudo access

#### Using Certbot (Recommended)

**Windows:**
```powershell
# Download Certbot for Windows
# https://certbot.eff.org/instructions

# Run Certbot
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

**Linux (Ubuntu/Debian):**
```bash
# Install Certbot
sudo apt update
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

**Linux (CentOS/RHEL):**
```bash
# Install Certbot
sudo yum install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
```

#### Copy Let's Encrypt Certificates

```bash
# Linux
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./ssl/private.key
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./ssl/certificate.crt
sudo chown $USER:$USER ./ssl/*.key ./ssl/*.crt
```

#### Auto-Renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Setup auto-renewal (runs twice daily)
sudo crontab -e

# Add this line:
0 0,12 * * * certbot renew --quiet --post-hook "systemctl restart your-app-service"
```

---

### Option 3: Custom CA Certificates (Enterprise)

If you purchased SSL certificates from a Certificate Authority (GoDaddy, Namecheap, DigiCert, etc.):

#### File Structure
```
ssl/
├── private.key          # Your private key (DO NOT SHARE)
├── certificate.crt      # Your domain certificate
└── ca-bundle.crt       # CA bundle (intermediate + root certificates)
```

#### Environment Configuration
```env
SSL_ENABLED=true
SSL_KEY_PATH=./ssl/private.key
SSL_CERT_PATH=./ssl/certificate.crt
SSL_CA_PATH=./ssl/ca-bundle.crt
```

---

## Cloud Deployment

### AWS (Elastic Beanstalk / EC2)

**Option 1: AWS Certificate Manager (ACM)**
```
1. Request certificate in ACM console
2. Use Application Load Balancer (ALB) for SSL termination
3. ALB handles HTTPS, forwards HTTP to your app
4. Set SSL_ENABLED=false (ALB handles SSL)
```

**Option 2: Certificate on EC2**
```bash
# Install certbot
sudo yum install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy to project
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /home/ec2-user/app/ssl/private.key
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /home/ec2-user/app/ssl/certificate.crt
```

### Google Cloud Platform

**Option 1: Load Balancer SSL Termination**
```
1. Create managed SSL certificate in Cloud Console
2. Attach to Load Balancer
3. Set SSL_ENABLED=false in app
```

**Option 2: Certificate on Compute Engine**
```bash
# Use certbot like EC2 example above
```

### Azure

**Option 1: Azure App Service**
```
1. Go to App Service > TLS/SSL settings
2. Add custom domain
3. Create/upload certificate
4. Set SSL_ENABLED=false (Azure handles SSL)
```

**Option 2: Azure VM**
```bash
# Use certbot like EC2 example above
```

### DigitalOcean

```bash
# Install certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /var/www/app/ssl/private.key
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /var/www/app/ssl/certificate.crt
```

---

## Security Best Practices

### 1. File Permissions

**Linux/Mac:**
```bash
# Restrict access to private key
chmod 600 ssl/private.key
chmod 644 ssl/certificate.crt
chmod 644 ssl/ca-bundle.crt

# Only owner can read private key
chown $USER:$USER ssl/*
```

**Windows:**
```powershell
# Restrict access to SSL folder
icacls ssl /inheritance:r
icacls ssl /grant:r "${env:USERNAME}:(OI)(CI)F"
```

### 2. Never Commit Certificates to Git

Add to `.gitignore`:
```gitignore
# SSL Certificates
ssl/
*.key
*.crt
*.pem
*.p12
*.pfx
```

### 3. Environment Variables

**Never hardcode paths in production!** Always use environment variables:

```env
# ✅ GOOD
SSL_KEY_PATH=/etc/ssl/private/private.key
SSL_CERT_PATH=/etc/ssl/certs/certificate.crt

# ❌ BAD
# Hardcoded in code
```

### 4. Certificate Expiration Monitoring

Set up monitoring for certificate expiration:

```bash
# Check certificate expiration
openssl x509 -in ssl/certificate.crt -noout -enddate

# Certificate expiration check script
#!/bin/bash
CERT_FILE="./ssl/certificate.crt"
EXPIRY_DATE=$(openssl x509 -in $CERT_FILE -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

if [ $DAYS_LEFT -lt 30 ]; then
  echo "⚠️  WARNING: SSL certificate expires in $DAYS_LEFT days!"
fi
```

---

## Testing SSL Configuration

### 1. Test HTTPS Connection

```bash
# Test with curl
curl -v https://localhost:3000

# Test with OpenSSL
openssl s_client -connect localhost:3000 -showcerts
```

### 2. Verify Certificate

```bash
# Check certificate details
openssl x509 -in ssl/certificate.crt -text -noout

# Verify certificate chain
openssl verify -CAfile ssl/ca-bundle.crt ssl/certificate.crt
```

### 3. Test in Browser

1. Navigate to `https://localhost:3000`
2. Check browser security indicator (lock icon)
3. View certificate details

---

## Troubleshooting

### Error: "Certificate files not found"

**Cause:** Files don't exist at specified paths

**Solution:**
```bash
# Check if files exist
ls -la ssl/

# Verify paths in .env
cat .env | grep SSL_
```

### Error: "Permission denied"

**Cause:** App doesn't have permission to read certificate files

**Solution:**
```bash
# Linux/Mac
chmod 600 ssl/private.key
chown $USER ssl/private.key

# Windows PowerShell (Run as Administrator)
icacls ssl\private.key /grant:r "${env:USERNAME}:R"
```

### Error: "unable to get local issuer certificate"

**Cause:** Missing intermediate certificates

**Solution:**
```env
# Add CA bundle to .env
SSL_CA_PATH=./ssl/ca-bundle.crt
```

### Error: "SSL routines:tls_process_client_hello:version too low"

**Cause:** Client using TLS 1.0 or 1.1 (deprecated)

**Solution:** Application requires TLS 1.2+. Update client.

### Browser Shows "Not Secure" Warning

**Causes:**
1. Self-signed certificate (development only)
2. Certificate expired
3. Certificate doesn't match domain
4. Missing intermediate certificates

**Solutions:**
1. **Development:** Accept self-signed certificate warning (temporary)
2. **Production:** Use proper CA-signed certificate (Let's Encrypt or commercial)
3. Verify certificate common name matches domain
4. Include CA bundle with intermediate certificates

---

## Production Checklist

Before deploying with SSL:

- [ ] SSL certificates from trusted CA (not self-signed)
- [ ] Certificate matches your domain name
- [ ] Private key file permissions set to 600
- [ ] Certificates not committed to version control
- [ ] Environment variables configured correctly
- [ ] Certificate expiration monitoring set up
- [ ] Auto-renewal configured (for Let's Encrypt)
- [ ] Firewall allows port 443 (HTTPS)
- [ ] `NODE_ENV=production` set
- [ ] HTTPS tested in browser
- [ ] Certificate chain verified

---

## Example Directory Structure

```
laas/
├── .env                          # Environment variables
├── .gitignore                    # Includes ssl/ directory
├── ssl/                          # SSL certificates (not in git)
│   ├── private.key              # Private key (600 permissions)
│   ├── certificate.crt          # SSL certificate
│   └── ca-bundle.crt            # Optional CA bundle
├── src/
│   └── main.ts                   # SSL configuration
└── docs/
    └── SSL_CERTIFICATE_SETUP.md  # This file
```

---

## Quick Reference

### Development (Self-Signed)
```env
SSL_ENABLED=true
SSL_KEY_PATH=./ssl/private.key
SSL_CERT_PATH=./ssl/certificate.crt
NODE_ENV=development
```

### Production (Let's Encrypt)
```env
SSL_ENABLED=true
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
NODE_ENV=production
```

### Production (Commercial Certificate)
```env
SSL_ENABLED=true
SSL_KEY_PATH=/etc/ssl/private/private.key
SSL_CERT_PATH=/etc/ssl/certs/certificate.crt
SSL_CA_PATH=/etc/ssl/certs/ca-bundle.crt
NODE_ENV=production
```

---

## Additional Resources

- **Let's Encrypt:** https://letsencrypt.org/
- **Certbot:** https://certbot.eff.org/
- **SSL Labs Test:** https://www.ssllabs.com/ssltest/
- **NestJS HTTPS:** https://docs.nestjs.com/faq/https
- **OpenSSL:** https://www.openssl.org/

---

## Support

For issues related to SSL configuration, check:
1. Server logs for specific error messages
2. Certificate file permissions
3. Environment variable configuration
4. Firewall settings (port 443 open)

---

**Last Updated:** October 19, 2025
