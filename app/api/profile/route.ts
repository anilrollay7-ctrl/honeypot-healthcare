import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db'
import { User } from '@/lib/models'
import { logAudit } from '@/lib/audit-logger'
import { withActionProtection } from '@/lib/api-protection'

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

// GET - Fetch user profile
export async function GET(request: NextRequest) {
  return withActionProtection(request, async (req) => {
    try {
      const user = getUserFromToken(req)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      await connectDB()
      
      const userProfile = await User.findById(user.userId).select('-password -__v')
      
      if (!userProfile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true, user: userProfile })

    } catch (error: any) {
      console.error('Fetch profile error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch profile', details: error.message },
        { status: 500 }
      )
    }
  }, 'View Profile')
}

// PATCH - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    
    // Remove fields that shouldn't be updated
    delete body.email // Email changes require verification
    delete body.password // Password changes use different endpoint
    delete body.role // Role changes require admin
    delete body._id
    delete body.id
    
    const updatedUser = await User.findByIdAndUpdate(
      user.userId,
      { $set: body },
      { new: true, runValidators: true }
    ).select('-password -__v')

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Log audit
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    await logAudit({
      userId: user.userId,
      action: 'update',
      resource: 'profile',
      resourceId: user.userId,
      details: { updatedFields: Object.keys(body) },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({ success: true, user: updatedUser })

  } catch (error: any) {
    console.error('Update profile error:', error)
    return NextResponse.json(
      { error: 'Failed to update profile', details: error.message },
      { status: 500 }
    )
  }
}
