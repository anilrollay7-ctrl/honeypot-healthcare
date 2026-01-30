// Honeypot Trap - Fake Admin Config Endpoint

import { NextRequest, NextResponse } from 'next/server'
import { logHoneypotTrap, generateHoneypotData, HONEYPOT_ENDPOINTS } from '@/lib/honeypot-network'

const endpoint = HONEYPOT_ENDPOINTS.find(e => e.path === '/api/admin/config')!

export async function GET(request: NextRequest) {
  await logHoneypotTrap(request, endpoint.path, endpoint)
  await new Promise(resolve => setTimeout(resolve, 500))
  return NextResponse.json(generateHoneypotData('config'), { status: 200 })
}
