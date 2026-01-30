// Test Honeypot System - Trigger fake endpoints to populate logs

console.log('🍯 TESTING HONEYPOT SYSTEM...\n')

const HONEYPOT_ENDPOINTS = [
  'http://localhost:3000/api/admin/users/all',
  'http://localhost:3000/api/admin/config',
  'http://localhost:3000/api/admin/debug',
  'http://localhost:3000/api/data/export-all',
  'http://localhost:3000/api/patients/all'
]

async function testHoneypots() {
  console.log('📍 Triggering honeypot endpoints...\n')
  
  for (const endpoint of HONEYPOT_ENDPOINTS) {
    try {
      console.log(`🎯 Testing: ${endpoint}`)
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'HoneypotTestBot/1.0'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`   ✅ Response: ${response.status}`)
        console.log(`   📦 Data keys: ${Object.keys(data).join(', ')}`)
      } else {
        console.log(`   ❌ Error: ${response.status}`)
      }
    } catch (error) {
      console.log(`   ⚠️  Failed: ${error.message}`)
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n⏳ Waiting 6 seconds for logs to flush...')
  await new Promise(resolve => setTimeout(resolve, 6000))
  
  console.log('\n✅ HONEYPOT TEST COMPLETE!')
  console.log('\n📊 Check the following files:')
  console.log('   - security-logs/honeypot-events.json')
  console.log('   - security-logs/threat-analysis.json')
  console.log('   - security-logs/blocked-ips.json')
  console.log('\n🔗 View dashboard: http://localhost:3000/security-dashboard.html')
}

testHoneypots().catch(console.error)
