import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import { getUnresolvedAlerts, getAlertsByEmail, resolveAlert } from '@/lib/security-alerts'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'

function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value || 
                 request.headers.get('authorization')?.replace('Bearer ', '')
  
  if (!token) return null
  
  try {
    return jwt.verify(token, JWT_SECRET) as any
  } catch {
    return null
  }
}

// GET - Fetch security alerts
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const severity = searchParams.get('severity')
    const limit = parseInt(searchParams.get('limit') || '100')
    
    let alerts
    
    if (email) {
      // Get alerts for specific email
      alerts = await getAlertsByEmail(email, limit)
    } else {
      // Get all unresolved alerts
      alerts = await getUnresolvedAlerts({ severity: severity || undefined, limit })
    }
    
    return NextResponse.json({
      success: true,
      count: alerts.length,
      alerts
    })
    
  } catch (error: any) {
    console.error('Get alerts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Resolve an alert
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
    }

    await connectDB()
    
    const { alertId } = await request.json()
    
    if (!alertId) {
      return NextResponse.json({ error: 'alertId required' }, { status: 400 })
    }
    
    await resolveAlert(alertId, user.userId)
    
    return NextResponse.json({
      success: true,
      message: 'Alert resolved successfully'
    })
    
  } catch (error: any) {
    console.error('Resolve alert error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve alert', details: error.message },
      { status: 500 }
    )
  }
}
