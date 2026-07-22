'use client'

import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import { createClient as createBrowserClient } from './supabase/client'

export function useAuthGuard() {

  const [ready, setReady] = useState(false)

  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {

    let mounted = true

    let unsubscribe: (() => void) | null = null

    const initAuth = async () => {

      try {

        const supabase = createBrowserClient()

        // Listener for auth state changes — do not redirect here.

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {

          if (!mounted) return

          // Debug logging to help trace unexpected sign-outs

          console.debug('[useAuthGuard] auth event:', event, !!session?.user?.id)

          // Persist lightweight auth event trace to localStorage for debugging

          try {

            const key = 'pesaki_auth_events'

            const prev = JSON.parse(localStorage.getItem(key) || '[]')

            prev.push({ ts: Date.now(), event, userId: session?.user?.id || null })

            if (prev.length > 50) prev.shift()

            localStorage.setItem(key, JSON.stringify(prev))

          } catch (e) {

            // ignore storage errors

          }

          setHasSession(!!session?.user?.id)

          setReady(true)

        })

        unsubscribe = subscription?.unsubscribe

        // Immediate session check with a short hydration window

        const { data: { session } } = await supabase.auth.getSession()

        if (!mounted) return

        if (session?.user?.id) {

          setHasSession(true)

          setReady(true)

          return

        }

        // Allow supabase client a short moment to hydrate from storage

        await new Promise(resolve => setTimeout(resolve, 500))

        if (!mounted) return

        const { data: { session: retrySession } } = await supabase.auth.getSession()

        setHasSession(!!retrySession?.user?.id)

        setReady(true)

      } catch (err) {

        console.error('[useAuthGuard] init error', err)

        if (mounted) {

          setHasSession(false)

          setReady(true)

        }

      }

    }

    initAuth()

    return () => {

      mounted = false

      unsubscribe?.()

    }

  }, [])

  return { ready, hasSession }

}
