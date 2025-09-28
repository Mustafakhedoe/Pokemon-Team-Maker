// js/supabase.js
const SUPABASE_URL = "https://gpdhhxuimpvkotqwfjtz.supabase.co";   // bijv. https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwZGhoeHVpbXB2a290cXdmanR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMDc2NTMsImV4cCI6MjA3NDU4MzY1M30.cfTTCenMDMxDNC7Uq4qwc8SEPbDbDO85dJpVo7Z3j44";
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
