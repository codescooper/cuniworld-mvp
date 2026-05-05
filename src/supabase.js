import { createClient } from '@supabase/supabase-js';

const env = import.meta?.env ?? {};
const URL = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export const supabaseConfigured = Boolean(URL && KEY);

if (!supabaseConfigured) {
  console.warn('[Supabase] Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes — mode local uniquement.');
}

export const supabase = supabaseConfigured ? createClient(URL, KEY) : null;
