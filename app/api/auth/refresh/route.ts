import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { verifyRefreshToken, generateCSRFToken } from '@/lib/advanced-security'
import connectDB from '@/lib/db'
import { User } from '@/lib/models'
import { updateSessionActivity } from '@/lib/session-manager'
import { refreshAccessToken } from '@/lib/token-rotation'
import { rateLimit } from '@/lib/rate-limit'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'

// POST - Refresh access token using refresh token (ENHANCED WITH TOKEN ROTATION)
export async function POST(request: NextRequest) {
  const clientIp = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown'

  // Rate limiting - 10 refresh attempts per minute
  const rateLimitCheck = rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many token refresh attempts'
  })
  
  const rateLimitResult = await rateLimitCheck(clientIp)
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { 
        error: rateLimitResult.message,
        retryAfter: rateLimitResult.resetTime
      },
      { status: 429 }
    )
  }

  try {
    await connectDB()
    
    // Get refresh token from cookie or body
    const body = await request.json().catch(() => ({}))
    const refreshToken = body.refreshToken || 
                        request.cookies.get('refresh-token')?.value
    const fingerprint = body.fingerprint
    
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token not found' },
        { status: 401 }
      )
    }
    
    // Try new token rotation system first
    if (fingerprint) {
      const newTokenPair = await refreshAccessToken(refreshToken, fingerprint)
      
      if (newTokenPair) {
        // Update session activity
        await updateSessionActivity(newTokenPair.accessToken)
        
        const response = NextResponse.json({
          success: true,
          message: 'Token refreshed successfully (rotation)',
          accessToken: newTokenPair.accessToken,
          refreshToken: newTokenPair.refreshToken,
          expiresIn: newTokenPair.expiresIn,
          tokenType: newTokenPair.tokenType
        })
        
        // Set cookies
        response.cookies.set('auth-token', newTokenPair.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
          maxAge: 300, // 5 minutes
          path: '/',
        })
        
        response.cookies.set('refresh-token', newTokenPair.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: '/',
        })
        
        return response
      }
    }
    
    // Fallback to old system
    const payload = verifyRefreshToken(refreshToken)
    
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }
    
    // Get user from database
    const user = await User.findById(payload.userId).select('-password')
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }
    
    // Generate new access token
    const sessionId = request.cookies.get('session-id')?.value || ''
    const newAccessToken = jwt.sign(
      {
        userId: (user as any)._id,
        email: user.email,
        role: user.role,
        sessionId,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    
    // Generate new CSRF token
    const newCSRFToken = generateCSRFToken(sessionId)
    
    // Update session activity
    const oldToken = request.cookies.get('auth-token')?.value
    if (oldToken) {
      await updateSessionActivity(oldToken)
    }
    
    // Return new tokens
    const response = NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newAccessToken,
      csrfToken: newCSRFToken,
    })
    
    // Set new access token cookie
    response.cookies.set('auth-token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    
    return response
    
  } catch (error: any) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: 'Token refresh failed', details: error.message },
      { status: 500 }
    )
  }
}
