'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle, Info, Shield, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Honeypot } from '@/components/honeypot'
import { getSecurityMonitor } from '@/lib/security-monitor'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [honeypotTriggered, setHoneypotTriggered] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  // Initialize security monitoring
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const monitor = getSecurityMonitor()
      monitor.logEvent('login_attempt', 'low', 'User visited login page')
    }
  }, [])

  const handleHoneypotTrigger = (suspicionScore: number) => {
    // Only block if suspicion score is very high (75%+)
    if (suspicionScore >= 75) {
      setHoneypotTriggered(true)
      console.warn('🚨 Honeypot triggered! Suspicion score:', suspicionScore)
    } else {
      // Just log it but don't block
      console.log('⚠️ Low suspicion score:', suspicionScore)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      
      const monitor = getSecurityMonitor()
      monitor.logEvent(
        'login_attempt',
        'low',
        `Successful login for ${email}`
      )

      // Small delay to ensure state updates, then redirect
      setTimeout(() => {
        router.push('/dashboard')
      }, 100)
    } catch (err) {
      const monitor = getSecurityMonitor()
      monitor.logEvent(
        'failed_auth',
        'medium',
        `Failed login attempt for ${email}`
      )
      const errorMessage = err instanceof Error ? err.message : 'Login failed'
      // Add helpful hints based on error type
      if (errorMessage.includes('Invalid') || errorMessage.includes('incorrect')) {
        setError(errorMessage + ' Please check your email and password.')
      } else if (errorMessage.includes('Too many')) {
        setError(errorMessage + ' Please wait before trying again.')
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border shadow-md">
        <CardHeader className="border-b border-border pb-6">
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>Access your health information and services</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {error && (
            <Alert variant="destructive" className="mb-6" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Login form">
            {/* Honeypot fields - invisible to users */}
            <Honeypot onTrigger={handleHoneypotTrigger} />

            <div className="space-y-2">
              <Label htmlFor="email" className="font-semibold">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                className="border-border"
                aria-required="true"
                aria-invalid={error ? 'true' : 'false'}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="font-semibold">Password</Label>
                <Link href="#" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="border-border pr-10"
                  aria-required="true"
                  aria-invalid={error ? 'true' : 'false'}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                aria-label="Remember me on this device"
              />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Remember me on this device
              </Label>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-10" 
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>

            {error && (
              <Alert className="border-blue-500/30 bg-blue-500/5">
                <Info className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-xs space-y-2">
                  <p className="font-semibold">Trouble logging in?</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Double-check your email address is correct</li>
                    <li>Use the eye icon to verify your password</li>
                    <li>Make sure Caps Lock is off</li>
                    <li>Try refreshing the page if it's not working</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <Alert className="border-amber-500/50 bg-amber-500/5" role="note">
              <Info className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <AlertDescription className="text-sm space-y-2">
                <strong>Test Accounts Available:</strong>
                <div className="space-y-1 mt-2">
                  <p><strong>Admin:</strong> <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">admin@healthportal.com</code> / <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">Admin123!</code></p>
                  <p><strong>Patient:</strong> <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">demo@example.com</code> / <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">password123</code></p>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{' '}
            <Link href="/auth/register" className="text-primary hover:underline font-semibold">
              Create one here
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Security notice */}
      <div className="text-center text-xs text-muted-foreground">
        <p>For security, please don't save your password on shared computers</p>
      </div>
    </div>
  )
}
