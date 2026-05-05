import { createClient } from '@supabase/supabase-js';

const URL  = import.meta.env.VITE_SUPABASE_URL      || '';
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!URL || !KEY) {
  console.warn('[Supabase] Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes — mode local uniquement.');
}

export const supabase = createClient(URL, KEY);
