// Honeypot Trap - Fake Admin Users Endpoint
// This endpoint exists only to catch malicious actors
// HIGH INTERACTION - ADMIN CATEGORY - PRODUCTION

import { NextRequest, NextResponse } from 'next/server'
import { logHoneypotTrap, generateHoneypotData, HONEYPOT_ENDPOINTS } from '@/lib/honeypot-network'

const endpoint = HONEYPOT_ENDPOINTS.find(e => e.path === '/api/admin/users/all')!

export async function GET(request: NextRequest) {
  // Log the trap trigger with full classification
  await logHoneypotTrap(request, endpoint.path, endpoint)
  
  // Return fake but convincing data with a delay (simulate real API)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  return NextResponse.json(generateHoneypotData('admin'), { status: 200 })
}

export async function POST(request: NextRequest) {
  await logHoneypotTrap(request, endpoint.path, endpoint)
  await new Promise(resolve => setTimeout(resolve, 500))
  return NextResponse.json(generateHoneypotData('admin'), { status: 200 })
}
