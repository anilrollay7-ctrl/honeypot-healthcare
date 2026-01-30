import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db'
import { Appointment } from '@/lib/models'
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

// GET - Fetch all appointments for user with pagination and search
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
    const status = searchParams.get('status') || ''
    
    // Build query
    const query: any = { userId: user.userId }
    
    if (status && status !== 'all') {
      query.status = status
    }
    
    if (search) {
      query.$or = [
        { doctorName: { $regex: search, $options: 'i' } },
        { specialty: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ]
    }
    
    const skip = (page - 1) * limit
    
    // Parallel execution for count and data
    const [total, appointments] = await Promise.all([
      Appointment.countDocuments(query),
      Appointment.find(query)
        .select('-__v') // Exclude version field
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean() // Convert to plain JS objects (faster)
    ])

    return NextResponse.json({ 
      success: true, 
      appointments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error: any) {
    console.error('Fetch appointments error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch appointments', details: error.message },
      { status: 500 }
    )
  }
  }, 'View Appointments')
}

// POST - Create new appointment
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    
    const appointment = await Appointment.create({
      ...body,
      userId: user.userId
    })

    // Log audit
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    await logAudit({
      userId: user.userId,
      action: 'create',
      resource: 'appointments',
      resourceId: (appointment as any)._id.toString(),
      details: { method: 'POST', endpoint: '/api/appointments' },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({ success: true, appointment }, { status: 201 })

  } catch (error: any) {
    console.error('Create appointment error:', error)
    return NextResponse.json(
      { error: 'Failed to create appointment', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Update appointment
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    const { id, ...updates } = body

    const appointment = await Appointment.findOneAndUpdate(
      { _id: id, userId: user.userId },
      updates,
      { new: true }
    )

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, appointment })

  } catch (error: any) {
    console.error('Update appointment error:', error)
    return NextResponse.json(
      { error: 'Failed to update appointment', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete appointment
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
      return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 })
    }

    const appointment = await Appointment.findOneAndDelete({
      _id: id,
      userId: user.userId
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Appointment deleted' })

  } catch (error: any) {
    console.error('Delete appointment error:', error)
    return NextResponse.json(
      { error: 'Failed to delete appointment', details: error.message },
      { status: 500 }
    )
  }
}
