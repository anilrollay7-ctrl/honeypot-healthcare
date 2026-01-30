import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import { updateThreatAnalysis } from '@/lib/file-logger'
import path from 'path'
import fs from 'fs/promises'

async function readLogFile(filename: string) {
  try {
    const logsDir = path.join(process.cwd(), 'security-logs')
    const filePath = path.join(logsDir, filename)
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error(`Error reading ${filename}:`, error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    // Update threat analysis
    await updateThreatAnalysis()
    
    // Read all log files
    const securityEvents = await readLogFile('security-events.json')
    const honeypotEvents = await readLogFile('honeypot-events.json')
    const blockedIPs = await readLogFile('blocked-ips.json')
    const threatAnalysis = await readLogFile('threat-analysis.json')
    const userActivities = await readLogFile('user-activities.json')
    
    // Get blocked users from MongoDB
    const mongoose = (await import('mongoose')).default
    const BlockedUser = mongoose.models.blocked_users || mongoose.model('blocked_users', new mongoose.Schema({}, { strict: false }), 'blocked_users')
    const blockedUsers = await BlockedUser.find({ 
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    }).sort({ createdAt: -1 }).limit(100).lean()
    
    // Get active security alerts from MongoDB
    const SecurityAlert = mongoose.models.security_alerts || mongoose.model('security_alerts', new mongoose.Schema({}, { strict: false }), 'security_alerts')
    const activeAlerts = await SecurityAlert.find({ 
      resolved: false 
    }).sort({ createdAt: -1 }).limit(100).lean()
    
    return NextResponse.json({
      success: true,
      summary: {
        securityEvents: securityEvents?.totalEvents || 0,
        honeypotTriggers: honeypotEvents?.totalHoneypotTriggers || 0,
        blockedIPs: blockedIPs?.totalBlocked || 0,
        userActivities: userActivities?.totalActivities || 0,
        blockedUsers: blockedUsers.length,
        activeAlerts: activeAlerts.length,
        lastUpdated: new Date().toISOString()
      },
      logs: {
        securityEvents: securityEvents || { events: [] },
        honeypotEvents: honeypotEvents || { events: [] },
        blockedIPs: blockedIPs || { ips: [] },
        threatAnalysis: threatAnalysis || {},
        userActivities: userActivities || { activities: [] }
      },
      blockedUsers: blockedUsers.map((user: any) => ({
        email: user.email,
        reason: user.reason,
        blockedAt: user.createdAt,
        expiresAt: user.expiresAt,
        isPermanent: !user.expiresAt
      })),
      alerts: activeAlerts.map((alert: any) => ({
        _id: alert._id,
        email: alert.email,
        type: alert.alertType || alert.type || 'security_alert',
        severity: alert.severity,
        message: alert.message || alert.details?.reason || 'Security alert triggered',
        ipAddress: alert.ipAddress,
        createdAt: alert.createdAt,
        resolved: alert.resolved
      }))
    })
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    )
  }
}
