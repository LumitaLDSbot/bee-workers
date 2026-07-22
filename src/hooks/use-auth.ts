'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureUserProfile, startOnboarding } from '@/server/actions/onboarding.actions';
import { mapSupabaseError } from '@/lib/utils/errors';
import type { Role, UserProfile } from '@/types';

export function useAuth() {
  const supabase = createClient();

  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (): Promise<UserProfile | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfile(null); return null; }

    let { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle<UserProfile>();

    if (!data) {
      await ensureUserProfile();
      const retry = await supabase.from('users').select('*').eq('id', user.id).maybeSingle<UserProfile>();
      data = retry.data;
    }

    setProfile(data ?? null);
    return data ?? null;
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function init() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile();
      if (active) setLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile();
      else setProfile(null);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [fetchProfile, supabase.auth]);

  const sendPhoneOtp = useCallback(async (phone: string, role?: Role) => {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, data: role ? { role } : undefined },
    });
    if (error) { const message = mapSupabaseError(error); setError(message); throw new Error(message); }
  }, [supabase.auth]);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string, role?: Role) => {
    setError(null);
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) { const message = mapSupabaseError(error); setError(message); throw new Error(message); }
    if (role) await startOnboarding(role);
    setUser(data.user);
    await fetchProfile();
    return data;
  }, [supabase.auth, fetchProfile]);

  const signInWithEmailPassword = useCallback(async (email: string, password: string) => {
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { const message = mapSupabaseError(error); setError(message); throw new Error(message); }
    setUser(data.user);
    await fetchProfile();
    return data;
  }, [supabase.auth, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase.auth]);

  const refreshProfile = useCallback(async () => { return fetchProfile(); }, [fetchProfile]);

  return { user, profile, loading, error, sendPhoneOtp, verifyPhoneOtp, signInWithEmailPassword, signOut, refreshProfile };
}
