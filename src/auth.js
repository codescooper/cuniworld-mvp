import { supabase } from './supabase.js';

export const Auth = {
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
