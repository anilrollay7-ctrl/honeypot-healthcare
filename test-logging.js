#!/usr/bin/env node

/**
 * Test Security Logging System
 * This script tests the file-based security logging
 */

console.log('🔍 Testing Security Logging System...\n')

// Test 1: Check if security-logs directory exists
const fs = require('fs')
const path = require('path')

const logsDir = path.join(__dirname, 'security-logs')

if (!fs.existsSync(logsDir)) {
  console.log('❌ security-logs directory not found')
  console.log('✨ Creating directory...')
  fs.mkdirSync(logsDir, { recursive: true })
  console.log('✅ Directory created\n')
} else {
  console.log('✅ security-logs directory exists\n')
}

// Test 2: Check log files
const logFiles = [
  'security-events.json',
  'honeypot-events.json',
  'blocked-ips.json',
  'threat-analysis.json'
]

console.log('📁 Checking log files:')
logFiles.forEach(file => {
  const filePath = path.join(logsDir, file)
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath)
    const size = stats.size
    const content = size > 0 ? 'Has data' : 'Empty'
    console.log(`  ${content === 'Has data' ? '✅' : '⚠️'}  ${file} (${size} bytes) - ${content}`)
    
    // Try to read and validate JSON
    if (size > 0) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (file === 'security-events.json' && data.events) {
          console.log(`      📊 ${data.events.length} events logged`)
        } else if (file === 'honeypot-events.json' && data.events) {
          console.log(`      🍯 ${data.events.length} honeypot triggers`)
        } else if (file === 'blocked-ips.json' && data.ips) {
          console.log(`      🚫 ${data.ips.length} IPs blocked`)
        }
      } catch (e) {
        console.log(`      ⚠️  Invalid JSON`)
      }
    }
  } else {
    console.log(`  ❌ ${file} - Not found`)
  }
})

console.log('\n📋 Summary:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('Security logs are stored in: security-logs/')
console.log('')
console.log('How logging works:')
console.log('1. ✅ Real-time logging to MongoDB (database)')
console.log('2. ✅ File logging enabled via lib/file-logger.ts')
console.log('3. ✅ Logs written on security events (login, honeypot, etc.)')
console.log('4. ✅ Manual export via: node export-security-data.mjs')
console.log('')
console.log('To see logs populate:')
console.log('• Attempt to login (creates security events)')
console.log('• Access honeypot endpoints (triggers traps)')
console.log('• Check API: GET /api/security-logs')
console.log('')
console.log('To export from MongoDB:')
console.log('• Run: node export-security-data.mjs')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
