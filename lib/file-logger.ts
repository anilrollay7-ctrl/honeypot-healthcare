// File-based Security Logger
// Writes security events to JSON files in real-time

import { promises as fs } from 'fs'
import path from 'path'

const SECURITY_LOGS_DIR = path.join(process.cwd(), 'security-logs')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_EVENTS_IN_MEMORY = 100

interface SecurityEventLog {
  id: string
  timestamp: string
  type: string
  severity: string
  ipAddress: string
  userAgent?: string
  details: any
}

interface HoneypotEventLog {
  timestamp: string
  ipAddress: string
  userAgent?: string
  honeypotData: any
  severity: string
  blocked: boolean
}

interface BlockedIPLog {
  ip: string
  timestamp: string
  reason: string
  threatLevel: string
}

interface UserActivityLog {
  timestamp: string
  userId?: string
  email?: string
  action: string
  resource: string
  ipAddress: string
  userAgent?: string
  success: boolean
  details: any
}

// In-memory buffers for batch writing
const securityEventsBuffer: SecurityEventLog[] = []
const honeypotEventsBuffer: HoneypotEventLog[] = []
const blockedIPsSet = new Set<string>()
const userActivitiesBuffer: UserActivityLog[] = []

let writeTimer: NodeJS.Timeout | null = null

/**
 * Ensure security logs directory exists and initialize empty files
 */
async function ensureLogsDirectory(): Promise<void> {
  try {
    await fs.mkdir(SECURITY_LOGS_DIR, { recursive: true })
    
    // Initialize empty log files if they don't exist
    const logFiles = [
      { name: 'security-events.json', data: { exportDate: new Date().toISOString(), totalEvents: 0, events: [] } },
      { name: 'honeypot-events.json', data: { exportDate: new Date().toISOString(), totalHoneypotTriggers: 0, events: [] } },
      { name: 'blocked-ips.json', data: { exportDate: new Date().toISOString(), totalBlocked: 0, ips: [] } },
      { name: 'threat-analysis.json', data: { exportDate: new Date().toISOString(), period: 'Real-time', summary: {}, recommendations: [] } },
      { name: 'user-activities.json', data: { exportDate: new Date().toISOString(), totalActivities: 0, activities: [] } }
    ]
    
    for (const logFile of logFiles) {
      const filePath = path.join(SECURITY_LOGS_DIR, logFile.name)
      try {
        await fs.access(filePath)
      } catch {
        // File doesn't exist, create it
        await fs.writeFile(filePath, JSON.stringify(logFile.data, null, 2), 'utf-8')
        console.log(`📝 Created ${logFile.name}`)
      }
    }
  } catch (error) {
    console.error('Failed to create security-logs directory:', error)
  }
}

/**
 * Read existing log file
 */
async function readLogFile<T>(filename: string): Promise<T | null> {
  try {
    const filePath = path.join(SECURITY_LOGS_DIR, filename)
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    // File doesn't exist or is invalid, return null
    return null
  }
}

/**
 * Write log file
 */
async function writeLogFile(filename: string, data: any): Promise<void> {
  try {
    await ensureLogsDirectory()
    const filePath = path.join(SECURITY_LOGS_DIR, filename)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error(`Failed to write ${filename}:`, error)
  }
}

/**
 * Flush buffers to disk
 */
async function flushBuffers(): Promise<void> {
  if (securityEventsBuffer.length === 0 && honeypotEventsBuffer.length === 0 && 
      blockedIPsSet.size === 0 && userActivitiesBuffer.length === 0) {
    return
  }

  try {
    // Write security events
    if (securityEventsBuffer.length > 0) {
      const existing = await readLogFile<any>('security-events.json')
      const events = existing?.events || []
      
      const newData = {
        exportDate: new Date().toISOString(),
        totalEvents: events.length + securityEventsBuffer.length,
        events: [...events, ...securityEventsBuffer].slice(-1000) // Keep last 1000
      }
      
      await writeLogFile('security-events.json', newData)
      console.log(`✅ Logged ${securityEventsBuffer.length} security events`)
      securityEventsBuffer.length = 0
    }

    // Write honeypot events
    if (honeypotEventsBuffer.length > 0) {
      const existing = await readLogFile<any>('honeypot-events.json')
      const events = existing?.events || []
      
      const newData = {
        exportDate: new Date().toISOString(),
        totalHoneypotTriggers: events.length + honeypotEventsBuffer.length,
        events: [...events, ...honeypotEventsBuffer].slice(-500) // Keep last 500
      }
      
      await writeLogFile('honeypot-events.json', newData)
      console.log(`✅ Logged ${honeypotEventsBuffer.length} honeypot events`)
      honeypotEventsBuffer.length = 0
    }

    // Write blocked IPs
    if (blockedIPsSet.size > 0) {
      const existing = await readLogFile<any>('blocked-ips.json')
      const existingIPs = new Set(existing?.ips?.map((item: any) => item.ip) || [])
      
      const newIPs = Array.from(blockedIPsSet).map(ip => ({
        ip,
        timestamp: new Date().toISOString(),
        reason: 'Security threat detected',
        threatLevel: 'high'
      }))
      
      const allIPs = [
        ...(existing?.ips || []),
        ...newIPs.filter(item => !existingIPs.has(item.ip))
      ]
      
      const newData = {
        exportDate: new Date().toISOString(),
        totalBlocked: allIPs.length,
        ips: allIPs
      }
      
      await writeLogFile('blocked-ips.json', newData)
      console.log(`✅ Blocked ${newIPs.length} new IPs`)
      blockedIPsSet.clear()
    }
    
    // Write user activities
    if (userActivitiesBuffer.length > 0) {
      const existing = await readLogFile<any>('user-activities.json')
      const activities = existing?.activities || []
      
      const newData = {
        exportDate: new Date().toISOString(),
        totalActivities: activities.length + userActivitiesBuffer.length,
        activities: [...activities, ...userActivitiesBuffer].slice(-2000) // Keep last 2000
      }
      
      await writeLogFile('user-activities.json', newData)
      console.log(`✅ Logged ${userActivitiesBuffer.length} user activities`)
      userActivitiesBuffer.length = 0
    }
    
    // Auto-update threat analysis after writing events
    await updateThreatAnalysis()

  } catch (error) {
    console.error('Failed to flush buffers:', error)
  }
}

/**
 * Schedule buffer flush
 */
function scheduleFlush(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
  }
  
  writeTimer = setTimeout(() => {
    flushBuffers().catch(console.error)
  }, 5000) // Flush every 5 seconds
}

/**
 * Log security event to file
 */
export async function logSecurityEventToFile(event: SecurityEventLog): Promise<void> {
  securityEventsBuffer.push(event)
  
  if (event.severity === 'critical') {
    blockedIPsSet.add(event.ipAddress)
  }
  
  // Immediate flush if buffer is full or event is critical
  if (securityEventsBuffer.length >= MAX_EVENTS_IN_MEMORY || event.severity === 'critical') {
    await flushBuffers()
  } else {
    scheduleFlush()
  }
}

/**
 * Log honeypot event to file
 */
export async function logHoneypotEventToFile(event: HoneypotEventLog): Promise<void> {
  honeypotEventsBuffer.push(event)
  
  if (event.blocked) {
    blockedIPsSet.add(event.ipAddress)
  }
  
  // Immediate flush if buffer is full or IP is blocked
  if (honeypotEventsBuffer.length >= MAX_EVENTS_IN_MEMORY || event.blocked) {
    await flushBuffers()
  } else {
    scheduleFlush()
  }
}

/**
 * Block IP address
 */
export async function blockIPToFile(ip: string): Promise<void> {
  blockedIPsSet.add(ip)
  await flushBuffers()
}

/**
 * Log user activity to file
 */
export async function logUserActivity(activity: UserActivityLog): Promise<void> {
  userActivitiesBuffer.push(activity)
  
  // Immediate flush if buffer is full
  if (userActivitiesBuffer.length >= MAX_EVENTS_IN_MEMORY) {
    await flushBuffers()
  } else {
    scheduleFlush()
  }
}

/**
 * Update threat analysis
 */
export async function updateThreatAnalysis(): Promise<void> {
  try {
    await ensureLogsDirectory()
    
    const securityEvents = await readLogFile<any>('security-events.json')
    const honeypotEvents = await readLogFile<any>('honeypot-events.json')
    const blockedIPs = await readLogFile<any>('blocked-ips.json')
    const userActivities = await readLogFile<any>('user-activities.json')
    
    const events = securityEvents?.events || []
    
    const analysis = {
      exportDate: new Date().toISOString(),
      period: 'Real-time Analysis',
      summary: {
        totalThreats: securityEvents?.totalEvents || 0,
        criticalThreats: events.filter((e: any) => e.severity === 'critical').length,
        highThreats: events.filter((e: any) => e.severity === 'high').length,
        honeypotTriggers: honeypotEvents?.totalHoneypotTriggers || 0,
        blockedIPs: blockedIPs?.totalBlocked || 0,
        botDetections: events.filter((e: any) => e.type === 'bot_detected').length,
        failedAuthAttempts: events.filter((e: any) => e.type === 'failed_auth').length,
        rateLimitViolations: events.filter((e: any) => e.type === 'rate_limit').length,
        totalUserActivities: userActivities?.totalActivities || 0
      },
      threatsByType: {
        failed_auth: events.filter((e: any) => e.type === 'failed_auth').length,
        bot_detected: events.filter((e: any) => e.type === 'bot_detected').length,
        honeypot_triggered: honeypotEvents?.totalHoneypotTriggers || 0,
        rate_limit: events.filter((e: any) => e.type === 'rate_limit').length,
        suspicious_behavior: events.filter((e: any) => e.type === 'suspicious_behavior').length
      },
      severityDistribution: {
        low: events.filter((e: any) => e.severity === 'low').length,
        medium: events.filter((e: any) => e.severity === 'medium').length,
        high: events.filter((e: any) => e.severity === 'high').length,
        critical: events.filter((e: any) => e.severity === 'critical').length
      },
      topThreats: [
        {
          type: 'Failed Authentication',
          count: events.filter((e: any) => e.type === 'failed_auth').length,
          severity: 'high',
          description: 'Invalid login attempts'
        },
        {
          type: 'Honeypot Triggers',
          count: honeypotEvents?.totalHoneypotTriggers || 0,
          severity: 'critical',
          description: 'Bot/scanner detection'
        },
        {
          type: 'Rate Limit Violations',
          count: events.filter((e: any) => e.type === 'rate_limit').length,
          severity: 'critical',
          description: 'Too many actions in short time'
        }
      ].sort((a, b) => b.count - a.count),
      recommendations: [
        'Monitor honeypot fields continuously for bot activity',
        'Review blocked IPs regularly to ensure no false positives',
        'Update security rules based on threat patterns',
        'Analyze authentication failures for credential stuffing attempts',
        'Implement CAPTCHA for repeated failures',
        'Consider tightening rate limits if abuse continues'
      ],
      lastUpdated: new Date().toISOString()
    }
    
    await writeLogFile('threat-analysis.json', analysis)
    console.log('✅ Threat analysis updated')
  } catch (error) {
    console.error('Failed to update threat analysis:', error)
  }
}

// Flush buffers on process exit
if (typeof process !== 'undefined') {
  // Initialize log directory on module load
  ensureLogsDirectory().catch(console.error)
  
  process.on('beforeExit', () => {
    flushBuffers().catch(console.error)
  })
  
  process.on('SIGINT', () => {
    flushBuffers()
      .catch(console.error)
      .finally(() => process.exit(0))
  })
  
  process.on('SIGTERM', () => {
    flushBuffers()
      .catch(console.error)
      .finally(() => process.exit(0))
  })
}
