    # Push Notification Frontend Integration Guide - PART 3

    ## Complete Guide for Suraksha LMS Push Notifications

    **Part 3 of 3: Admin Features, Real-time & Reference**

    This part covers:
    - Admin/Teacher: Create Notifications
    - Real-time Notification Handling
    - Complete API Reference
    - Implementation Checklist

    ---

    ## Table of Contents
    1. [Admin/Teacher: Create Notifications](#1-adminteacher-create-notifications)
    2. [Real-time Notification Handling](#2-real-time-notification-handling)
    3. [Complete API Reference](#3-complete-api-reference)
    4. [Implementation Checklist](#4-implementation-checklist)

    ---

    ## 1. Admin/Teacher: Create Notifications

    **Who can access:**
    - **SUPERADMIN**: Can create GLOBAL, INSTITUTE, CLASS, SUBJECT notifications
    - **Institute Admin**: Can create INSTITUTE, CLASS, SUBJECT notifications for their institute
    - **Teacher**: Can create CLASS, SUBJECT notifications for their classes/subjects

    **Location:** After selecting institute, show "Create Notification" button if user is Institute Admin or Teacher.

    ### Task 1.1: Admin Notification Service

    ```typescript
    // src/services/adminNotificationService.ts

    export enum NotificationScope {
    GLOBAL = 'GLOBAL',
    INSTITUTE = 'INSTITUTE',
    CLASS = 'CLASS',
    SUBJECT = 'SUBJECT'
    }

    export enum NotificationTargetUserType {
    ALL = 'ALL',
    STUDENTS = 'STUDENTS',
    PARENTS = 'PARENTS',
    TEACHERS = 'TEACHERS',
    ADMINS = 'ADMINS'
    }

    export enum NotificationPriority {
    LOW = 'LOW',
    NORMAL = 'NORMAL',
    HIGH = 'HIGH',
    URGENT = 'URGENT'
    }

    export interface CreateNotificationPayload {
    title: string;
    body: string;
    imageUrl?: string;
    icon?: string;
    actionUrl?: string;
    dataPayload?: Record<string, string>;
    scope: NotificationScope;
    targetUserTypes: NotificationTargetUserType[];
    instituteId?: string;
    classId?: string;
    subjectId?: string;
    priority?: NotificationPriority;
    collapseKey?: string;
    timeToLive?: number;
    scheduledAt?: string;
    sendImmediately?: boolean;
    }

    export interface NotificationResult {
    id: string;
    title: string;
    scope: NotificationScope;
    status: 'DRAFT' | 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
    recipientCount: number;
    successCount: number;
    failureCount: number;
    createdAt: string;
    sentAt?: string;
    }

    class AdminNotificationService {

    /**
     * Create and send a new push notification
     * 
     * @endpoint POST /push-notifications/admin
     * @access SUPERADMIN, Institute Admin, Teacher
     */
    async createNotification(
        payload: CreateNotificationPayload,
        jwtToken: string
    ): Promise<NotificationResult> {
        const response = await fetch('/api/push-notifications/admin', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
        });

        if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create notification');
        }

        return response.json();
    }

    /**
     * Get all notifications created by admin (for management)
     * 
     * @endpoint GET /push-notifications/admin
     */
    async getAdminNotifications(
        jwtToken: string,
        options?: {
        page?: number;
        limit?: number;
        scope?: NotificationScope;
        status?: string;
        instituteId?: string;
        }
    ): Promise<{
        data: NotificationResult[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        const params = new URLSearchParams();
        if (options?.page) params.append('page', options.page.toString());
        if (options?.limit) params.append('limit', options.limit.toString());
        if (options?.scope) params.append('scope', options.scope);
        if (options?.status) params.append('status', options.status);
        if (options?.instituteId) params.append('instituteId', options.instituteId);

        const response = await fetch(
        `/api/push-notifications/admin?${params.toString()}`,
        {
            headers: {
            'Authorization': `Bearer ${jwtToken}`
            }
        }
        );

        if (!response.ok) {
        throw new Error('Failed to fetch notifications');
        }

        return response.json();
    }

    /**
     * Resend a failed notification
     * 
     * @endpoint POST /push-notifications/admin/:id/resend
     */
    async resendNotification(
        notificationId: string,
        jwtToken: string
    ): Promise<NotificationResult> {
        const response = await fetch(
        `/api/push-notifications/admin/${notificationId}/resend`,
        {
            method: 'POST',
            headers: {
            'Authorization': `Bearer ${jwtToken}`
            }
        }
        );

        if (!response.ok) {
        throw new Error('Failed to resend notification');
        }

        return response.json();
    }

    /**
     * Cancel a scheduled notification
     * 
     * @endpoint PUT /push-notifications/admin/:id/cancel
     */
    async cancelNotification(
        notificationId: string,
        jwtToken: string
    ): Promise<void> {
        const response = await fetch(
        `/api/push-notifications/admin/${notificationId}/cancel`,
        {
            method: 'PUT',
            headers: {
            'Authorization': `Bearer ${jwtToken}`
            }
        }
        );

        if (!response.ok) {
        throw new Error('Failed to cancel notification');
        }
    }

    /**
     * Delete a notification
     * 
     * @endpoint DELETE /push-notifications/admin/:id
     */
    async deleteNotification(
        notificationId: string,
        jwtToken: string
    ): Promise<void> {
        const response = await fetch(
        `/api/push-notifications/admin/${notificationId}`,
        {
            method: 'DELETE',
            headers: {
            'Authorization': `Bearer ${jwtToken}`
            }
        }
        );

        if (!response.ok) {
        throw new Error('Failed to delete notification');
        }
    }
    }

    export const adminNotificationService = new AdminNotificationService();
    ```

    ### Task 1.2: Create Notification Form Component

    ```tsx
    // src/components/notifications/CreateNotificationForm.tsx
    import React, { useState } from 'react';
    import { 
    adminNotificationService,
    NotificationScope,
    NotificationTargetUserType,
    NotificationPriority,
    CreateNotificationPayload
    } from '../../services/adminNotificationService';
    import { useAuth } from '../../hooks/useAuth';
    import { useInstitute } from '../../hooks/useInstitute';

    interface Props {
    onSuccess: () => void;
    onCancel: () => void;
    }

    /**
    * Create Notification Form
    * 
    * Visibility Rules:
    * - SUPERADMIN: Can select any scope (GLOBAL, INSTITUTE, CLASS, SUBJECT)
    * - Institute Admin: Can select INSTITUTE, CLASS, SUBJECT (for their institute)
    * - Teacher: Can select CLASS, SUBJECT (for their classes/subjects)
    */
    export const CreateNotificationForm: React.FC<Props> = ({ onSuccess, onCancel }) => {
    const { jwtToken, user } = useAuth();
    const { selectedInstituteId, classes, subjects } = useInstitute();
    
    const isSuperAdmin = user?.userType === 'SUPERADMIN';
    const isInstituteAdmin = user?.instituteRole === 'ADMIN';
    const isTeacher = user?.instituteRole === 'TEACHER';

    // Form State
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [actionUrl, setActionUrl] = useState('');
    const [scope, setScope] = useState<NotificationScope>(
        isSuperAdmin ? NotificationScope.GLOBAL : NotificationScope.INSTITUTE
    );
    const [targetUserTypes, setTargetUserTypes] = useState<NotificationTargetUserType[]>([
        NotificationTargetUserType.ALL
    ]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [priority, setPriority] = useState<NotificationPriority>(NotificationPriority.NORMAL);
    const [sendImmediately, setSendImmediately] = useState(true);
    const [scheduledAt, setScheduledAt] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Available scopes based on user role
    const getAvailableScopes = (): NotificationScope[] => {
        if (isSuperAdmin) {
        return [
            NotificationScope.GLOBAL,
            NotificationScope.INSTITUTE,
            NotificationScope.CLASS,
            NotificationScope.SUBJECT
        ];
        }
        if (isInstituteAdmin) {
        return [
            NotificationScope.INSTITUTE,
            NotificationScope.CLASS,
            NotificationScope.SUBJECT
        ];
        }
        if (isTeacher) {
        return [
            NotificationScope.CLASS,
            NotificationScope.SUBJECT
        ];
        }
        return [];
    };

    const handleTargetUserTypeChange = (type: NotificationTargetUserType) => {
        if (type === NotificationTargetUserType.ALL) {
        setTargetUserTypes([NotificationTargetUserType.ALL]);
        } else {
        const newTypes = targetUserTypes.filter(t => t !== NotificationTargetUserType.ALL);
        if (newTypes.includes(type)) {
            setTargetUserTypes(newTypes.filter(t => t !== type));
        } else {
            setTargetUserTypes([...newTypes, type]);
        }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
        // Validation
        if (!title.trim()) throw new Error('Title is required');
        if (!body.trim()) throw new Error('Message body is required');
        if (targetUserTypes.length === 0) throw new Error('Select at least one target audience');
        
        if (scope !== NotificationScope.GLOBAL && !selectedInstituteId) {
            throw new Error('Institute must be selected for non-global notifications');
        }
        if (scope === NotificationScope.CLASS && !selectedClassId) {
            throw new Error('Please select a class');
        }
        if (scope === NotificationScope.SUBJECT && !selectedSubjectId) {
            throw new Error('Please select a subject');
        }

        const payload: CreateNotificationPayload = {
            title: title.trim(),
            body: body.trim(),
            scope,
            targetUserTypes,
            priority,
            sendImmediately
        };

        // Optional fields
        if (imageUrl.trim()) payload.imageUrl = imageUrl.trim();
        if (actionUrl.trim()) payload.actionUrl = actionUrl.trim();
        
        // Scope-specific fields
        if (scope !== NotificationScope.GLOBAL) {
            payload.instituteId = selectedInstituteId!;
        }
        if (scope === NotificationScope.CLASS || scope === NotificationScope.SUBJECT) {
            payload.classId = selectedClassId;
        }
        if (scope === NotificationScope.SUBJECT) {
            payload.subjectId = selectedSubjectId;
        }
        
        // Scheduled notifications
        if (!sendImmediately && scheduledAt) {
            payload.scheduledAt = new Date(scheduledAt).toISOString();
            payload.sendImmediately = false;
        }

        await adminNotificationService.createNotification(payload, jwtToken!);
        onSuccess();
        } catch (err: any) {
        setError(err.message || 'Failed to create notification');
        } finally {
        setLoading(false);
        }
    };

    return (
        <div className="create-notification-modal">
        <h2>Create App Notification</h2>
        
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
            {/* Title */}
            <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter notification title"
                maxLength={255}
                required
            />
            <span className="char-count">{title.length}/255</span>
            </div>

            {/* Body */}
            <div className="form-group">
            <label htmlFor="body">Message *</label>
            <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter notification message"
                maxLength={5000}
                rows={4}
                required
            />
            <span className="char-count">{body.length}/5000</span>
            </div>

            {/* Scope */}
            <div className="form-group">
            <label>Notification Scope *</label>
            <select
                value={scope}
                onChange={(e) => setScope(e.target.value as NotificationScope)}
            >
                {getAvailableScopes().map((s) => (
                <option key={s} value={s}>
                    {s === 'GLOBAL' && 'Global (All Users)'}
                    {s === 'INSTITUTE' && 'Institute-wide'}
                    {s === 'CLASS' && 'Specific Class'}
                    {s === 'SUBJECT' && 'Specific Subject'}
                </option>
                ))}
            </select>
            </div>

            {/* Class Selection */}
            {(scope === NotificationScope.CLASS || scope === NotificationScope.SUBJECT) && (
            <div className="form-group">
                <label>Select Class *</label>
                <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                required
                >
                <option value="">-- Select Class --</option>
                {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                    {cls.name}
                    </option>
                ))}
                </select>
            </div>
            )}

            {/* Subject Selection */}
            {scope === NotificationScope.SUBJECT && selectedClassId && (
            <div className="form-group">
                <label>Select Subject *</label>
                <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                required
                >
                <option value="">-- Select Subject --</option>
                {subjects
                    .filter(sub => sub.classId === selectedClassId)
                    .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                        {sub.name}
                    </option>
                    ))}
                </select>
            </div>
            )}

            {/* Target Audience */}
            <div className="form-group">
            <label>Target Audience *</label>
            <div className="checkbox-group">
                {Object.values(NotificationTargetUserType).map((type) => (
                <label key={type} className="checkbox-label">
                    <input
                    type="checkbox"
                    checked={targetUserTypes.includes(type)}
                    onChange={() => handleTargetUserTypeChange(type)}
                    />
                    {type === 'ALL' && 'Everyone'}
                    {type === 'STUDENTS' && 'Students Only'}
                    {type === 'PARENTS' && 'Parents Only'}
                    {type === 'TEACHERS' && 'Teachers Only'}
                    {type === 'ADMINS' && 'Admins Only'}
                </label>
                ))}
            </div>
            </div>

            {/* Priority */}
            <div className="form-group">
            <label>Priority</label>
            <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NotificationPriority)}
            >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
            </select>
            </div>

            {/* Image URL */}
            <div className="form-group">
            <label htmlFor="imageUrl">Image URL (optional)</label>
            <input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
            />
            </div>

            {/* Action URL */}
            <div className="form-group">
            <label htmlFor="actionUrl">Action URL (optional)</label>
            <input
                id="actionUrl"
                type="text"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="/announcements/123 or https://..."
            />
            <small>Where to navigate when notification is clicked</small>
            </div>

            {/* Schedule */}
            <div className="form-group">
            <label className="checkbox-label">
                <input
                type="checkbox"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                />
                Send Immediately
            </label>
            </div>

            {!sendImmediately && (
            <div className="form-group">
                <label htmlFor="scheduledAt">Schedule For</label>
                <input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                required
                />
            </div>
            )}

            {/* Actions */}
            <div className="form-actions">
            <button type="button" onClick={onCancel} disabled={loading}>
                Cancel
            </button>
            <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Sending...' : (sendImmediately ? 'Send Now' : 'Schedule')}
            </button>
            </div>
        </form>
        </div>
    );
    };
    ```

    ---

    ## 2. Real-time Notification Handling

    ### Task 2.1: Foreground Message Handler Hook

    ```tsx
    // src/hooks/usePushNotifications.ts
    import { useEffect, useState, useCallback } from 'react';
    import { pushNotificationService } from '../services/pushNotificationService';
    import { useAuth } from './useAuth';

    interface PushNotificationPayload {
    notification?: {
        title?: string;
        body?: string;
        icon?: string;
        image?: string;
    };
    data?: {
        notificationId?: string;
        actionUrl?: string;
        scope?: string;
        instituteId?: string;
        [key: string]: string | undefined;
    };
    }

    export const usePushNotifications = () => {
    const { jwtToken, user } = useAuth();
    const [latestNotification, setLatestNotification] = useState<PushNotificationPayload | null>(null);
    const [showToast, setShowToast] = useState(false);

    useEffect(() => {
        if (!jwtToken || !user) return;

        // Register FCM token on login
        const registerToken = async () => {
        await pushNotificationService.registerToken(user.id, jwtToken);
        };
        registerToken();

        // Listen for foreground messages
        const unsubscribe = pushNotificationService.onForegroundMessage((payload) => {
        console.log('New notification received:', payload);
        setLatestNotification(payload);
        setShowToast(true);
        
        // Auto-hide toast after 5 seconds
        setTimeout(() => setShowToast(false), 5000);
        });

        return () => {
        unsubscribe();
        };
    }, [jwtToken, user]);

    const dismissToast = useCallback(() => {
        setShowToast(false);
    }, []);

    const handleNotificationClick = useCallback(() => {
        if (latestNotification?.data?.actionUrl) {
        window.location.href = latestNotification.data.actionUrl;
        }
        dismissToast();
    }, [latestNotification, dismissToast]);

    return {
        latestNotification,
        showToast,
        dismissToast,
        handleNotificationClick
    };
    };
    ```

    ### Task 2.2: Notification Toast Component

    ```tsx
    // src/components/notifications/NotificationToast.tsx
    import React from 'react';
    import { usePushNotifications } from '../../hooks/usePushNotifications';

    export const NotificationToast: React.FC = () => {
    const { latestNotification, showToast, dismissToast, handleNotificationClick } = usePushNotifications();

    if (!showToast || !latestNotification) return null;

    return (
        <div className="notification-toast" onClick={handleNotificationClick}>
        <div className="toast-content">
            {latestNotification.notification?.icon && (
            <img 
                src={latestNotification.notification.icon} 
                alt="" 
                className="toast-icon"
            />
            )}
            <div className="toast-text">
            <div className="toast-title">
                {latestNotification.notification?.title}
            </div>
            <div className="toast-body">
                {latestNotification.notification?.body}
            </div>
            </div>
            <button 
            className="toast-close" 
            onClick={(e) => { e.stopPropagation(); dismissToast(); }}
            >
            ×
            </button>
        </div>
        </div>
    );
    };
    ```

    ### Task 2.3: Add Toast to App Root

    ```tsx
    // src/App.tsx
    import { NotificationToast } from './components/notifications/NotificationToast';

    function App() {
    return (
        <AuthProvider>
        <InstituteProvider>
            <div className="app">
            {/* Your app content */}
            <Router>
                {/* Routes */}
            </Router>
            
            {/* Global Notification Toast */}
            <NotificationToast />
            </div>
        </InstituteProvider>
        </AuthProvider>
    );
    }
    ```

    ---

    ## 3. Complete API Reference

    ### FCM Token Management
    | Method | Endpoint | Description | Access |
    |--------|----------|-------------|--------|
    | POST | `/users/fcm-tokens` | Register FCM token | All authenticated users |
    | GET | `/users/fcm-tokens/user/:userId` | Get user's tokens | All authenticated users |
    | DELETE | `/users/fcm-tokens/:id` | Delete token (logout) | All authenticated users |

    ### User Notification Endpoints
    | Method | Endpoint | Description | Access |
    |--------|----------|-------------|--------|
    | GET | `/push-notifications/system` | Get global notifications | All authenticated users |
    | GET | `/push-notifications/system/unread-count` | Get global unread count | All authenticated users |
    | GET | `/push-notifications/institute/:id` | Get institute notifications | Institute members |
    | GET | `/push-notifications/institute/:id/unread-count` | Get institute unread count | Institute members |
    | POST | `/push-notifications/:id/read` | Mark as read | All authenticated users |
    | POST | `/push-notifications/mark-read` | Mark multiple as read | All authenticated users |
    | POST | `/push-notifications/institute/:id/mark-all-read` | Mark all as read | Institute members |

    ### Admin Notification Endpoints
    | Method | Endpoint | Description | Access |
    |--------|----------|-------------|--------|
    | POST | `/push-notifications/admin` | Create notification | SUPERADMIN, Admin, Teacher |
    | GET | `/push-notifications/admin` | List admin notifications | SUPERADMIN, Admin, Teacher |
    | GET | `/push-notifications/admin/:id` | Get notification details | SUPERADMIN, Admin, Teacher |
    | POST | `/push-notifications/admin/:id/send` | Send notification | SUPERADMIN, Admin, Teacher |
    | POST | `/push-notifications/admin/:id/resend` | Resend failed notification | SUPERADMIN, Admin, Teacher |
    | PUT | `/push-notifications/admin/:id/cancel` | Cancel scheduled | SUPERADMIN, Admin, Teacher |
    | DELETE | `/push-notifications/admin/:id` | Delete notification | SUPERADMIN, Admin, Teacher |

    ---

    ## 4. Implementation Checklist

    ### Setup
    - [ ] Install Firebase SDK (`npm install firebase`)
    - [ ] Create Firebase configuration file
    - [ ] Get VAPID key from Firebase Console
    - [ ] Create Service Worker file
    - [ ] Register Service Worker

    ### User Flow
    - [ ] Implement FCM token registration on login
    - [ ] Implement FCM token deletion on logout
    - [ ] Create System Notifications component (before institute selection)
    - [ ] Create Institute Notifications component (after institute selection)
    - [ ] Implement mark as read functionality
    - [ ] Implement pagination
    - [ ] Show unread count badge in header

    ### Admin Flow
    - [ ] Create "Create Notification" button (conditional on user role)
    - [ ] Create notification form with scope selection
    - [ ] Implement class/subject selection for targeted notifications
    - [ ] Implement schedule/send immediately toggle
    - [ ] Create notification management page (list, resend, cancel, delete)

    ### Real-time
    - [ ] Implement foreground message handler
    - [ ] Create notification toast component
    - [ ] Handle notification click navigation

    ---

    ## Need Help?

    Contact the backend team for:
    - VAPID key issues
    - FCM token registration failures
    - Permission denied errors
    - API authentication issues

    ---

    **End of Part 3 - Push Notification Guide Complete**
