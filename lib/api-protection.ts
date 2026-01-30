// API Protection Middleware - Applies action tracking to all API routes
// Automatically blocks users after 15 actions on ANY endpoint within 1 minute

import { NextRequest, NextResponse } from 'next/server'
import { trackAction, getUserIdentifier } from './action-tracker'
import { blockUserByEmail } from './user-blocking'
import { createSecurityAlert } from './security-alerts'
import { logSecurityEventToFile, logUserActivity, blockIPToFile } from './file-logger'

// Whitelist of endpoints that don't count towards action limit
const WHITELIST = [
  '/api/auth/me',
  '/api/test-connection',
  '/api/security-logs'
]

/**
 * Determine honeypot category based on resource path
 */
function getHoneypotCategoryFromPath(pathname: string): {
  category: 'spider' | 'spam' | 'database' | 'credential' | 'admin' | 'api' | 'config' | 'malware'
  threatTypes: string[]
} {
  const path = pathname.toLowerCase()
  
  // Medical/Health Records = Database Category
  if (path.includes('medical-record') || path.includes('health-update') || path.includes('vaccination')) {
    return {
      category: 'database',
      threatTypes: ['data_harvesting', 'unauthorized_access', 'information_gathering']
    }
  }
  
  // Admin endpoints = Admin Category
  if (path.includes('/admin') || path.includes('/security')) {
    return {
      category: 'admin',
      threatTypes: ['privilege_escalation', 'admin_access_attempt', 'unauthorized_control']
    }
  }
  
  // Login/Auth = Credential Category
  if (path.includes('/auth') || path.includes('/login') || path.includes('/register')) {
    return {
      category: 'credential',
      threatTypes: ['credential_stuffing', 'brute_force', 'authentication_bypass']
    }
  }
  
  // Profile/User data = Database Category
  if (path.includes('/profile') || path.includes('/user')) {
    return {
      category: 'database',
      threatTypes: ['personal_data_theft', 'identity_harvesting', 'privacy_violation']
    }
  }
  
  // Appointment/Booking = Spam Category (repeated requests)
  if (path.includes('/appointment')) {
    return {
      category: 'spam',
      threatTypes: ['spam_booking', 'resource_exhaustion', 'service_abuse']
    }
  }
  
  // Export/Download = Malware Category
  if (path.includes('/export') || path.includes('/download')) {
    return {
      category: 'malware',
      threatTypes: ['data_exfiltration', 'mass_download', 'bulk_extraction']
    }
  }
  
  // API endpoints = API Category
  if (path.startsWith('/api/')) {
    return {
      category: 'api',
      threatTypes: ['api_abuse', 'automated_scraping', 'rate_limit_violation']
    }
  }
  
  // Default = Spider (bot/crawler)
  return {
    category: 'spider',
    threatTypes: ['automated_bot', 'web_crawler', 'scanning']
  }
}

/**
 * Protect API route with action tracking
 */
export async function withActionProtection(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  actionName?: string
): Promise<NextResponse> {
  const pathname = new URL(request.url).pathname
  
  // Skip whitelisted endpoints
  if (WHITELIST.some(path => pathname.startsWith(path))) {
    return handler(request)
  }
  
  // Get action name from pathname if not provided
  const action = actionName || `${request.method} ${pathname}`
  
  // Track the action
  const result = await trackAction(request, action)
  
  // Get user info
  const identifier = getUserIdentifier(request)
  const email = identifier.startsWith('user:') ? identifier.replace('user:', '') : undefined
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'Unknown'
  
  // Get honeypot category based on resource
  const resourceClassification = getHoneypotCategoryFromPath(pathname)
  
  // Determine interaction level and severity based on actions remaining
  const actionsUsed = 10 - result.actionsRemaining
  let interactionLevel: 'low' | 'medium' | 'high'
  let severity: 'info' | 'warning' | 'high' | 'critical'
  
  if (actionsUsed <= 3) {
    interactionLevel = 'low'
    severity = 'info'
  } else if (actionsUsed <= 7) {
    interactionLevel = 'medium'
    severity = 'warning'
  } else {
    interactionLevel = 'high'
    severity = 'high'
  }
  
  // If blocked, set to critical
  if (result.shouldBlock) {
    interactionLevel = 'high'
    severity = 'critical'
  }
  
  // Record honeypot data for EVERY action (not just when blocked)
  const { logHoneypotEventToFile } = require('./file-logger')
  await logHoneypotEventToFile({
    timestamp: new Date().toISOString(),
    ipAddress,
    userAgent,
    honeypotData: {
      endpoint: pathname,
      trapType: 'behavioral',
      interactionLevel,
      purpose: 'production',
      category: resourceClassification.category,
      threatTypes: resourceClassification.threatTypes,
      method: request.method,
      description: `${action}: ${actionsUsed}/10 actions used (${result.actionsRemaining} remaining)`
    },
    severity,
    blocked: result.shouldBlock
  })
  
  // Log every action
  await logUserActivity({
    timestamp: new Date().toISOString(),
    email,
    action,
    resource: pathname,
    ipAddress,
    userAgent,
    success: result.allowed,
    details: {
      actionCount: actionsUsed,
      actionsRemaining: result.actionsRemaining,
      blocked: result.shouldBlock,
      honeypotCategory: resourceClassification.category,
      interactionLevel,
      severity
    }
  })
  
  // If should block, take action
  if (result.shouldBlock) {
    // Use resource-based classification if rapid fire, otherwise keep resource classification
    const isRapidFire = result.blockReason?.includes('Rapid fire')
    const finalClassification = isRapidFire ? {
      category: 'spider' as const,
      threatTypes: ['automated_bot', 'rate_limit_abuse', 'rapid_fire_attack', ...resourceClassification.threatTypes]
    } : resourceClassification

    // Create critical security event with correct honeypot classification
    await logSecurityEventToFile({
      id: `action_limit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'rate_limit',
      severity: 'critical',
      ipAddress,
      userAgent,
      details: {
        email,
        reason: result.blockReason || 'Too many actions in short time',
        actionCount: actionsUsed,
        action,
        blockReason: result.blockReason,
        message: result.message,
        honeypotCategory: finalClassification.category,
        interactionLevel: 'high',
        threatTypes: finalClassification.threatTypes.join(', ')
      }
    })
    
    // Block IP
    await blockIPToFile(ipAddress)
    
    // If authenticated user, block by email and create security alerts
    if (email) {
      try {
        await blockUserByEmail({
          email,
          ipAddress,
          reason: result.blockReason || result.message || 'Exceeded action limit (10+ per resource or 20+ in 30s)',
          severity: 'temporary',
          durationMinutes: 15
        })
        
        // Create MongoDB security alert with correct honeypot classification
        await createSecurityAlert({
          email,
          alertType: 'rate_limit_exceeded',
          severity: 'critical',
          ipAddress,
          userAgent,
          details: {
            reason: result.blockReason,
            message: result.message,
            action
          },
          honeypot: {
            interactionLevel: 'high',
            purpose: 'production',
            category: finalClassification.category,
            threatTypes: finalClassification.threatTypes,
            trapPath: pathname
          }
        })
        
        console.log('✅ Security alert created and user blocked')
      } catch (error) {
        console.error('Failed to block user:', error)
      }
    }
    
    console.error('🚨 USER BLOCKED:', {
      email,
      ipAddress,
      reason: result.blockReason || 'Exceeded action limit',
      message: result.message,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json(
      {
        error: 'Account blocked',
        message: 'Your account has been temporarily blocked due to suspicious activity. Please try again in 15 minutes.',
        reason: result.blockReason || 'Too many actions detected',
        blocked: true,
        retryAfter: 15
      },
      { status: 403 }
    )
  }
  
  // If approaching limit, add warning header
  if (result.actionsRemaining <= 3) {
    const response = await handler(request)
    response.headers.set('X-Actions-Remaining', result.actionsRemaining.toString())
    response.headers.set('X-Actions-Warning', `Only ${result.actionsRemaining} actions remaining on this resource`)
    return response
  }
  
  // Allow the request
  return handler(request)
}
