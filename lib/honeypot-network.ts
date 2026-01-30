// Honeypot Network - Decoy APIs and Trap Routes
// Fake endpoints that only bots would access

import { NextRequest, NextResponse } from 'next/server'
import { logHoneypotEventToFile, blockIPToFile, logSecurityEventToFile } from './file-logger'
import { createSecurityAlert } from './security-alerts'

export type HoneypotInteractionLevel = 'low' | 'medium' | 'high'
export type HoneypotPurpose = 'production' | 'research'
export type HoneypotCategory = 'malware' | 'spam' | 'database' | 'spider' | 'credential' | 'admin' | 'api' | 'config'

export interface HoneypotEndpoint {
  path: string
  method: string
  description: string
  trapType: 'admin' | 'api' | 'credential' | 'data' | 'config'
  // Enhanced honeypot classification
  interactionLevel: HoneypotInteractionLevel
  purpose: HoneypotPurpose
  category: HoneypotCategory
  threatTypes: string[]
}

// List of honeypot trap endpoints with enhanced classification
export const HONEYPOT_ENDPOINTS: HoneypotEndpoint[] = [
  // Admin traps - High interaction, production
  { 
    path: '/api/admin/users/all', 
    method: 'GET', 
    description: 'Fake admin user list', 
    trapType: 'admin',
    interactionLevel: 'high',
    purpose: 'production',
    category: 'admin',
    threatTypes: ['unauthorized_access', 'privilege_escalation', 'data_exfiltration']
  },
  { 
    path: '/api/admin/config', 
    method: 'GET', 
    description: 'Fake config endpoint', 
    trapType: 'config',
    interactionLevel: 'medium',
    purpose: 'production',
    category: 'config',
    threatTypes: ['configuration_disclosure', 'reconnaissance']
  },
  { 
    path: '/api/admin/debug', 
    method: 'GET', 
    description: 'Fake debug endpoint', 
    trapType: 'admin',
    interactionLevel: 'medium',
    purpose: 'production',
    category: 'admin',
    threatTypes: ['information_disclosure', 'debug_exploitation']
  },
  { 
    path: '/api/admin/logs', 
    method: 'GET', 
    description: 'Fake logs endpoint', 
    trapType: 'admin',
    interactionLevel: 'high',
    purpose: 'research',
    category: 'admin',
    threatTypes: ['log_tampering', 'forensic_evasion']
  },
  
  // Credential traps - High interaction
  { 
    path: '/api/auth/admin', 
    method: 'POST', 
    description: 'Fake admin login', 
    trapType: 'credential',
    interactionLevel: 'high',
    purpose: 'production',
    category: 'credential',
    threatTypes: ['credential_stuffing', 'brute_force', 'phishing']
  },
  { 
    path: '/api/user/password', 
    method: 'GET', 
    description: 'Fake password endpoint', 
    trapType: 'credential',
    interactionLevel: 'high',
    purpose: 'production',
    category: 'credential',
    threatTypes: ['password_theft', 'credential_harvesting']
  },
  { 
    path: '/api/auth/token', 
    method: 'GET', 
    description: 'Fake token endpoint', 
    trapType: 'credential',
    interactionLevel: 'medium',
    purpose: 'production',
    category: 'credential',
    threatTypes: ['session_hijacking', 'token_theft']
  },
  
  // Database traps - High interaction
  { 
    path: '/api/data/export-all', 
    method: 'GET', 
    description: 'Fake bulk export', 
    trapType: 'data',
    interactionLevel: 'high',
    purpose: 'production',
    category: 'database',
    threatTypes: ['sql_injection', 'data_exfiltration', 'mass_download']
  },
  { 
    path: '/api/patients/all', 
    method: 'GET', 
    description: 'Fake patient list', 
    trapType: 'data',
    interactionLevel: 'high',
    purpose: 'production',
    category: 'database',
    threatTypes: ['hipaa_violation', 'patient_data_theft']
  },
  { 
    path: '/api/records/dump', 
    method: 'GET', 
    description: 'Fake database dump', 
    trapType: 'data',
    interactionLevel: 'high',
    purpose: 'research',
    category: 'database',
    threatTypes: ['database_dumping', 'sql_injection']
  },
  
  // Spider/Bot traps - Low interaction
  { 
    path: '/.env', 
    method: 'GET', 
    description: 'Fake env file', 
    trapType: 'config',
    interactionLevel: 'low',
    purpose: 'production',
    category: 'spider',
    threatTypes: ['web_crawler', 'secret_scanning', 'config_theft']
  },
  { 
    path: '/api/debug/sql', 
    method: 'GET', 
    description: 'Fake SQL debug', 
    trapType: 'config',
    interactionLevel: 'medium',
    purpose: 'research',
    category: 'database',
    threatTypes: ['sql_injection', 'query_exploitation']
  },
  { 
    path: '/api/health/detailed', 
    method: 'GET', 
    description: 'Fake detailed health', 
    trapType: 'config',
    interactionLevel: 'low',
    purpose: 'production',
    category: 'spider',
    threatTypes: ['service_enumeration', 'reconnaissance']
  },
]

/**
 * Generate fake but convincing data for honeypot responses
 */
export function generateHoneypotData(trapType: string): any {
  switch (trapType) {
    case 'admin':
      return {
        users: [
          { id: 1, email: 'admin@fake.com', role: 'admin', password: 'hashed_fake_pass_123' },
          { id: 2, email: 'user@fake.com', role: 'user', password: 'hashed_fake_pass_456' }
        ],
        total: 2,
        timestamp: new Date().toISOString()
      }
    
    case 'credential':
      return {
        token: 'fake_jwt_token_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        refresh_token: 'fake_refresh_token_abcdef123456',
        expires_in: 3600,
        admin: true
      }
    
    case 'data':
      return {
        records: [
          { id: 1, name: 'Fake Patient', ssn: '123-45-6789', diagnosis: 'Fake Data' },
          { id: 2, name: 'Decoy User', ssn: '987-65-4321', diagnosis: 'Honeypot' }
        ],
        total: 2,
        exported_at: new Date().toISOString()
      }
    
    case 'config':
      return {
        database: 'mongodb://fake:fake@localhost:27017/fake',
        jwt_secret: 'fake_secret_key_do_not_use',
        api_keys: ['fake_key_1', 'fake_key_2'],
        debug: true,
        environment: 'production'
      }
    
    default:
      return { message: 'Fake API Response', data: null }
  }
}

/**
 * Log honeypot trap trigger
 */
export async function logHoneypotTrap(
  request: NextRequest,
  endpoint: string,
  honeypotEndpoint: HoneypotEndpoint
): Promise<void> {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown'
  const userAgent = request.headers.get('user-agent') || 'Unknown'
  
  const trapData = {
    timestamp: new Date().toISOString(),
    endpoint,
    trapType: honeypotEndpoint.trapType,
    interactionLevel: honeypotEndpoint.interactionLevel,
    purpose: honeypotEndpoint.purpose,
    category: honeypotEndpoint.category,
    threatTypes: honeypotEndpoint.threatTypes,
    method: request.method,
    ip,
    userAgent,
    severity: 'critical',
    threat: `${honeypotEndpoint.category.toUpperCase()} honeypot: ${honeypotEndpoint.description}`
  }

  // Log to file system
  try {
    console.log('🍯 HONEYPOT TRIGGERED!', {
      endpoint,
      category: honeypotEndpoint.category,
      interactionLevel: honeypotEndpoint.interactionLevel,
      threatTypes: honeypotEndpoint.threatTypes.join(', '),
      ipAddress: ip,
      userAgent: userAgent.substring(0, 50),
      timestamp: trapData.timestamp
    })
    
    await logHoneypotEventToFile({
      timestamp: trapData.timestamp,
      ipAddress: ip,
      userAgent,
      honeypotData: {
        endpoint,
        trapType: honeypotEndpoint.trapType,
        interactionLevel: honeypotEndpoint.interactionLevel,
        purpose: honeypotEndpoint.purpose,
        category: honeypotEndpoint.category,
        threatTypes: honeypotEndpoint.threatTypes,
        method: request.method,
        description: honeypotEndpoint.description
      },
      severity: 'critical',
      blocked: true
    })
    
    // Also log as security event with honeypot details
    await logSecurityEventToFile({
      id: `honeypot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: trapData.timestamp,
      type: 'honeypot_triggered',
      severity: 'critical',
      ipAddress: ip,
      userAgent,
      details: {
        endpoint,
        trapType: honeypotEndpoint.trapType,
        honeypotCategory: honeypotEndpoint.category,
        interactionLevel: honeypotEndpoint.interactionLevel,
        purpose: honeypotEndpoint.purpose,
        threatTypes: honeypotEndpoint.threatTypes,
        method: request.method,
        reason: `${honeypotEndpoint.category.toUpperCase()} honeypot triggered: ${honeypotEndpoint.description}`,
        threat: `Detected ${honeypotEndpoint.threatTypes.join(', ')} attack patterns`
      }
    })
    
    // Block the IP address
    await blockIPToFile(ip)
    
    // Create MongoDB security alert with full honeypot classification
    try {
      await createSecurityAlert({
        email: 'honeypot@system.local',
        alertType: 'honeypot_trigger',
        severity: 'critical',
        ipAddress: ip,
        userAgent,
        details: {
          reason: `${honeypotEndpoint.category.toUpperCase()} honeypot triggered: ${honeypotEndpoint.description}`,
          action: `Accessed ${endpoint}`,
          threat: `Detected ${honeypotEndpoint.threatTypes.join(', ')} attack patterns`,
          endpoint,
          method: request.method
        },
        honeypot: {
          interactionLevel: honeypotEndpoint.interactionLevel,
          purpose: honeypotEndpoint.purpose,
          category: honeypotEndpoint.category,
          threatTypes: honeypotEndpoint.threatTypes,
          trapPath: endpoint
        }
      })
      console.log('✅ MongoDB security alert created with honeypot classification')
    } catch (dbError) {
      console.error('⚠️ Failed to create MongoDB security alert:', dbError)
    }
    
    console.log('✅ Honeypot event logged successfully with classification:', {
      category: honeypotEndpoint.category,
      interactionLevel: honeypotEndpoint.interactionLevel
    })
  } catch (error) {
    console.error('❌ Failed to log honeypot:', error)
  }

  // Log to security events API
  try {
    await fetch('/api/security-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'honeypot_triggered',
        severity: 'critical',
        ipAddress: ip,
        location: {},
        deviceInfo: { userAgent, platform: 'Unknown', language: 'Unknown' },
        behaviorMetrics: {},
        sessionData: { sessionId: 'honeypot', pageViews: 1, referrer: '' },
        details: `🍯 ${honeypotEndpoint.category.toUpperCase()} honeypot: ${honeypotEndpoint.description} (${honeypotEndpoint.interactionLevel} interaction)`,
        honeypotData: {
          interactionLevel: honeypotEndpoint.interactionLevel,
          purpose: honeypotEndpoint.purpose,
          category: honeypotEndpoint.category,
          threatTypes: honeypotEndpoint.threatTypes,
          trapPath: endpoint
        }
      })
    })
  } catch (error) {
    console.error('Failed to log honeypot trap:', error)
  }

  // Also store locally
  try {
    const existingTraps = JSON.parse(localStorage.getItem('honeypot_traps') || '[]')
    existingTraps.push(trapData)
    localStorage.setItem('honeypot_traps', JSON.stringify(existingTraps.slice(-100)))
  } catch (e) {
    // Server-side or storage error
  }

  // Log to console (visible in admin logs)
  console.warn('🍯 HONEYPOT TRAP TRIGGERED:', trapData)
}

/**
 * Check if request path is a honeypot trap
 */
export function isHoneypotPath(pathname: string): HoneypotEndpoint | null {
  return HONEYPOT_ENDPOINTS.find(trap => pathname.includes(trap.path)) || null
}

/**
 * Generate honeypot response
 */
export async function generateHoneypotResponse(
  request: NextRequest,
  trap: HoneypotEndpoint
): Promise<NextResponse> {
  // Log the trap trigger
  await logHoneypotTrap(request, trap.path, trap.trapType)

  // Generate fake data
  const fakeData = generateHoneypotData(trap.trapType)

  // Add realistic headers to make it look legitimate
  const response = NextResponse.json(fakeData, { status: 200 })
  
  response.headers.set('X-Powered-By', 'Express')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Server', 'nginx/1.18.0')
  
  // Add artificial delay to waste bot's time
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000))

  return response
}

/**
 * Check for suspicious URL patterns that indicate scanning
 */
export function detectScanning(pathname: string): boolean {
  const scanPatterns = [
    // Common vulnerability scanners
    /\.php$/i,
    /\.asp$/i,
    /\.jsp$/i,
    /phpMyAdmin/i,
    /wp-admin/i,
    /wp-login/i,
    /admin\.php/i,
    /config\.php/i,
    
    // Directory traversal
    /\.\./,
    /%2e%2e/i,
    /\.\.%2f/i,
    
    // SQL injection attempts in URL
    /union.*select/i,
    /concat\(/i,
    /or\s+1\s*=\s*1/i,
    
    // Command injection
    /;.*cat\s+\/etc\/passwd/i,
    /\|\|.*ls/i,
    
    // Common exploit paths
    /\.git/,
    /\.svn/,
    /\.env/,
    /backup/i,
    /dump\.sql/i,
  ]

  return scanPatterns.some(pattern => pattern.test(pathname))
}

/**
 * Generate invisible honeypot links for HTML pages
 */
export function generateHoneypotLinks(): string[] {
  return [
    '<a href="/api/admin/users/all" style="display:none;" aria-hidden="true">Admin Users</a>',
    '<a href="/api/admin/config" style="position:absolute;left:-9999px;" aria-hidden="true">Config</a>',
    '<a href="/.env" style="opacity:0;pointer-events:none;" aria-hidden="true">Environment</a>',
    '<a href="/api/data/export-all" style="visibility:hidden;" aria-hidden="true">Export</a>',
  ]
}

/**
 * Add honeypot meta tags (bots often scan meta tags)
 */
export function generateHoneypotMeta(): string[] {
  return [
    '<meta name="admin-panel" content="/fake-admin">',
    '<meta name="api-endpoint" content="/api/fake-data">',
    '<meta name="debug-mode" content="enabled">',
  ]
}
