import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db'
import { HealthUpdate } from '@/lib/models'
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

// GET - Fetch all health updates (admin) or user-specific (regular user)
export async function GET(request: NextRequest) {
  return withActionProtection(request, async (req) => {
    try {
      const user = getUserFromToken(req)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      await connectDB()
      
      // Admin can see all updates, users see only active updates
      const query = user.role === 'admin' ? {} : { status: 'active' }
      
      const updates = await HealthUpdate.find(query)
        .sort({ createdAt: -1 })
        .lean()

      return NextResponse.json({ success: true, updates })

    } catch (error: any) {
      console.error('Fetch health updates error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch health updates', details: error.message },
        { status: 500 }
      )
    }
  }, 'View Health Updates')
}

// POST - Create new health update (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 })
    }

    await connectDB()
    
    const body = await request.json()
    
    const update = await HealthUpdate.create({
      ...body,
      author: user.email
    })

    return NextResponse.json({ success: true, update }, { status: 201 })

  } catch (error: any) {
    console.error('Create health update error:', error)
    return NextResponse.json(
      { error: 'Failed to create health update', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Update health update (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 })
    }

    await connectDB()
    
    const body = await request.json()
    const { id, ...updates } = body

    const update = await HealthUpdate.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    )

    if (!update) {
      return NextResponse.json({ error: 'Health update not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, update })

  } catch (error: any) {
    console.error('Update health update error:', error)
    return NextResponse.json(
      { error: 'Failed to update health update', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete health update (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 })
    }

    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Health update ID required' }, { status: 400 })
    }

    const update = await HealthUpdate.findByIdAndDelete(id)

    if (!update) {
      return NextResponse.json({ error: 'Health update not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Health update deleted' })

  } catch (error: any) {
    console.error('Delete health update error:', error)
    return NextResponse.json(
      { error: 'Failed to delete health update', details: error.message },
      { status: 500 }
    )
  }
}
