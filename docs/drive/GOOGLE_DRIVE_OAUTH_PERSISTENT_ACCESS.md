# 🔐 Google Drive OAuth 2.0 - Persistent Access Implementation

## 📋 Overview

Enable users to grant **one-time permission** to upload files to their Google Drive, eliminating the need for repeated logins. The system stores refresh tokens and automatically uploads files on behalf of users.

---

## 🎯 Solution: OAuth 2.0 with Refresh Tokens

### **How It Works:**

```
1. User clicks "Connect Google Drive" (ONE TIME)
   └── Redirects to Google OAuth consent screen
   
2. User grants permissions
   └── Google returns authorization code
   
3. Backend exchanges code for tokens
   ├── Access Token (expires in 1 hour)
   └── Refresh Token (NEVER EXPIRES) ✅
   
4. Store refresh token in database
   └── Encrypted and linked to user account
   
5. Upload files anytime
   ├── Use refresh token to get new access token
   └── Upload to user's Google Drive
   
6. Token automatically refreshed when expired
   └── User NEVER needs to login again ✅
```

---

## 🗄️ Database Schema

### **New Table: `user_google_drive_credentials`**

```typescript
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

@Entity('user_google_drive_credentials')
@Index(['userId', 'isActive'])
@Index(['userId', 'isRevoked'])
export class UserGoogleDriveCredentials {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // 👤 USER REFERENCE
  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  // 🔑 GOOGLE OAUTH TOKENS
  @Column({ 
    name: 'access_token', 
    type: 'text',
    comment: 'Encrypted Google access token (expires in 1 hour)'
  })
  accessToken: string;

  @Column({ 
    name: 'refresh_token', 
    type: 'text',
    comment: 'Encrypted Google refresh token (NEVER expires unless revoked)'
  })
  refreshToken: string;

  @Column({ 
    name: 'token_type', 
    type: 'varchar', 
    length: 20,
    default: 'Bearer',
    comment: 'Usually "Bearer"'
  })
  tokenType: string;

  @Column({ 
    name: 'expires_at', 
    type: 'timestamp',
    comment: 'When access token expires (usually 1 hour from issue)'
  })
  expiresAt: Date;

  @Column({ 
    name: 'scope', 
    type: 'text',
    comment: 'Granted permissions (e.g., "https://www.googleapis.com/auth/drive.file")'
  })
  scope: string;

  // 📧 GOOGLE ACCOUNT INFO
  @Column({ 
    name: 'google_email', 
    type: 'varchar', 
    length: 255,
    comment: 'Connected Google account email'
  })
  googleEmail: string;

  @Column({ 
    name: 'google_user_id', 
    type: 'varchar', 
    length: 255,
    comment: 'Google user ID (sub from ID token)'
  })
  googleUserId: string;

  @Column({ 
    name: 'google_name', 
    type: 'varchar', 
    length: 255,
    nullable: true,
    comment: 'Google account display name'
  })
  googleName?: string;

  @Column({ 
    name: 'google_picture', 
    type: 'text',
    nullable: true,
    comment: 'Google profile picture URL'
  })
  googlePicture?: string;

  // ⚙️ STATUS & METADATA
  @Column({ 
    name: 'is_active', 
    type: 'boolean',
    default: true,
    comment: 'Whether credentials are currently valid'
  })
  isActive: boolean;

  @Column({ 
    name: 'is_revoked', 
    type: 'boolean',
    default: false,
    comment: 'User revoked access or token invalidated'
  })
  isRevoked: boolean;

  @Column({ 
    name: 'last_used_at', 
    type: 'timestamp',
    nullable: true,
    comment: 'Last time credentials were used for upload'
  })
  lastUsedAt?: Date;

  @Column({ 
    name: 'total_uploads', 
    type: 'int',
    default: 0,
    comment: 'Count of successful uploads using these credentials'
  })
  totalUploads: number;

  @Column({ 
    name: 'grant_type', 
    type: 'enum',
    enum: ['authorization_code', 'offline'],
    default: 'offline',
    comment: 'OAuth grant type used'
  })
  grantType: string;

  @Column({ 
    name: 'connected_from_ip', 
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'IP address when user connected'
  })
  connectedFromIp?: string;

  @Column({ 
    name: 'user_agent', 
    type: 'text',
    nullable: true,
    comment: 'Browser user agent when connected'
  })
  userAgent?: string;

  // 🕒 TIMESTAMPS
  @Column({ name: 'connected_at', type: 'timestamp' })
  connectedAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date;
}
```

### **SQL Migration:**

```sql
CREATE TABLE user_google_drive_credentials (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  
  -- OAuth Tokens (ENCRYPTED)
  access_token TEXT NOT NULL COMMENT 'Encrypted access token',
  refresh_token TEXT NOT NULL COMMENT 'Encrypted refresh token (persistent)',
  token_type VARCHAR(20) DEFAULT 'Bearer',
  expires_at TIMESTAMP NOT NULL,
  scope TEXT NOT NULL,
  
  -- Google Account Info
  google_email VARCHAR(255) NOT NULL,
  google_user_id VARCHAR(255) NOT NULL,
  google_name VARCHAR(255),
  google_picture TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_revoked BOOLEAN DEFAULT FALSE,
  last_used_at TIMESTAMP,
  total_uploads INT DEFAULT 0,
  
  -- Metadata
  grant_type ENUM('authorization_code', 'offline') DEFAULT 'offline',
  connected_from_ip VARCHAR(45),
  user_agent TEXT,
  
  -- Timestamps
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  
  INDEX idx_user_active (user_id, is_active),
  INDEX idx_user_revoked (user_id, is_revoked),
  INDEX idx_google_user (google_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 🔧 Backend Implementation

### **1. Environment Variables**

```env
# .env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file

# Encryption for tokens
TOKEN_ENCRYPTION_KEY=your-32-character-secret-key
```

### **2. Google OAuth Service**

```typescript
// src/modules/google-drive/google-oauth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';
import { UserGoogleDriveCredentials } from './entities/user-google-drive-credentials.entity';

@Injectable()
export class GoogleOAuthService {
  private oauth2Client: OAuth2Client;
  
  constructor(
    @InjectRepository(UserGoogleDriveCredentials)
    private credentialsRepository: Repository<UserGoogleDriveCredentials>,
  ) {
    // Initialize Google OAuth2 Client
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  /**
   * STEP 1: Generate authorization URL for user to connect Google Drive
   */
  getAuthorizationUrl(userId: string): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // ✅ THIS IS CRITICAL - Returns refresh token
      scope: [
        'https://www.googleapis.com/auth/drive.file', // Upload files
        'https://www.googleapis.com/auth/userinfo.profile', // Get user info
        'https://www.googleapis.com/auth/userinfo.email', // Get email
      ],
      prompt: 'consent', // Force consent screen to get refresh token
      state: this.encryptState({ userId, timestamp: Date.now() }), // Pass userId securely
    });

    return authUrl;
  }

  /**
   * STEP 2: Handle OAuth callback and store credentials
   */
  async handleCallback(code: string, state: string): Promise<{
    success: boolean;
    userId: string;
    googleEmail: string;
  }> {
    // Decrypt and validate state
    const { userId } = this.decryptState(state);

    // Exchange authorization code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new UnauthorizedException(
        'Refresh token not received. User may have already granted access.',
      );
    }

    // Set credentials to get user info
    this.oauth2Client.setCredentials(tokens);

    // Get Google user info
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expiry_date || 3600000));

    // Check if credentials already exist
    let credentials = await this.credentialsRepository.findOne({
      where: { userId },
    });

    if (credentials) {
      // Update existing credentials
      credentials.accessToken = this.encryptToken(tokens.access_token);
      credentials.refreshToken = this.encryptToken(tokens.refresh_token);
      credentials.expiresAt = expiresAt;
      credentials.scope = tokens.scope;
      credentials.googleEmail = userInfo.email;
      credentials.googleUserId = userInfo.id;
      credentials.googleName = userInfo.name;
      credentials.googlePicture = userInfo.picture;
      credentials.isActive = true;
      credentials.isRevoked = false;
      credentials.updatedAt = new Date();
    } else {
      // Create new credentials
      credentials = this.credentialsRepository.create({
        userId,
        accessToken: this.encryptToken(tokens.access_token),
        refreshToken: this.encryptToken(tokens.refresh_token),
        tokenType: tokens.token_type || 'Bearer',
        expiresAt,
        scope: tokens.scope,
        googleEmail: userInfo.email,
        googleUserId: userInfo.id,
        googleName: userInfo.name,
        googlePicture: userInfo.picture,
        isActive: true,
        connectedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await this.credentialsRepository.save(credentials);

    return {
      success: true,
      userId,
      googleEmail: userInfo.email,
    };
  }

  /**
   * STEP 3: Get valid OAuth client for user (auto-refreshes if expired)
   */
  async getUserOAuthClient(userId: string): Promise<OAuth2Client> {
    const credentials = await this.credentialsRepository.findOne({
      where: { userId, isActive: true, isRevoked: false },
    });

    if (!credentials) {
      throw new UnauthorizedException(
        'Google Drive not connected. Please connect your Google Drive first.',
      );
    }

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    // Decrypt tokens
    const accessToken = this.decryptToken(credentials.accessToken);
    const refreshToken = this.decryptToken(credentials.refreshToken);

    // Set credentials
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: credentials.expiresAt.getTime(),
    });

    // ✅ AUTO-REFRESH: If token expired, refresh it automatically
    if (Date.now() >= credentials.expiresAt.getTime()) {
      console.log(`[GoogleOAuth] Access token expired for user ${userId}, refreshing...`);
      
      try {
        const { credentials: newTokens } = await client.refreshAccessToken();

        // Update stored access token
        credentials.accessToken = this.encryptToken(newTokens.access_token);
        credentials.expiresAt = new Date(newTokens.expiry_date);
        credentials.updatedAt = new Date();
        await this.credentialsRepository.save(credentials);

        console.log(`[GoogleOAuth] Token refreshed successfully for user ${userId}`);
      } catch (error) {
        console.error(`[GoogleOAuth] Token refresh failed for user ${userId}:`, error);
        
        // Mark as revoked if refresh fails
        credentials.isActive = false;
        credentials.isRevoked = true;
        credentials.revokedAt = new Date();
        await this.credentialsRepository.save(credentials);

        throw new UnauthorizedException(
          'Google Drive access expired. Please reconnect your Google Drive.',
        );
      }
    }

    // Update last used timestamp
    credentials.lastUsedAt = new Date();
    await this.credentialsRepository.save(credentials);

    return client;
  }

  /**
   * Check if user has Google Drive connected
   */
  async isConnected(userId: string): Promise<boolean> {
    const credentials = await this.credentialsRepository.findOne({
      where: { userId, isActive: true, isRevoked: false },
    });
    return !!credentials;
  }

  /**
   * Revoke user's Google Drive access
   */
  async revokeAccess(userId: string): Promise<void> {
    const credentials = await this.credentialsRepository.findOne({
      where: { userId },
    });

    if (credentials) {
      // Revoke token with Google
      try {
        const client = new google.auth.OAuth2();
        client.setCredentials({
          access_token: this.decryptToken(credentials.accessToken),
        });
        await client.revokeCredentials();
      } catch (error) {
        console.error(`[GoogleOAuth] Failed to revoke with Google:`, error);
      }

      // Mark as revoked in database
      credentials.isActive = false;
      credentials.isRevoked = true;
      credentials.revokedAt = new Date();
      await this.credentialsRepository.save(credentials);
    }
  }

  // 🔐 ENCRYPTION HELPERS
  private encryptToken(token: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'utf8');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'utf8');
    
    const [ivHex, encrypted] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private encryptState(data: any): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  private decryptState(state: string): any {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  }
}
```

---

### **3. Google Drive Upload Service**

```typescript
// src/modules/google-drive/google-drive-upload.service.ts

import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { GoogleOAuthService } from './google-oauth.service';

@Injectable()
export class GoogleDriveUploadService {
  constructor(private googleOAuthService: GoogleOAuthService) {}

  /**
   * Upload file to user's Google Drive
   * User does NOT need to be logged in to Google Drive!
   */
  async uploadFile(
    userId: string,
    file: Express.Multer.File,
    options?: {
      folderId?: string;
      fileName?: string;
      description?: string;
    },
  ): Promise<{
    fileId: string;
    fileName: string;
    mimeType: string;
    size: number;
    webViewLink: string;
    webContentLink: string;
  }> {
    // Get user's OAuth client (auto-refreshes token if needed)
    const auth = await this.googleOAuthService.getUserOAuthClient(userId);

    // Initialize Google Drive API
    const drive = google.drive({ version: 'v3', auth });

    // Prepare file metadata
    const fileMetadata: any = {
      name: options?.fileName || file.originalname,
      description: options?.description || 'Uploaded via LMS',
    };

    // If folder specified, set parent
    if (options?.folderId) {
      fileMetadata.parents = [options.folderId];
    }

    // Convert buffer to stream
    const media = {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer),
    };

    // Upload to Google Drive
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, webViewLink, webContentLink',
    });

    const uploadedFile = response.data;

    // Make file accessible (optional - depends on requirements)
    // await drive.permissions.create({
    //   fileId: uploadedFile.id,
    //   requestBody: {
    //     role: 'reader',
    //     type: 'anyone',
    //   },
    // });

    // Update upload count
    await this.updateUploadCount(userId);

    return {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
      mimeType: uploadedFile.mimeType,
      size: parseInt(uploadedFile.size),
      webViewLink: uploadedFile.webViewLink,
      webContentLink: uploadedFile.webContentLink,
    };
  }

  /**
   * Create folder in user's Google Drive
   */
  async createFolder(
    userId: string,
    folderName: string,
    parentFolderId?: string,
  ): Promise<{ folderId: string; folderName: string; webViewLink: string }> {
    const auth = await this.googleOAuthService.getUserOAuthClient(userId);
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name, webViewLink',
    });

    return {
      folderId: response.data.id,
      folderName: response.data.name,
      webViewLink: response.data.webViewLink,
    };
  }

  /**
   * List files in user's Google Drive
   */
  async listFiles(
    userId: string,
    options?: {
      folderId?: string;
      pageSize?: number;
      query?: string;
    },
  ): Promise<any[]> {
    const auth = await this.googleOAuthService.getUserOAuthClient(userId);
    const drive = google.drive({ version: 'v3', auth });

    let query = "trashed = false";
    
    if (options?.folderId) {
      query += ` and '${options.folderId}' in parents`;
    }
    
    if (options?.query) {
      query += ` and ${options.query}`;
    }

    const response = await drive.files.list({
      pageSize: options?.pageSize || 100,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
      q: query,
    });

    return response.data.files;
  }

  private async updateUploadCount(userId: string): Promise<void> {
    // Update total_uploads count
    // Implementation depends on your repository
  }
}
```

---

### **4. Controller Endpoints**

```typescript
// src/modules/google-drive/google-drive.controller.ts

import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleDriveUploadService } from './google-drive-upload.service';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';

@Controller('api/google-drive')
@UseGuards(JwtAuthGuard)
export class GoogleDriveController {
  constructor(
    private googleOAuthService: GoogleOAuthService,
    private googleDriveUploadService: GoogleDriveUploadService,
  ) {}

  /**
   * STEP 1: Get authorization URL to connect Google Drive
   * Frontend redirects user to this URL
   */
  @Get('connect')
  async getConnectUrl(@Req() request: JwtRequest) {
    const userId = request.user.s;
    const authUrl = this.googleOAuthService.getAuthorizationUrl(userId);
    
    return {
      success: true,
      authUrl,
      message: 'Redirect user to this URL to connect Google Drive',
    };
  }

  /**
   * STEP 2: OAuth callback (Google redirects here after user grants permission)
   */
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const result = await this.googleOAuthService.handleCallback(code, state);
    
    // Redirect to frontend success page
    return `
      <html>
        <body>
          <h2>Google Drive Connected Successfully!</h2>
          <p>Email: ${result.googleEmail}</p>
          <script>
            setTimeout(() => {
              window.close(); // Close popup
              // OR redirect: window.location.href = 'http://localhost:4200/settings?google_drive=connected';
            }, 2000);
          </script>
        </body>
      </html>
    `;
  }

  /**
   * Check if user has Google Drive connected
   */
  @Get('status')
  async getConnectionStatus(@Req() request: JwtRequest) {
    const userId = request.user.s;
    const isConnected = await this.googleOAuthService.isConnected(userId);
    
    return {
      success: true,
      isConnected,
      message: isConnected 
        ? 'Google Drive is connected' 
        : 'Google Drive not connected',
    };
  }

  /**
   * Upload file to user's Google Drive (NO LOGIN REQUIRED!)
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId: string,
    @Body('fileName') fileName: string,
    @Req() request: JwtRequest,
  ) {
    const userId = request.user.s;

    const result = await this.googleDriveUploadService.uploadFile(userId, file, {
      folderId,
      fileName,
    });

    return {
      success: true,
      message: 'File uploaded to Google Drive successfully',
      data: result,
    };
  }

  /**
   * Create folder in user's Google Drive
   */
  @Post('create-folder')
  async createFolder(
    @Body('folderName') folderName: string,
    @Body('parentFolderId') parentFolderId: string,
    @Req() request: JwtRequest,
  ) {
    const userId = request.user.s;

    const result = await this.googleDriveUploadService.createFolder(
      userId,
      folderName,
      parentFolderId,
    );

    return {
      success: true,
      message: 'Folder created in Google Drive',
      data: result,
    };
  }

  /**
   * Disconnect Google Drive
   */
  @Delete('disconnect')
  async disconnect(@Req() request: JwtRequest) {
    const userId = request.user.s;
    await this.googleOAuthService.revokeAccess(userId);
    
    return {
      success: true,
      message: 'Google Drive disconnected successfully',
    };
  }
}
```

---

## 🎨 Frontend Implementation

### **1. Connect Google Drive Button**

```typescript
// components/GoogleDriveConnect.tsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function GoogleDriveConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await axios.get('/api/google-drive/status');
      setIsConnected(response.data.isConnected);
    } catch (error) {
      console.error('Failed to check status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      // Get authorization URL
      const response = await axios.get('/api/google-drive/connect');
      const authUrl = response.data.authUrl;

      // Open in popup
      const popup = window.open(
        authUrl,
        'Google Drive Connection',
        'width=600,height=700'
      );

      // Listen for popup close
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          checkStatus(); // Refresh status
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('Failed to connect Google Drive');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Drive?')) {
      return;
    }

    try {
      await axios.delete('/api/google-drive/disconnect');
      setIsConnected(false);
      alert('Google Drive disconnected successfully');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      alert('Failed to disconnect Google Drive');
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="google-drive-connect">
      <h3>Google Drive Integration</h3>
      
      {isConnected ? (
        <div>
          <p>✅ Google Drive is connected</p>
          <p>Files will be automatically uploaded to your Google Drive</p>
          <button onClick={handleDisconnect} className="btn-danger">
            Disconnect Google Drive
          </button>
        </div>
      ) : (
        <div>
          <p>❌ Google Drive not connected</p>
          <p>Connect once and never login again!</p>
          <button onClick={handleConnect} className="btn-primary">
            🔗 Connect Google Drive
          </button>
        </div>
      )}
    </div>
  );
}
```

### **2. Upload File to Google Drive**

```typescript
// Upload homework submission to student's Google Drive

async function uploadHomeworkToStudentDrive(
  studentId: string,
  file: File
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folderId', 'optional-folder-id');
  formData.append('fileName', `Homework_${Date.now()}.pdf`);

  try {
    const response = await axios.post(
      `/api/google-drive/upload?userId=${studentId}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );

    console.log('Uploaded to student Drive:', response.data.data);
    alert('File uploaded to your Google Drive!');
  } catch (error) {
    if (error.response?.status === 401) {
      alert('Please connect your Google Drive first');
    } else {
      alert('Upload failed: ' + error.message);
    }
  }
}
```

---

## 🔒 Security Best Practices

### **1. Token Encryption** ✅
- Refresh tokens encrypted with AES-256-CBC
- Encryption key stored in environment variables
- Never expose tokens in API responses

### **2. Scope Limitation** ✅
```typescript
// Only request necessary permissions
scope: [
  'https://www.googleapis.com/auth/drive.file', // ONLY files created by app
  // NOT: 'https://www.googleapis.com/auth/drive' // Would give full access
]
```

### **3. Token Validation**
```typescript
// Always validate before use
if (!credentials || credentials.isRevoked || !credentials.isActive) {
  throw new UnauthorizedException('Please reconnect Google Drive');
}
```

### **4. Automatic Refresh**
```typescript
// Token automatically refreshed when expired
if (Date.now() >= credentials.expiresAt.getTime()) {
  await client.refreshAccessToken(); // Seamless refresh
}
```

### **5. Revocation Handling**
```typescript
// Handle revoked tokens gracefully
try {
  await uploadFile();
} catch (error) {
  if (error.code === 'invalid_grant') {
    // Mark as revoked and notify user
    await markTokenAsRevoked(userId);
    throw new UnauthorizedException('Please reconnect Google Drive');
  }
}
```

---

## 📊 Advantages

| Feature | Without Persistent Access | With Persistent Access |
|---------|---------------------------|------------------------|
| **User Login** | Every upload | **ONE TIME ONLY** ✅ |
| **Token Lifespan** | 1 hour | **Forever** (auto-refresh) ✅ |
| **User Experience** | Interrupted | **Seamless** ✅ |
| **Background Uploads** | ❌ Not possible | **✅ Fully automated** |
| **Scheduled Tasks** | ❌ Cannot do | **✅ Cron jobs work** |
| **Bulk Operations** | ❌ Complex | **✅ Simple** |

---

## ✅ YES - Direct Upload to Student's Drive

### **Can You Upload Directly to Student's Google Drive?**

**Answer: YES! 100% Possible!** ✅

When a teacher/admin uploads a file for a student, it goes **DIRECTLY** to that student's personal Google Drive. Here's how:

```
Teacher uploads file → System uses student's refresh token → File appears in student's Google Drive
```

### **How It Works:**

```typescript
// Teacher uploads homework answer for Student A
// Backend code:

const file = req.file; // Teacher's uploaded file
const studentId = "123"; // Student A's ID

// ✅ Upload directly to Student A's Google Drive
await googleDriveUploadService.uploadFile(
  studentId,        // Student A's user ID
  file,             // Teacher's file
  {
    fileName: 'Homework_Answers.pdf',
    description: 'From Teacher'
  }
);

// Result: File is now in Student A's Google Drive
// Student A can see it in their Drive app/website
// Teacher does NOT need Student A's password
// Student A does NOT need to be online
```

### **Privacy & Security:**

| Concern | Solution |
|---------|----------|
| **"Teacher can access my Drive?"** | ❌ NO - Only uploads, cannot read/delete other files |
| **"All students see each other's files?"** | ❌ NO - Each file goes to individual student's Drive |
| **"What if I don't want this?"** | ✅ Student can disconnect anytime or simply not connect |
| **"Can teacher delete my files?"** | ❌ NO - Scoped permission: `drive.file` only |

### **Permission Scope Explanation:**

```typescript
// ✅ SAFE SCOPE - Only files created by this app
scope: 'https://www.googleapis.com/auth/drive.file'

// What this allows:
✅ Upload new files
✅ Read files created by this app
✅ Update files created by this app
✅ Delete files created by this app

// What this DOES NOT allow:
❌ Read student's other files
❌ Delete student's personal documents
❌ Access student's photos/videos
❌ Share student's files
```

---

## 🎓 Real-World Scenarios

### **Scenario 1: Upload to ONE Student**

**Use Case:** Teacher wants to send personalized feedback to a specific student.

```typescript
// API Endpoint: POST /api/homework/submit-feedback

async uploadFeedbackToStudent(
  teacherId: string,
  studentId: string,
  feedbackFile: File
) {
  // 1. Validate teacher has permission
  const hasAccess = await checkTeacherAccess(teacherId, studentId);
  if (!hasAccess) throw new ForbiddenException();

  // 2. Upload directly to student's Google Drive
  const result = await googleDriveUploadService.uploadFile(
    studentId,  // ← Student's Google Drive
    feedbackFile,
    {
      fileName: `Feedback_${studentId}_${Date.now()}.pdf`,
      description: `Feedback from ${teacherName}`,
    }
  );

  // 3. Send notification to student
  await sendNotification(studentId, {
    title: 'New Feedback Available',
    body: 'Teacher uploaded feedback to your Google Drive',
    data: { fileId: result.fileId }
  });

  return {
    success: true,
    message: 'Feedback uploaded to student\'s Google Drive',
    googleDriveLink: result.webViewLink
  };
}
```

**Result:**
- ✅ File appears ONLY in that student's Google Drive
- ✅ Teacher uploads once, student gets it instantly
- ✅ Student can access from Drive app/website
- ✅ Student gets notification

---

### **Scenario 2: Upload to ALL Students in Class**

**Use Case:** Teacher distributes homework answers to entire class.

```typescript
// API Endpoint: POST /api/homework/distribute-answers

async distributeToClass(
  teacherId: string,
  classId: string,
  answerFile: File
) {
  // 1. Get all students in class
  const students = await getStudentsInClass(classId);
  
  // 2. Upload to each student's Google Drive
  const results = [];
  
  for (const student of students) {
    try {
      // Check if student has Google Drive connected
      const isConnected = await googleOAuthService.isConnected(student.userId);
      
      if (!isConnected) {
        results.push({
          studentId: student.userId,
          studentName: student.name,
          status: 'skipped',
          reason: 'Google Drive not connected'
        });
        continue;
      }

      // ✅ Upload to student's Google Drive
      const uploadResult = await googleDriveUploadService.uploadFile(
        student.userId,  // Each student's individual Drive
        answerFile,
        {
          fileName: `Homework_Answers_${classId}.pdf`,
          description: 'Homework answer key from teacher',
        }
      );

      results.push({
        studentId: student.userId,
        studentName: student.name,
        status: 'success',
        googleDriveLink: uploadResult.webViewLink,
        fileId: uploadResult.fileId
      });

      // Send notification
      await sendNotification(student.userId, {
        title: 'New Homework Answers',
        body: 'Answer key uploaded to your Google Drive',
      });

    } catch (error) {
      results.push({
        studentId: student.userId,
        studentName: student.name,
        status: 'failed',
        error: error.message
      });
    }
  }

  return {
    success: true,
    message: `Distributed to ${results.filter(r => r.status === 'success').length} students`,
    details: results
  };
}
```

**Result:**
- ✅ Same file uploaded to ALL students' Drives
- ✅ Each student sees it in THEIR OWN Drive
- ✅ Students with Drive connected get file
- ✅ Students without Drive get skipped (with notification)

---

### **Scenario 3: Selective Upload (Some Students)**

**Use Case:** Upload remedial materials to only students who failed exam.

```typescript
// API Endpoint: POST /api/exam/send-remedial-materials

async uploadRemedialMaterials(
  examId: string,
  passingScore: number,
  materialFile: File
) {
  // 1. Get students who scored below passing
  const failedStudents = await getStudentsBelowScore(examId, passingScore);

  // 2. Upload to each failed student's Drive
  for (const student of failedStudents) {
    await googleDriveUploadService.uploadFile(
      student.userId,  // Only failed students
      materialFile,
      {
        fileName: `Remedial_Materials_${student.subject}.pdf`,
        description: 'Additional study materials',
      }
    );

    // Notify student
    await sendNotification(student.userId, {
      title: 'Remedial Materials Available',
      body: 'Extra study materials uploaded to your Google Drive',
    });
  }

  return {
    success: true,
    message: `Remedial materials sent to ${failedStudents.length} students`
  };
}
```

**Result:**
- ✅ Materials go ONLY to selected students
- ✅ Other students DON'T see these files
- ✅ Privacy maintained

---

## 🔒 Security & Privacy Guarantees

### **1. Isolation - Each Student's Drive is Separate**

```
Teacher uploads file for Student A
  ↓
Goes to Student A's Drive ONLY
  ↓
Student B, C, D cannot see it
```

### **2. Limited Permissions**

```typescript
// When student connects, they grant ONLY:
{
  scope: 'drive.file',  // Only files created BY THIS APP
  access: 'upload',     // Can create files
  access: 'read',       // Can read ONLY files created by app
  access: 'update',     // Can update ONLY files created by app
}

// Teacher/System CANNOT:
❌ See student's personal photos
❌ Read student's documents
❌ Delete student's other files
❌ Share student's files with others
❌ Access student's email
```

### **3. Student Control**

```typescript
// Students can:
✅ Disconnect anytime → System loses access
✅ Delete app files from Drive → System cannot recreate
✅ Revoke permissions in Google Account settings
✅ Choose not to connect → System cannot force
```

### **4. Audit Trail**

```typescript
// Every upload is logged:
{
  uploadedBy: 'teacherId',
  uploadedTo: 'studentId',
  fileName: 'Homework_Answers.pdf',
  timestamp: '2026-01-30T10:00:00Z',
  fileId: 'google-drive-file-id',
  success: true
}

// Students can see:
- Who uploaded what
- When it was uploaded
- File size and type
```

---

## 🎯 Complete Flow Diagram

```
┌──────────────┐
│   Teacher    │
│  Uploads     │
│   File       │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│    LMS Backend System        │
│  - Validates teacher access  │
│  - Gets student's refresh    │
│    token from database       │
│  - Requests new access token │
│    from Google (if expired)  │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│    Google Drive API          │
│  - Validates access token    │
│  - Checks permissions        │
│  - Creates file in student's │
│    Google Drive              │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Student's Google Drive      │
│  - File appears instantly    │
│  - Student gets notification │
│  - Can access from any device│
└──────────────────────────────┘
```

---

## 📱 Student Experience

### **What Student Sees:**

1. **First Time (One-Time Setup):**
   ```
   Student logs into LMS
     ↓
   Sees: "Connect Google Drive for automatic file delivery"
     ↓
   Clicks "Connect" button
     ↓
   Google consent screen: "Allow LMS to upload files to your Drive?"
     ↓
   Clicks "Allow"
     ↓
   Done! ✅
   ```

2. **After Connection:**
   ```
   Teacher uploads homework answers
     ↓
   Student gets notification: "New file in your Google Drive"
     ↓
   Student opens Google Drive app
     ↓
   Sees: "Homework_Answers.pdf" in Drive
     ↓
   Can view/download/share as normal Google Drive file
   ```

3. **Student NEVER Needs To:**
   - ❌ Login to Google Drive repeatedly
   - ❌ Accept each file individually
   - ❌ Grant permission multiple times
   - ❌ Be online when teacher uploads

---

## 💡 Best Practices

### **1. Always Check Connection Status**

```typescript
async uploadToStudent(studentId: string, file: File) {
  // ✅ Check if student has connected Drive
  const isConnected = await googleOAuthService.isConnected(studentId);
  
  if (!isConnected) {
    // Fallback: Store in LMS server
    await storeLmsServer(studentId, file);
    
    // Notify student to connect Drive
    await sendNotification(studentId, {
      title: 'Connect Google Drive',
      body: 'Get files automatically delivered to your Drive',
    });
    
    return { status: 'stored_in_lms', message: 'Student has not connected Google Drive' };
  }
  
  // Upload to Drive
  return await googleDriveUploadService.uploadFile(studentId, file);
}
```

### **2. Handle Errors Gracefully**

```typescript
try {
  await googleDriveUploadService.uploadFile(studentId, file);
} catch (error) {
  if (error.message.includes('invalid_grant')) {
    // Token revoked by user
    await markDriveDisconnected(studentId);
    await notifyStudent(studentId, 'Please reconnect Google Drive');
  } else if (error.message.includes('quota')) {
    // Student's Drive is full
    await notifyStudent(studentId, 'Your Google Drive is full');
  } else {
    // Generic error - fallback to LMS storage
    await storeLmsServer(studentId, file);
  }
}
```

### **3. Provide Alternative for Students Without Drive**

```typescript
async distributeFile(classId: string, file: File) {
  const students = await getStudents(classId);
  
  for (const student of students) {
    const hasGoogleDrive = await googleOAuthService.isConnected(student.id);
    
    if (hasGoogleDrive) {
      // ✅ Direct to Google Drive
      await googleDriveUploadService.uploadFile(student.id, file);
    } else {
      // ✅ Store in LMS (backup option)
      await storeLmsServer(student.id, file);
    }
  }
}
```

### **4. Organize Files in Folders**

```typescript
// Create subject-specific folders
const folderId = await googleDriveUploadService.createFolder(
  studentId,
  'LMS - Mathematics'
);

// Upload files to specific folder
await googleDriveUploadService.uploadFile(
  studentId,
  file,
  {
    folderId: folderId,  // Organized!
    fileName: 'Homework_1.pdf'
  }
);
```

---

## 🚀 Usage Examples

```typescript
// Teacher uploads homework answers to all students' Google Drives
async function distributeHomeworkAnswers() {
  const students = await getStudentsInClass(classId);
  const answerFile = await getHomeworkAnswerFile(homeworkId);

  for (const student of students) {
    try {
      // Upload to student's Google Drive (NO LOGIN!)
      await googleDriveUploadService.uploadFile(
        student.userId,
        answerFile,
        {
          fileName: `Homework_${homeworkId}_Answers.pdf`,
          description: 'Homework answer key',
        }
      );
      
      console.log(`✅ Uploaded to ${student.name}'s Drive`);
    } catch (error) {
      console.error(`❌ Failed for ${student.name}:`, error);
    }
  }
}
```

### **Example 2: Exam Results**

```typescript
// Automatically upload exam results to student's Google Drive
async function publishExamResults(examId: string) {
  const results = await getExamResults(examId);

  for (const result of results) {
    const pdfBuffer = await generateResultPDF(result);
    
    // Upload to student's Drive
    await googleDriveUploadService.uploadFile(
      result.studentId,
      {
        buffer: pdfBuffer,
        originalname: `Exam_Result_${result.examId}.pdf`,
        mimetype: 'application/pdf',
      },
      {
        fileName: `${result.examName}_Result.pdf`,
        description: `Exam result for ${result.examName}`,
      }
    );
  }
}
```

### **Example 3: Scheduled Backup**

```typescript
// Cron job: Backup student work daily
@Cron('0 2 * * *') // Every day at 2 AM
async dailyBackup() {
  const users = await getActiveUsers();

  for (const user of users) {
    try {
      const userFiles = await getUserFiles(user.id);
      
      // Upload backup to user's Google Drive
      const zipBuffer = await createZipArchive(userFiles);
      
      await googleDriveUploadService.uploadFile(
        user.id,
        zipBuffer,
        {
          fileName: `Backup_${new Date().toISOString()}.zip`,
        }
      );
      
      console.log(`✅ Backup created for ${user.name}`);
    } catch (error) {
      console.error(`❌ Backup failed for ${user.name}`);
    }
  }
}
```

---

## 🎯 Summary

### **Key Points:**

1. ✅ **One-Time Connection**: User connects Google Drive ONCE
2. ✅ **Persistent Access**: Refresh token never expires (unless revoked)
3. ✅ **Auto-Refresh**: Access token automatically refreshed when expired
4. ✅ **No User Intervention**: Backend uploads files without user login
5. ✅ **Secure**: Tokens encrypted, scoped permissions, revocable
6. ✅ **Scalable**: Handles bulk uploads, scheduled tasks, background jobs

### **User Flow:**

```
1. User clicks "Connect Google Drive" → ONE TIME
2. Grants permission on Google consent screen → ONE TIME
3. System stores refresh token → FOREVER
4. System uploads files anytime → NO LOGIN NEEDED
5. Token auto-refreshes → SEAMLESS
```

This is exactly like how Google Drive desktop app works - connect once, sync forever! 🎉
