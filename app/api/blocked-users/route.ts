import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import { getBlockedUsers, unblockUser, isEmailBlocked } from '@/lib/user-blocking'
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

// GET - Fetch blocked users
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
    }

    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const includeExpired = searchParams.get('includeExpired') === 'true'
    const limit = parseInt(searchParams.get('limit') || '100')
    
    if (email) {
      // Check specific email
      const status = await isEmailBlocked(email)
      return NextResponse.json({
        success: true,
        email,
        ...status
      })
    }
    
    // Get all blocked users
    const blockedUsers = await getBlockedUsers({ includeExpired, limit })
    
    return NextResponse.json({
      success: true,
      count: blockedUsers.length,
      blockedUsers
    })
    
  } catch (error: any) {
    console.error('Get blocked users error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blocked users', details: error.message },
      { status: 500 }
    )
  }
}

// POST - Unblock a user
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
    }

    await connectDB()
    
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }
    
    await unblockUser(email, user.userId)
    
    return NextResponse.json({
      success: true,
      message: `User ${email} unblocked successfully`
    })
    
  } catch (error: any) {
    console.error('Unblock user error:', error)
    return NextResponse.json(
      { error: 'Failed to unblock user', details: error.message },
      { status: 500 }
    )
  }
}
