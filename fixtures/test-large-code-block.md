# Large Code Block Test

This document contains a large code block that should be split into multiple chunks when it exceeds the character limit.

```typescript
// This is a very long code block that will exceed the 2000 character limit
// and should be split into multiple chunks while preserving the language

interface UserData {
    id: string;
    name: string;
    email: string;
    preferences: {
        theme: 'light' | 'dark';
        notifications: boolean;
        language: string;
    };
    profile: {
        avatar: string;
        bio: string;
        location: string;
        website?: string;
    };
    settings: {
        privacy: {
            showEmail: boolean;
            showProfile: boolean;
        };
        security: {
            twoFactorEnabled: boolean;
            lastPasswordChange: Date;
        };
    };
}

function processUserData(userData: UserData): ProcessedUser {
    // Validate user data first
    if (!userData.id || !userData.name || !userData.email) {
        throw new Error('Invalid user data: missing required fields');
    }
    
    // Process email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
        throw new Error('Invalid email format');
    }
    
    // Create processed user object
    const processedUser: ProcessedUser = {
        id: userData.id,
        displayName: userData.name,
        email: userData.email.toLowerCase(),
        hasCustomAvatar: userData.profile.avatar !== '/default-avatar.png',
        isPublicProfile: userData.settings.privacy.showProfile,
        notificationsEnabled: userData.preferences.notifications,
        securityLevel: userData.settings.security.twoFactorEnabled ? 'high' : 'standard',
        lastActive: new Date(),
        metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0'
        }
    };
    
    // Additional processing for premium users
    if (userData.profile.website) {
        processedUser.externalLinks = {
            website: userData.profile.website,
            verified: false
        };
    }
    
    // Log the processing for audit purposes
    console.log(`Processed user data for user ${userData.id}`);
    
    return processedUser;
}

// Helper function for user validation
function validateUserPermissions(user: ProcessedUser, action: string): boolean {
    const permissionMap = {
        'edit_profile': user.securityLevel === 'high',
        'delete_account': user.securityLevel === 'high',
        'view_analytics': user.isPublicProfile,
        'export_data': true
    };
    
    return permissionMap[action] || false;
}

// Export the processing function
export { processUserData, validateUserPermissions };
```

Some text after the large code block.