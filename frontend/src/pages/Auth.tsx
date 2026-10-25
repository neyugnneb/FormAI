import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AuthMode = 'login' | 'signup'

function Auth() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const mode: AuthMode = searchParams.get('mode') === 'login' ? 'login' : 'signup'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  function selectMode(nextMode: AuthMode) {
    setErrorMessage(null)
    setSuccessMessage(null)
    setSearchParams({ mode: nextMode })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!supabase) {
      setErrorMessage(
        'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to frontend/.env.local, then restart the frontend.',
      )
      return
    }

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const confirmPassword = String(formData.get('confirmPassword') ?? '')

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        if (data.session) {
          navigate('/dashboard', { replace: true })
        } else {
          setSuccessMessage(
            'Your account was created. Check your email for a confirmation link, then come back to log in.',
          )
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error

        if (data.session) {
          navigate('/dashboard', { replace: true })
        } else {
          setErrorMessage('Sign-in completed without an active session. Try again.')
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        setErrorMessage(
          'Could not connect to Supabase. Check that the project is active, the URL in frontend/.env.local is the exact Project URL from Supabase, and your network or browser extensions are not blocking the request. Restart the frontend after changing the URL.',
        )
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes('email rate limit exceeded')
      ) {
        setErrorMessage(
          'Supabase temporarily limited confirmation emails. Wait before trying again, and check Authentication → Users in your Supabase dashboard to see whether your account was created. For ongoing testing, configure a custom SMTP provider in Supabase Authentication settings.',
        )
      } else {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Authentication failed. Please try again.',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-9">
        <Link
          to="/"
          className="text-sm text-white/70 transition hover:text-white"
        >
          ← Back to home
        </Link>

        <header className="mb-7 mt-8">
          <p className="mb-2 text-sm font-semibold text-white">
            FormAI
          </p>
          <h1 className="text-3xl font-semibold">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-white/65">
            {mode === 'signup'
              ? 'Sign up to start improving your game.'
              : 'Log in to continue your training.'}
          </p>
        </header>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-black/25 p-1">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            onClick={() => selectMode('login')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === 'login'
                ? 'bg-white text-gray-950'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            aria-pressed={mode === 'signup'}
            onClick={() => selectMode('signup')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === 'signup'
                ? 'bg-white text-gray-950'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5 text-left text-sm font-medium">
            <span>Email</span>
            <input
              autoComplete="email"
              className="w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white focus:ring-2 focus:ring-white/30"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>
          <label className="block space-y-1.5 text-left text-sm font-medium">
            <span>Password</span>
            <input
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white focus:ring-2 focus:ring-white/30"
              name="password"
              placeholder="Enter your password"
              required
              type="password"
            />
          </label>
          {mode === 'signup' && (
            <label className="block space-y-1.5 text-left text-sm font-medium">
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white focus:ring-2 focus:ring-white/30"
                name="confirmPassword"
                placeholder="Enter your password again"
                required
                type="password"
              />
            </label>
          )}

          {errorMessage && (
            <p
              aria-live="assertive"
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-left text-sm text-white"
              role="alert"
            >
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p
              aria-live="polite"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white"
              role="status"
            >
              {successMessage}
            </p>
          )}

          <button
            className="w-full rounded-xl border-white border-solid border px-4 py-3 font-semibold text-white hover:text-black transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !supabase}
            type="submit"
          >
            {isSubmitting
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : 'Log in'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Auth
