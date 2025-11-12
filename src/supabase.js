import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yeveuzdezowqijcyyxiv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldmV1emRlem93cWlqY3l5eGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4Njc0NjAsImV4cCI6MjA3NDQ0MzQ2MH0.5Kd9ZNfLR0Hzpnz1H1tBXzvP_CWUD0u00c2UsfD1GfI';
export const supabase = createClient(supabaseUrl, supabaseKey);