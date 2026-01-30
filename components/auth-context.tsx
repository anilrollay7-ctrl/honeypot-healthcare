'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

export interface PatientProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: 'male' | 'female' | 'other'
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  bloodType: string
  emergencyContact: string
  registeredDate: string
}

interface AuthContextType {
  user: PatientProfile | null
  isLoggedIn: boolean
  isLoading: boolean
  setUser: (user: PatientProfile | null) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, profile: Omit<PatientProfile, 'id' | 'registeredDate'>) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PatientProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load user session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
        }
      } catch (error) {
        console.error('Auth check failed:', error)
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [])
  
  // Separate effect for fetch interceptor (runs once)
  useEffect(() => {
    const originalFetch = window.fetch
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      
      // Skip /api/auth/me to prevent loops
      const url = args[0] as string
      if (url?.includes('/api/auth/me')) {
        return response
      }
      
      // Auto-logout if user is blocked (403) or rate limited (429)
      if (response.status === 403 || response.status === 429) {
        const data = await response.clone().json().catch(() => ({}))
        
        if (data.blocked || data.error?.includes('blocked') || data.error?.includes('Too many')) {
          console.error('🚨 AUTO-LOGOUT: User blocked due to security violation')
          console.error('Block details:', data)
          
          // Clear user state
          setUser(null)
          localStorage.removeItem('medicalPortalUser')
          
          // Show alert
          alert(`Security Alert: ${data.error || 'Your account has been temporarily blocked due to suspicious activity'}\n\nReason: ${data.reason || 'Too many actions'}\n\nYou have been automatically logged out.`)
          
          // Redirect to login
          window.location.href = '/auth/login'
        }
      }
      
      return response
    }
    
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Login failed')
    }

    const data = await response.json()
    setUser(data.user)
    
    // Keep localStorage backup for backward compatibility
    localStorage.setItem('medicalPortalUser', JSON.stringify(data.user))
  }

  const register = async (email: string, password: string, profile: Omit<PatientProfile, 'id' | 'registeredDate'>) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password,
        ...profile
      })
    })

    if (!response.ok) {
      const error = await response.json()
      // Include validation details if available
      const errorMessage = error.details 
        ? `${error.error}: ${error.details.join(', ')}`
        : error.error || 'Registration failed'
      throw new Error(errorMessage)
    }

    const data = await response.json()
    setUser(data.user)
    
    // Keep localStorage backup for backward compatibility
    localStorage.setItem('medicalPortalUser', JSON.stringify(data.user))
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout error:', error)
    }
    
    setUser(null)
    localStorage.removeItem('medicalPortalUser')
  }

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isLoading, setUser, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
