import { createClient } from '@supabase/supabase-js';
import { config, isConfigured } from './config';

export const supabase = isConfigured ? createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'chap-khana-react-auth' }
}) : null;
