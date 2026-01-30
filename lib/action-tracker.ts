// Global Action Tracker - Block users after 7 actions PER RESOURCE
// Also blocks if 20 actions in 30 seconds (rapid fire detection)

import { NextRequest, NextResponse } from 'next/server'

interface ActionTracker {
  count: number
  lastAction: number
  actions: string[]
  resetTime: number
  // Track per-resource limits
  resourceCounts: Map<string, number>
  // Track rapid fire (30 second window)
  recentActions: number[] // timestamps
}

// In-memory store (use Redis in production)
const actionStore = new Map<string, ActionTracker>()

const WINDOW_MS = 60 * 1000 // 1 minute window for per-resource
const RAPID_FIRE_WINDOW_MS = 30 * 1000 // 30 seconds for rapid fire detection
const MAX_ACTIONS_PER_RESOURCE = 15 // Block after 7 actions on SAME button/tab
const MAX_RAPID_FIRE_ACTIONS = 25 // Block if 20 actions in 30 seconds

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now()
  actionStore.forEach((tracker, key) => {
    if (tracker.resetTime < now) {
      actionStore.delete(key)
    }
  })
}, 60 * 1000)

/**
 * Get user identifier from request
 */
export function getUserIdentifier(request: NextRequest): string {
  // Try to get authenticated user email from JWT
  const token = request.cookies.get('auth-token')?.value
  
  if (token) {
    try {
      const jwt = require('jsonwebtoken')
      const decoded = jwt.decode(token) as any
      if (decoded?.email) {
        return `user:${decoded.email}`
      }
    } catch {}
  }
  
  // Fallback to IP + User Agent
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown'
  const userAgent = request.headers.get('user-agent')?.substring(0, 50) || 'unknown'
  
  return `guest:${ip}:${userAgent}`
}

/**
 * Track action and check if user should be blocked
 * Now checks BOTH per-resource limit (5 per button) AND rapid fire (15 in 30s)
 */
export async function trackAction(
  request: NextRequest,
  action: string
): Promise<{
  allowed: boolean
  actionsRemaining: number
  message?: string
  shouldBlock: boolean
  blockReason?: string
}> {
  const identifier = getUserIdentifier(request)
  const now = Date.now()
  
  // Get or create tracker
  let tracker = actionStore.get(identifier)
  
  if (!tracker || tracker.resetTime < now) {
    tracker = {
      count: 0,
      lastAction: now,
      actions: [],
      resetTime: now + WINDOW_MS,
      resourceCounts: new Map(),
      recentActions: []
    }
    actionStore.set(identifier, tracker)
  }
  
  // Track this action timestamp for rapid fire detection
  tracker.recentActions.push(now)
  
  // Remove actions older than 30 seconds
  tracker.recentActions = tracker.recentActions.filter(
    timestamp => now - timestamp < RAPID_FIRE_WINDOW_MS
  )
  
  // Check RAPID FIRE: 15 actions in 30 seconds
  if (tracker.recentActions.length > MAX_RAPID_FIRE_ACTIONS) {
    console.log(`🚨 RAPID FIRE DETECTED: ${identifier} - ${tracker.recentActions.length} actions in 30 seconds`)
    return {
      allowed: false,
      actionsRemaining: 0,
      message: `Too many actions too quickly (${tracker.recentActions.length} in 30 seconds)`,
      shouldBlock: true,
      blockReason: 'Rapid fire: 15+ actions in 30 seconds'
    }
  }
  
  // Track per-resource count
  const resourceCount = (tracker.resourceCounts.get(action) || 0) + 1
  tracker.resourceCounts.set(action, resourceCount)
  
  // Check PER-RESOURCE limit: 5 actions on same button/tab
  if (resourceCount > MAX_ACTIONS_PER_RESOURCE) {
    console.log(`🚨 RESOURCE LIMIT EXCEEDED: ${identifier} - ${resourceCount} actions on "${action}"`)
    return {
      allowed: false,
      actionsRemaining: 0,
      message: `Too many actions on "${action}" (${resourceCount}/${MAX_ACTIONS_PER_RESOURCE})`,
      shouldBlock: true,
      blockReason: `Exceeded limit on ${action}: ${resourceCount} actions`
    }
  }
  
  // Increment global count
  tracker.count++
  tracker.lastAction = now
  tracker.actions.push(`${new Date().toISOString()}: ${action}`)
  
  // Keep only last 20 actions in memory
  if (tracker.actions.length > 20) {
    tracker.actions = tracker.actions.slice(-20)
  }
  
  const actionsRemaining = Math.max(0, MAX_ACTIONS_PER_RESOURCE - resourceCount)
  
  return {
    allowed: true,
    actionsRemaining,
    message: undefined,
    shouldBlock: false
  }
}

/**
 * Get action statistics for a user
 */
export function getActionStats(identifier: string) {
  const tracker = actionStore.get(identifier)
  if (!tracker) {
    return null
  }
  
  const now = Date.now()
  const recentActionsCount = tracker.recentActions.filter(
    timestamp => now - timestamp < RAPID_FIRE_WINDOW_MS
  ).length
  
  return {
    totalActions: tracker.count,
    recentActions: recentActionsCount,
    resourceCounts: Object.fromEntries(tracker.resourceCounts),
    timeRemaining: Math.max(0, tracker.resetTime - now)
  }
}

/**
 * Get action history for user
 */
export function getActionHistory(identifier: string): string[] {
  const tracker = actionStore.get(identifier)
  return tracker?.actions || []
}

/**
 * Reset actions for user (for testing or unblocking)
 */
export function resetActions(identifier: string): void {
  actionStore.delete(identifier)
}

/**
 * Get all tracked users (for admin monitoring)
 */
export function getAllTrackedUsers(): Array<{
  identifier: string
  count: number
  lastAction: Date
  actions: string[]
}> {
  const users: Array<any> = []
  
  actionStore.forEach((tracker, identifier) => {
    users.push({
      identifier,
      count: tracker.count,
      lastAction: new Date(tracker.lastAction),
      actions: tracker.actions
    })
  })
  
  return users.sort((a, b) => b.count - a.count)
}
