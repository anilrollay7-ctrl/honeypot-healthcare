import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db'
import { User } from '@/lib/models'
import { loginSchema, validateRequest } from '@/lib/validations'
import { authRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { 
  recordLoginAttempt, 
  isAccountLocked, 
  generateCSRFToken, 
  generateSessionId,
  generateRefreshToken,
  sanitizeUserInput
} from '@/lib/advanced-security'
import { createSession } from '@/lib/session-manager'
import { logAudit } from '@/lib/audit-logger'
import { logSecurityEventToFile, blockIPToFile, logUserActivity } from '@/lib/file-logger'
import { createSecurityAlert, shouldBlockEmail } from '@/lib/security-alerts'
import { blockUserByEmail, isEmailBlocked } from '@/lib/user-blocking'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting - strict for login attempts
    const clientId = getClientIdentifier(request)
    const rateLimitResult = await authRateLimit(clientId)
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: rateLimitResult.message },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
          }
        }
      )
    }

    await connectDB()
    
    const body = await request.json()
    
    // Sanitize input to prevent NoSQL injection
    const sanitizedBody = sanitizeUserInput(body)
    
    // Check if account is locked from brute force attempts
    const accountLocked = isAccountLocked(clientId)
    if (accountLocked) {
      return NextResponse.json(
        { error: 'Account temporarily locked due to too many failed login attempts. Please try again in 30 minutes.' },
        { status: 423 } // 423 Locked
      )
    }
    
    // Validate input
    const validation = validateRequest(loginSchema, sanitizedBody)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      )
    }
    
    const { email, password } = validation.data

    // Get client IP and User Agent early
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    
    // Check if email is blocked FIRST - before any authentication attempts
    const blockStatus = await isEmailBlocked(email)
    if (blockStatus.isBlocked) {
      // SILENT LOGGING - Do not reveal block details to user
      console.error('🚫 BLOCKED USER LOGIN ATTEMPT:', {
        email,
        ipAddress: clientIP,
        blockReason: blockStatus.reason,
        severity: blockStatus.severity,
        expiresAt: blockStatus.expiresAt,
        timestamp: new Date().toISOString()
      })
      
      // Log to security events file (SILENT - not visible to user)
      await logSecurityEventToFile({
        id: `blocked_user_attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type: 'blocked_user_attempt',
        severity: 'critical',
        ipAddress: clientIP,
        userAgent,
        details: {
          email,
          reason: 'Login attempt by blocked user',
          blockReason: blockStatus.reason,
          blockSeverity: blockStatus.severity,
          expiresAt: blockStatus.expiresAt?.toISOString()
        }
      })
      
      // Log to user activity (SILENT - internal only)
      await logUserActivity({
        timestamp: new Date().toISOString(),
        email,
        action: 'blocked_login_attempt',
        resource: 'authentication',
        ipAddress: clientIP,
        userAgent,
        success: false,
        details: { 
          reason: 'User is blocked',
          blockReason: blockStatus.reason,
          blockSeverity: blockStatus.severity
        }
      })
      
      // Create security alert (SILENT - internal monitoring)
      await createSecurityAlert({
        email,
        alertType: 'blocked_user_attempt',
        severity: 'critical',
        ipAddress: clientIP,
        userAgent,
        details: {
          reason: 'Blocked user attempted login',
          blockReason: blockStatus.reason,
          blockSeverity: blockStatus.severity,
          expiresAt: blockStatus.expiresAt?.toISOString()
        }
      })
      
      // Return generic error - DO NOT reveal block details to attacker
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      // Record failed attempt
      const attempt = recordLoginAttempt(clientId, false)
      
      // Create security alert with honeypot classification
      await createSecurityAlert({
        email,
        alertType: 'failed_login',
        severity: attempt.attemptsLeft <= 1 ? 'high' : 'medium',
        ipAddress: clientIP,
        userAgent,
        details: {
          attemptCount: 6 - attempt.attemptsLeft,
          reason: 'Login attempt with non-existent email',
          action: 'Failed login attempt'
        },
        honeypot: {
          interactionLevel: attempt.attemptsLeft <= 2 ? 'high' : 'low',
          purpose: 'production',
          category: 'credential',
          threatTypes: ['brute_force', 'credential_stuffing', 'account_enumeration'],
          trapPath: '/api/auth/login'
        }
      })
      
      // Log to honeypot events file
      const { logHoneypotEventToFile } = require('@/lib/file-logger')
      await logHoneypotEventToFile({
        timestamp: new Date().toISOString(),
        ipAddress: clientIP,
        userAgent,
        honeypotData: {
          endpoint: '/api/auth/login',
          trapType: 'credential',
          interactionLevel: attempt.attemptsLeft <= 2 ? 'high' : 'low',
          purpose: 'production',
          category: 'credential',
          threatTypes: ['brute_force', 'credential_stuffing', 'account_enumeration'],
          method: 'POST',
          description: `Failed login attempt: User not found (${6 - attempt.attemptsLeft} attempts)`
        },
        severity: attempt.attemptsLeft <= 1 ? 'critical' : 'medium',
        blocked: attempt.attemptsLeft === 0
      })
      
      // Log to file
      await logSecurityEventToFile({
        id: `failed_auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type: 'failed_auth',
        severity: attempt.attemptsLeft <= 1 ? 'high' : 'medium',
        ipAddress: clientIP,
        userAgent,
        details: {
          email,
          reason: 'User not found',
          attemptsLeft: attempt.attemptsLeft
        }
      })
      
      // Log activity
      await logUserActivity({
        timestamp: new Date().toISOString(),
        email,
        action: 'login_attempt',
        resource: 'authentication',
        ipAddress: clientIP,
        userAgent,
        success: false,
        details: { reason: 'User not found', attemptsLeft: attempt.attemptsLeft }
      })
      
      // Block if too many attempts
      if (attempt.attemptsLeft === 0) {
        await blockIPToFile(clientIP)
        await blockUserByEmail({
          email,
          ipAddress: clientIP,
          reason: 'Too many failed login attempts (5+)',
          severity: 'temporary',
          durationMinutes: 30
        })
      }
      
      return NextResponse.json(
        { 
          error: 'Invalid email or password',
          attemptsLeft: attempt.attemptsLeft
        },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      // Record failed attempt
      const attempt = recordLoginAttempt(clientId, false)
      
      // Create security alert with honeypot classification
      await createSecurityAlert({
        userId: (user as any)._id.toString(),
        email,
        alertType: 'failed_login',
        severity: attempt.attemptsLeft <= 1 ? 'critical' : 'high',
        ipAddress: clientIP,
        userAgent,
        details: {
          attemptCount: 6 - attempt.attemptsLeft,
          reason: 'Invalid password',
          action: 'Failed login attempt'
        },
        honeypot: {
          interactionLevel: attempt.attemptsLeft <= 1 ? 'high' : 'medium',
          purpose: 'production',
          category: 'credential',
          threatTypes: ['password_brute_force', 'credential_cracking', 'unauthorized_access'],
          trapPath: '/api/auth/login'
        }
      })
      
      // Log to honeypot events file
      const { logHoneypotEventToFile: logHoneypot } = require('@/lib/file-logger')
      await logHoneypot({
        timestamp: new Date().toISOString(),
        ipAddress: clientIP,
        userAgent,
        honeypotData: {
          endpoint: '/api/auth/login',
          trapType: 'credential',
          interactionLevel: attempt.attemptsLeft <= 1 ? 'high' : 'medium',
          purpose: 'production',
          category: 'credential',
          threatTypes: ['password_brute_force', 'credential_cracking', 'unauthorized_access'],
          method: 'POST',
          description: `Failed login: Invalid password (${6 - attempt.attemptsLeft} attempts)`
        },
        severity: attempt.attemptsLeft <= 1 ? 'critical' : 'high',
        blocked: attempt.attemptsLeft === 0
      })
      
      // Log failed login audit
      await logAudit({
        userId: (user as any)._id.toString(),
        action: 'login',
        resource: 'authentication',
        details: {
          method: 'POST',
          endpoint: '/api/auth/login',
          success: false,
          reason: 'Invalid password'
        },
        ipAddress: clientIP,
        userAgent,
        complianceCategory: 'authentication',
        severity: 'warning',
      })
      
      // Log to file
      await logSecurityEventToFile({
        id: `failed_auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type: 'failed_auth',
        severity: attempt.attemptsLeft <= 1 ? 'critical' : 'high',
        ipAddress: clientIP,
        userAgent,
        details: {
          userId: (user as any)._id.toString(),
          email,
          reason: 'Invalid password',
          attemptsLeft: attempt.attemptsLeft
        }
      })
      
      // Log activity
      await logUserActivity({
        timestamp: new Date().toISOString(),
        userId: (user as any)._id.toString(),
        email,
        action: 'login_attempt',
        resource: 'authentication',
        ipAddress: clientIP,
        userAgent,
        success: false,
        details: { reason: 'Invalid password', attemptsLeft: attempt.attemptsLeft }
      })
      
      // Block IP and user if too many attempts
      if (attempt.attemptsLeft === 0) {
        await blockIPToFile(clientIP)
        
        // Block user by email
        await blockUserByEmail({
          userId: (user as any)._id.toString(),
          email,
          ipAddress: clientIP,
          reason: 'Too many failed login attempts (5+)',
          severity: 'temporary',
          durationMinutes: 30
        })
        
        // Create account locked alert
        await createSecurityAlert({
          userId: (user as any)._id.toString(),
          email,
          alertType: 'account_locked',
          severity: 'critical',
          ipAddress: clientIP,
          userAgent,
          details: {
            attemptCount: 5,
            reason: 'Account locked due to 5+ failed login attempts',
            action: 'Account temporarily blocked for 30 minutes'
          }
        })
      }
      
      return NextResponse.json(
        { 
          error: 'Invalid email or password',
          attemptsLeft: attempt.attemptsLeft
        },
        { status: 401 }
      )
    }
    
    // Clear failed attempts on successful login
    recordLoginAttempt(clientId, true)

    // Generate session ID
    const sessionId = generateSessionId()
    
    // Generate CSRF token
    const csrfToken = generateCSRFToken(sessionId)
    
    // Generate JWT access token
    const token = jwt.sign(
      { 
        userId: (user as any)._id,
        email: user.email,
        role: user.role,
        sessionId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    // Generate refresh token
    const refreshToken = generateRefreshToken((user as any)._id.toString())
    
    // Create session in database
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    await createSession(
      (user as any)._id.toString(),
      token,
      { userAgent, platform: 'web' },
      clientIP,
      expiresAt
    )
    
    // Log successful login audit
    await logAudit({
      userId: (user as any)._id.toString(),
      action: 'login',
      resource: 'authentication',
      details: {
        method: 'POST',
        endpoint: '/api/auth/login',
        success: true,
        sessionId
      },
      ipAddress: clientIP,
      userAgent,
      complianceCategory: 'authentication',
      severity: 'info',
    })
    
    // Log successful login to file
    await logSecurityEventToFile({
      id: `login_success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'login_attempt',
      severity: 'info',
      ipAddress: clientIP,
      userAgent,
      details: {
        userId: (user as any)._id.toString(),
        email: user.email,
        success: true,
        sessionId
      }
    })
    
    // Log successful activity
    await logUserActivity({
      timestamp: new Date().toISOString(),
      userId: (user as any)._id.toString(),
      email: user.email,
      action: 'login',
      resource: 'authentication',
      ipAddress: clientIP,
      userAgent,
      success: true,
      details: { sessionId, role: user.role }
    })

    // Remove password from response
    const userObject = user.toObject()
    const { password: _, ...userResponse } = userObject

    // Set cookies
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: userResponse._id,
        email: userResponse.email,
        firstName: userResponse.firstName,
        lastName: userResponse.lastName,
        dateOfBirth: userResponse.dateOfBirth,
        gender: userResponse.gender,
        phone: userResponse.phone,
        address: userResponse.address,
        city: userResponse.city,
        state: userResponse.state,
        zipCode: userResponse.zipCode,
        bloodType: userResponse.bloodType,
        emergencyContact: userResponse.emergencyContact,
        registeredDate: userResponse.createdAt
      },
      token,
      refreshToken,
      csrfToken,
      sessionId
    }, {
      headers: {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-CSRF-Token': csrfToken
      }
    })

    // Set auth token cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })
    
    // Set refresh token cookie (longer expiry)
    response.cookies.set('refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/api/auth/refresh'
    })
    
    // Set session ID cookie (for CSRF protection)
    response.cookies.set('session-id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    return response

  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed', details: error.message },
      { status: 500 }
    )
  }
}
