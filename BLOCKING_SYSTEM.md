# User Blocking System - Implementation Guide

## Overview
Permanent user blocking system that prevents blocked users from logging in until the local server run ends.

## Key Features

### 1. **Permanent Blocking**
- Once blocked, user cannot login until server restarts
- Blocks persist in MongoDB `blocked_users` collection
- IP addresses tracked for each blocked user

### 2. **Silent Logging**
When a blocked user attempts to login:
- ✅ **Logs created internally** (security-events.json, user-activities.json, MongoDB)
- ❌ **No details shown to user** - only generic "Invalid email or password"
- 🔒 **Prevents information disclosure** - attacker doesn't know they're blocked

### 3. **Early Detection**
- Blocked status checked **BEFORE authentication**
- No password validation for blocked users
- Prevents unnecessary database queries

### 4. **Duplicate Handling**
- Fixed E11000 duplicate key error
- Uses `findOneAndUpdate` with upsert
- Multiple IPs can be added to same blocked user

## Implementation Details

### Files Modified

#### `lib/user-blocking.ts`
- **Removed unique index** on email field
- **Updated `blockUserByEmail()`** to use upsert pattern
- Prevents duplicate key errors when blocking same email multiple times

#### `app/api/auth/login/route.ts`
- **Early block check** before authentication (line ~70)
- **Silent logging** when blocked user attempts login
- **Generic error message** to prevent information disclosure
- Creates security alert with type `blocked_user_attempt`

## How It Works

### Normal Login Flow
1. Rate limit check
2. **→ Block status check (NEW)**
3. Input validation
4. User lookup
5. Password verification
6. Generate tokens
7. Create session

### Blocked User Attempt Flow
1. Rate limit check
2. **→ Block status check → BLOCKED**
3. **→ Log to security-events.json** (internal)
4. **→ Log to user-activities.json** (internal)
5. **→ Create security alert in MongoDB** (internal)
6. **→ Return generic error** ("Invalid email or password")
7. **→ Attacker has no idea they're blocked**

## Security Logs Created

When blocked user attempts login, the following logs are created:

### 1. Console Log (Server Only)
```
🚫 BLOCKED USER LOGIN ATTEMPT: {
  email: "user@example.com",
  ipAddress: "192.168.1.1",
  blockReason: "Too many failed login attempts",
  severity: "temporary",
  expiresAt: "2026-01-07T10:30:00.000Z"
}
```

### 2. Security Events File
Location: `security-logs/security-events.json`
```json
{
  "id": "blocked_user_attempt_1234567890_abc123",
  "timestamp": "2026-01-07T10:00:00.000Z",
  "type": "blocked_user_attempt",
  "severity": "critical",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "email": "user@example.com",
    "reason": "Login attempt by blocked user",
    "blockReason": "Too many failed login attempts",
    "blockSeverity": "temporary",
    "expiresAt": "2026-01-07T10:30:00.000Z"
  }
}
```

### 3. User Activity Log
Location: `security-logs/user-activities.json`
```json
{
  "timestamp": "2026-01-07T10:00:00.000Z",
  "email": "user@example.com",
  "action": "blocked_login_attempt",
  "resource": "authentication",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "success": false,
  "details": {
    "reason": "User is blocked",
    "blockReason": "Too many failed login attempts",
    "blockSeverity": "temporary"
  }
}
```

### 4. MongoDB Security Alert
Collection: `security_alerts`
```json
{
  "email": "user@example.com",
  "alertType": "blocked_user_attempt",
  "severity": "critical",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "reason": "Blocked user attempted login",
    "blockReason": "Too many failed login attempts",
    "blockSeverity": "temporary",
    "expiresAt": "2026-01-07T10:30:00.000Z"
  },
  "timestamp": "2026-01-07T10:00:00.000Z"
}
```

## User Experience

### What Blocked User Sees
```json
{
  "error": "Invalid email or password"
}
```

**Status Code:** 401 Unauthorized

### What Legitimate User Sees (Wrong Password)
```json
{
  "error": "Invalid email or password",
  "attemptsLeft": 4
}
```

**Status Code:** 401 Unauthorized

## Blocking Triggers

Users get blocked when:
1. **5+ failed login attempts** with wrong password
2. **20+ rapid fire actions** in 30 seconds
3. **7+ actions on same resource** (button/tab)
4. **Manual admin block** (future feature)

## Testing the System

### Test Blocked User Login
1. Open your terminal
2. Try to login with blocked email:
```powershell
$body = @{
  email = "anilrolla123@gmail.com"
  password = "anypassword"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

3. Check logs:
```powershell
# View security events
Get-Content "security-logs\security-events.json" | ConvertFrom-Json | Select-Object -Last 5

# View user activities
Get-Content "security-logs\user-activities.json" | ConvertFrom-Json | Select-Object -Last 5
```

## MongoDB Query Examples

### Find All Blocked Users
```javascript
db.blocked_users.find({ unblocked: false })
```

### Find Blocked User by Email
```javascript
db.blocked_users.findOne({ 
  email: "anilrolla123@gmail.com",
  unblocked: false 
})
```

### Check Blocked Login Attempts
```javascript
db.security_alerts.find({ 
  alertType: "blocked_user_attempt" 
}).sort({ timestamp: -1 })
```

### Manually Unblock User (For Testing)
```javascript
db.blocked_users.updateOne(
  { email: "anilrolla123@gmail.com" },
  { $set: { unblocked: true, unblockedAt: new Date() } }
)
```

## Security Benefits

1. ✅ **No information disclosure** - attackers don't know they're blocked
2. ✅ **Permanent blocking** - can't bypass by clearing cookies
3. ✅ **IP tracking** - monitors all IPs used by blocked user
4. ✅ **Comprehensive logging** - full audit trail of blocked attempts
5. ✅ **Early detection** - blocks before any authentication logic runs
6. ✅ **No duplicate errors** - gracefully handles multiple block attempts

## Dashboard Display

The security dashboard at `/security-dashboard.html` shows:
- Recent security alerts including `blocked_user_attempt`
- Blocked user statistics
- Timeline of blocked login attempts

## Next Steps

To view blocked users in dashboard:
1. Navigate to `http://localhost:3000/dashboard`
2. View security alerts section
3. Filter by type: "blocked_user_attempt"
4. See all blocked login attempts with timestamps

---

**Status:** ✅ Implemented and Running
**Last Updated:** January 7, 2026
