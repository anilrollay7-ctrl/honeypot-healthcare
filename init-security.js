#!/usr/bin/env node

console.log('🚀 INITIALIZING SECURITY SYSTEM...\n')

const fs = require('fs')
const path = require('path')

// Ensure security-logs directory and initialize files
const logsDir = path.join(__dirname, 'security-logs')

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
  console.log('✅ Created security-logs directory\n')
}

const files = {
  'security-events.json': {
    exportDate: new Date().toISOString(),
    totalEvents: 0,
    events: []
  },
  'honeypot-events.json': {
    exportDate: new Date().toISOString(),
    totalHoneypotTriggers: 0,
    events: []
  },
  'blocked-ips.json': {
    exportDate: new Date().toISOString(),
    totalBlocked: 0,
    ips: []
  },
  'user-activities.json': {
    exportDate: new Date().toISOString(),
    totalActivities: 0,
    activities: []
  },
  'threat-analysis.json': {
    exportDate: new Date().toISOString(),
    period: 'Real-time Analysis',
    summary: {
      totalThreats: 0,
      criticalThreats: 0,
      highThreats: 0,
      honeypotTriggers: 0,
      blockedIPs: 0,
      botDetections: 0,
      failedAuthAttempts: 0,
      rateLimitViolations: 0,
      totalUserActivities: 0
    },
    threatsByType: {},
    severityDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
    topThreats: [],
    recommendations: [
      'Monitor honeypot fields continuously',
      'Review blocked IPs regularly',
      'Analyze authentication failures'
    ],
    lastUpdated: new Date().toISOString()
  }
}

console.log('📝 Initializing log files:\n')

Object.keys(files).forEach(filename => {
  const filepath = path.join(logsDir, filename)
  
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, JSON.stringify(files[filename], null, 2))
    console.log(`✅ Created ${filename}`)
  } else {
    console.log(`⏭️  ${filename} already exists`)
  }
})

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
console.log('✅ SECURITY SYSTEM INITIALIZED!\n')
console.log('📋 Next Steps:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('1. Start server: npm run dev')
console.log('2. Open dashboard: http://localhost:3000/security-dashboard.html')
console.log('3. Test system: node test-security-complete.js')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('🎯 FEATURES ACTIVE:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('✅ Block users after 6 actions on ANY endpoint')
console.log('✅ Real-time visual dashboard')
console.log('✅ All log files working')
console.log('✅ Honeypot events tracked')
console.log('✅ Threat analysis auto-updated')
console.log('✅ Instant blocking on violations')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
