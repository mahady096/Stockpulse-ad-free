// StockPulse v6.1.2 — single Supabase client with dynamic Firebase JWT injection.
(function () {
  const appConfig = window.APP_CONFIG;
  if (!appConfig?.API?.SUPABASE_URL || !appConfig?.API?.SUPABASE_ANON_KEY) {
    console.error('❌ Supabase configuration is missing. Check config.js and script order.');
    return;
  }

  const supabaseLibrary = window.supabase;
  if (!supabaseLibrary || typeof supabaseLibrary.createClient !== 'function') {
    console.error('❌ Supabase library not loaded!');
    return;
  }

  let accessToken = null;
  const baseFetch = window.fetch.bind(window);
  const authFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return baseFetch(input, { ...init, headers });
  };

  // Create exactly ONE GoTrue/Supabase client per page.
  window.supabase = supabaseLibrary.createClient(
    appConfig.API.SUPABASE_URL,
    appConfig.API.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: authFetch },
      realtime: { autoConnect: false },
    }
  );

  window.setSupabaseAuthToken = function (token) {
    accessToken = token || null;
    window.__supabaseAccessToken = accessToken;
    return window.supabase;
  };

  window.clearSupabaseAuth = function () {
    accessToken = null;
    window.__supabaseAccessToken = null;
  };

  window.getSupabaseAuthToken = function () {
    return accessToken;
  };

  console.log('✅ Supabase client initialized once (Firebase JWT bridge ready)');
})();
