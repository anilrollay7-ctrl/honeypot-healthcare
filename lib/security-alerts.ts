// Security Alerts System
// Track suspicious activities and generate alerts

import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ISecurityAlert extends Document {
  userId?: mongoose.Types.ObjectId
  email: string
  alertType: 'failed_login' | 'account_locked' | 'honeypot_trigger' | 'suspicious_activity' | 'rate_limit'
  severity: 'low' | 'medium' | 'high' | 'critical'
  ipAddress: string
  userAgent: string
  timestamp: Date
  details: {
    attemptCount?: number
    reason: string
    action: string
    [key: string]: any
  }
  honeypot?: {
    interactionLevel: 'low' | 'medium' | 'high'
    purpose: 'production' | 'research'
    category: 'malware' | 'spam' | 'database' | 'spider' | 'credential' | 'admin' | 'api' | 'config'
    threatTypes: string[]
    trapPath: string
  }
  resolved: boolean
  resolvedAt?: Date
  resolvedBy?: mongoose.Types.ObjectId
}

const SecurityAlertSchema = new Schema<ISecurityAlert>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  email: { type: String, required: true, index: true },
  alertType: { 
    type: String, 
    required: true,
    enum: ['failed_login', 'account_locked', 'honeypot_trigger', 'suspicious_activity', 'rate_limit'],
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  details: {
    attemptCount: Number,
    reason: { type: String, required: true },
    action: { type: String, required: true },
  },
  honeypot: {
    interactionLevel: { type: String, enum: ['low', 'medium', 'high'], index: true },
    purpose: { type: String, enum: ['production', 'research'] },
    category: { type: String, enum: ['malware', 'spam', 'database', 'spider', 'credential', 'admin', 'api', 'config'], index: true },
    threatTypes: [{ type: String }],
    trapPath: String
  },
  resolved: { type: Boolean, default: false, index: true },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { 
  timestamps: true,
  collection: 'security_alerts'
})

// Indexes
SecurityAlertSchema.index({ email: 1, timestamp: -1 })
SecurityAlertSchema.index({ alertType: 1, severity: 1, resolved: 1 })

export const SecurityAlert: Model<ISecurityAlert> = 
  mongoose.models.SecurityAlert || mongoose.model<ISecurityAlert>('SecurityAlert', SecurityAlertSchema)

/**
 * Create security alert
 */
export async function createSecurityAlert(params: {
  userId?: string
  email: string
  alertType: ISecurityAlert['alertType']
  severity: ISecurityAlert['severity']
  ipAddress: string
  userAgent: string
  details: {
    attemptCount?: number
    reason: string
    action: string
    [key: string]: any
  }
  honeypot?: {
    interactionLevel: 'low' | 'medium' | 'high'
    purpose: 'production' | 'research'
    category: 'malware' | 'spam' | 'database' | 'spider' | 'credential' | 'admin' | 'api' | 'config'
    threatTypes: string[]
    trapPath: string
  }
}): Promise<ISecurityAlert> {
  try {
    const alert = await SecurityAlert.create({
      userId: params.userId,
      email: params.email,
      alertType: params.alertType,
      severity: params.severity,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      timestamp: new Date(),
      details: params.details,
      honeypot: params.honeypot,
      resolved: false
    })
    
    console.log(`🚨 SECURITY ALERT: ${params.alertType} for ${params.email}`)
    
    return alert
  } catch (error) {
    console.error('Failed to create security alert:', error)
    throw error
  }
}

/**
 * Get unresolved alerts
 */
export async function getUnresolvedAlerts(options?: {
  email?: string
  severity?: string
  limit?: number
}): Promise<ISecurityAlert[]> {
  const query: any = { resolved: false }
  
  if (options?.email) query.email = options.email
  if (options?.severity) query.severity = options.severity
  
  return await SecurityAlert.find(query)
    .sort({ timestamp: -1 })
    .limit(options?.limit || 100)
    .lean() as any
}

/**
 * Get all alerts for email
 */
export async function getAlertsByEmail(email: string, limit = 50): Promise<ISecurityAlert[]> {
  return await SecurityAlert.find({ email })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean() as any
}

/**
 * Resolve alert
 */
export async function resolveAlert(alertId: string, resolvedBy?: string): Promise<void> {
  await SecurityAlert.findByIdAndUpdate(alertId, {
    resolved: true,
    resolvedAt: new Date(),
    resolvedBy
  })
}

/**
 * Check if email should be blocked
 */
export async function shouldBlockEmail(email: string): Promise<{
  shouldBlock: boolean
  reason: string
  alertCount: number
}> {
  const recentAlerts = await SecurityAlert.find({
    email,
    timestamp: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
  })
  
  const failedLoginCount = recentAlerts.filter(a => a.alertType === 'failed_login').length
  const honeypotCount = recentAlerts.filter(a => a.alertType === 'honeypot_trigger').length
  
  if (failedLoginCount >= 5) {
    return {
      shouldBlock: true,
      reason: `Too many failed login attempts (${failedLoginCount})`,
      alertCount: failedLoginCount
    }
  }
  
  if (honeypotCount >= 1) {
    return {
      shouldBlock: true,
      reason: 'Honeypot triggered - bot detected',
      alertCount: honeypotCount
    }
  }
  
  const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical').length
  if (criticalAlerts >= 3) {
    return {
      shouldBlock: true,
      reason: `Multiple critical security alerts (${criticalAlerts})`,
      alertCount: criticalAlerts
    }
  }
  
  return {
    shouldBlock: false,
    reason: '',
    alertCount: recentAlerts.length
  }
}
