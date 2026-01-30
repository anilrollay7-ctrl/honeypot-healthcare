import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/db'
import { Vaccination } from '@/lib/models'
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

// GET - Fetch all vaccinations for user with pagination and search
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
    
    // Build query
    const query: any = { userId: user.userId }
    
    if (search) {
      query.$or = [
        { vaccineName: { $regex: search, $options: 'i' } },
        { provider: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ]
    }
    
    const skip = (page - 1) * limit
    
    // Parallel execution for count and data
    const [total, vaccinations] = await Promise.all([
      Vaccination.countDocuments(query),
      Vaccination.find(query)
        .select('-__v') // Exclude version field
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean() // Convert to plain JS objects (faster)
    ])

    return NextResponse.json({ 
      success: true, 
      vaccinations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error: any) {
    console.error('Fetch vaccinations error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vaccinations', details: error.message },
      { status: 500 }
    )
  }
  }, 'View Vaccinations')
}

// POST - Create new vaccination record
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    
    const vaccination = await Vaccination.create({
      ...body,
      userId: user.userId
    })

    return NextResponse.json({ success: true, vaccination }, { status: 201 })

  } catch (error: any) {
    console.error('Create vaccination error:', error)
    return NextResponse.json(
      { error: 'Failed to create vaccination', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Update vaccination
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromToken(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    const body = await request.json()
    const { id, ...updates } = body

    const vaccination = await Vaccination.findOneAndUpdate(
      { _id: id, userId: user.userId },
      updates,
      { new: true }
    )

    if (!vaccination) {
      return NextResponse.json({ error: 'Vaccination not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, vaccination })

  } catch (error: any) {
    console.error('Update vaccination error:', error)
    return NextResponse.json(
      { error: 'Failed to update vaccination', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete vaccination
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
      return NextResponse.json({ error: 'Vaccination ID required' }, { status: 400 })
    }

    const vaccination = await Vaccination.findOneAndDelete({
      _id: id,
      userId: user.userId
    })

    if (!vaccination) {
      return NextResponse.json({ error: 'Vaccination not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Vaccination deleted' })

  } catch (error: any) {
    console.error('Delete vaccination error:', error)
    return NextResponse.json(
      { error: 'Failed to delete vaccination', details: error.message },
      { status: 500 }
    )
  }
}
