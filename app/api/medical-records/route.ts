import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db'
import { MedicalRecord } from '@/lib/models'
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

// GET - Fetch all medical records for user with pagination and search
export async function GET(request: NextRequest) {
  return withActionProtection(request, async (req) => {
  try {
    const user = getUserFromToken(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    
    // Build query
    const query: any = { userId: user.userId }
    
    if (type && type !== 'all') {
      query.type = type
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { provider: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    }
    
    const skip = (page - 1) * limit
    
    // Parallel execution for count and data
    const [total, records] = await Promise.all([
      MedicalRecord.countDocuments(query),
      MedicalRecord.find(query)
        .select('-__v') // Exclude version field
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean() // Convert to plain JS objects (faster)
    ])

    return NextResponse.json({ 
      success: true, 
      records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error: any) {
    console.error('Fetch medical records error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch medical records', details: error.message },
      { status: 500 }
    )
  }
  }, 'View Medical Records')
}

// POST - Create new medical record
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    
    const record = await MedicalRecord.create({
      ...body,
      userId: user.userId
    })

    return NextResponse.json({ success: true, record }, { status: 201 })

  } catch (error: any) {
    console.error('Create medical record error:', error)
    return NextResponse.json(
      { error: 'Failed to create medical record', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Update medical record
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    const { id, ...updates } = body

    const record = await MedicalRecord.findOneAndUpdate(
      { _id: id, userId: user.userId },
      updates,
      { new: true }
    )

    if (!record) {
      return NextResponse.json({ error: 'Medical record not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, record })

  } catch (error: any) {
    console.error('Update medical record error:', error)
    return NextResponse.json(
      { error: 'Failed to update medical record', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete medical record
export async function DELETE(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Medical record ID required' }, { status: 400 })
    }

    const record = await MedicalRecord.findOneAndDelete({
      _id: id,
      userId: user.userId
    })

    if (!record) {
      return NextResponse.json({ error: 'Medical record not found' }, { status: 404 })
    }

    // Log audit (critical - PHI deletion)
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    await logAudit({
      userId: user.userId,
      action: 'delete',
      resource: 'medical-records',
      resourceId: id,
      details: { method: 'DELETE', endpoint: '/api/medical-records', title: record.title },
      ipAddress,
      userAgent,
      severity: 'critical',
    })

    return NextResponse.json({ success: true, message: 'Medical record deleted' })

  } catch (error: any) {
    console.error('Delete medical record error:', error)
    return NextResponse.json(
      { error: 'Failed to delete medical record', details: error.message },
      { status: 500 }
    )
  }
}
