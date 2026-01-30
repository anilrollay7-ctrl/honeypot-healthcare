// User Blocking System
// Temporarily or permanently block users based on security violations

import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IBlockedUser extends Document {
  userId?: mongoose.Types.ObjectId
  email: string
  ipAddresses: string[]
  reason: string
  severity: 'temporary' | 'permanent'
  blockedAt: Date
  expiresAt?: Date
  blockedBy?: mongoose.Types.ObjectId
  alertIds: mongoose.Types.ObjectId[]
  unblocked: boolean
  unblockedAt?: Date
  unblockedBy?: mongoose.Types.ObjectId
}

const BlockedUserSchema = new Schema<IBlockedUser>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  email: { type: String, required: true, index: true },
  ipAddresses: [{ type: String }],
  reason: { type: String, required: true },
  severity: {
    type: String,
    enum: ['temporary', 'permanent'],
    default: 'temporary'
  },
  blockedAt: { type: Date, default: Date.now, index: true },
  expiresAt: Date,
  blockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  alertIds: [{ type: Schema.Types.ObjectId, ref: 'SecurityAlert' }],
  unblocked: { type: Boolean, default: false },
  unblockedAt: Date,
  unblockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'blocked_users'
})

// Indexes - compound index for active blocks
BlockedUserSchema.index({ email: 1, unblocked: 1 })
BlockedUserSchema.index({ expiresAt: 1 })

export const BlockedUser: Model<IBlockedUser> = 
  mongoose.models.BlockedUser || mongoose.model<IBlockedUser>('BlockedUser', BlockedUserSchema)

/**
 * Block a user by email
 */
export async function blockUserByEmail(params: {
  userId?: string
  email: string
  ipAddress: string
  reason: string
  severity?: 'temporary' | 'permanent'
  durationMinutes?: number
  alertIds?: string[]
}): Promise<IBlockedUser> {
  try {
    const expiresAt = params.severity === 'permanent' 
      ? undefined 
      : new Date(Date.now() + (params.durationMinutes || 30) * 60 * 1000)
    
    // Use findOneAndUpdate with upsert to avoid duplicate key errors
    const blocked = await BlockedUser.findOneAndUpdate(
      { email: params.email, unblocked: false },
      {
        $set: {
          userId: params.userId,
          reason: params.reason,
          severity: params.severity || 'temporary',
          blockedAt: new Date(),
          expiresAt,
          unblocked: false
        },
        $addToSet: {
          ipAddresses: params.ipAddress,
          ...(params.alertIds && {
            alertIds: { $each: params.alertIds.map(id => new mongoose.Types.ObjectId(id)) }
          })
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    )
    
    console.log(`🚫 USER BLOCKED SUCCESSFULLY:`, {
      email: params.email,
      reason: params.reason,
      severity: params.severity || 'temporary',
      expiresAt: expiresAt?.toISOString(),
      id: (blocked as any)._id
    })
    
    return blocked as IBlockedUser
  } catch (error) {
    console.error('Failed to block user:', error)
    throw error
  }
}

/**
 * Check if email is blocked
 */
export async function isEmailBlocked(email: string): Promise<{
  isBlocked: boolean
  reason?: string
  expiresAt?: Date
  severity?: string
}> {
  const blocked = await BlockedUser.findOne({ 
    email, 
    unblocked: false 
  })
  
  console.log(`🔍 Checking if ${email} is blocked:`, blocked ? 'YES - BLOCKED' : 'NO - Not blocked')
  
  if (!blocked) {
    return { isBlocked: false }
  }
  
  // Check if temporary block expired
  if (blocked.severity === 'temporary' && blocked.expiresAt && blocked.expiresAt < new Date()) {
    // Auto-unblock
    blocked.unblocked = true
    blocked.unblockedAt = new Date()
    await blocked.save()
    
    return { isBlocked: false }
  }
  
  return {
    isBlocked: true,
    reason: blocked.reason,
    expiresAt: blocked.expiresAt,
    severity: blocked.severity
  }
}

/**
 * Unblock user by email
 */
export async function unblockUser(email: string, unblockedBy?: string): Promise<void> {
  await BlockedUser.findOneAndUpdate(
    { email, unblocked: false },
    {
      unblocked: true,
      unblockedAt: new Date(),
      unblockedBy
    }
  )
  
  console.log(`✅ USER UNBLOCKED: ${email}`)
}

/**
 * Get all blocked users
 */
export async function getBlockedUsers(options?: {
  includeExpired?: boolean
  limit?: number
}): Promise<IBlockedUser[]> {
  const query: any = { unblocked: false }
  
  if (!options?.includeExpired) {
    query.$or = [
      { severity: 'permanent' },
      { expiresAt: { $gte: new Date() } }
    ]
  }
  
  return await BlockedUser.find(query)
    .sort({ blockedAt: -1 })
    .limit(options?.limit || 100)
    .lean() as any
}

/**
 * Clean up expired blocks
 */
export async function cleanupExpiredBlocks(): Promise<number> {
  const result = await BlockedUser.updateMany(
    {
      severity: 'temporary',
      expiresAt: { $lt: new Date() },
      unblocked: false
    },
    {
      unblocked: true,
      unblockedAt: new Date()
    }
  )
  
  return result.modifiedCount
}
