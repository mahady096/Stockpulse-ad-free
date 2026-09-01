// StockPulse v6.1.3 — secure metadata sync client
// Reads market/history data through the authenticated Supabase client and
// delegates all stock_metadata writes to the protected Edge Function.
(function () {
  const toast = (message, type) => { if (typeof window.showToast === 'function') window.showToast(message, type); };
  const FUNCTION_NAME = 'sync-metadata';
  const BATCH_SIZE = 12;
  const DELAY_BETWEEN_BATCHES = 350;

  async function invokeMetadataSync(tickers) {
    if (!window.supabase || typeof window.supabase.functions?.invoke !== 'function') {
      throw new Error('Supabase client is not ready. Please refresh and try again.');
    }
    const token = typeof window.getSupabaseAuthToken === 'function'
      ? window.getSupabaseAuthToken() : null;
    if (!token) throw new Error('Supabase authentication is not ready. Please sign in again.');

    const { data, error } = await window.supabase.functions.invoke(FUNCTION_NAME, {
      body: { tickers }
    });
    if (error) throw error;
    if (!data || data.success !== true) {
      throw new Error(data?.error || 'Metadata sync failed');
    }
    return data;
  }

  async function syncAllMetadata(onProgress, onComplete) {
    try {
      const user = typeof auth !== 'undefined' ? auth?.currentUser : null;
      if (!user) {
        toast('Please login first', 'error');
        onComplete?.(0, 0);
        return;
      }

      const tickers = Array.isArray(window.dseStocks)
        ? window.dseStocks
        : (typeof dseStocks !== 'undefined' && Array.isArray(dseStocks) ? dseStocks : []);
      const uniqueTickers = [...new Set(tickers.map(x => String(x).trim().toUpperCase()).filter(Boolean))];

      if (!uniqueTickers.length) {
        toast('No stock list found!', 'error');
        onComplete?.(0, 0);
        return;
      }

      let success = 0;
      let fail = 0;
      const failedTickers = [];
      onProgress?.(0, uniqueTickers.length);

      for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
        const batch = uniqueTickers.slice(i, i + BATCH_SIZE);
        try {
          const result = await invokeMetadataSync(batch);
          const results = Array.isArray(result.results) ? result.results : [];
          for (const item of results) {
            if (item.success) success++;
            else {
              fail++;
              failedTickers.push(`${item.ticker}: ${item.error || 'failed'}`);
            }
          }
          // Backend returns one result per requested ticker. Count any missing result as failed.
          const missing = batch.length - results.length;
          if (missing > 0) fail += missing;
        } catch (err) {
          fail += batch.length;
          failedTickers.push(`${batch.join(', ')}: ${err.message || err}`);
          console.error('❌ Metadata batch failed:', err);
        }

        const done = Math.min(i + batch.length, uniqueTickers.length);
        onProgress?.(done, uniqueTickers.length);
        if (done < uniqueTickers.length) await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
      }

      if (failedTickers.length) console.warn('⚠️ Metadata sync failures:', failedTickers);
      onComplete?.(success, fail);
      toast(`✅ Metadata sync done! Success: ${success}, Failed: ${fail}`, success ? 'success' : 'error');
    } catch (error) {
      console.error('❌ syncAllMetadata fatal error:', error);
      toast('❌ Sync failed: ' + (error.message || error), 'error');
      onComplete?.(0, 0);
    }
  }

  window.syncAllMetadataWithProgress = function () {
    const btn = document.getElementById('btn-sync-metadata');
    const statusSpan = document.getElementById('sync-status');
    if (!btn || !statusSpan) {
      toast('UI elements not found! Please refresh.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ Syncing...';
    statusSpan.innerText = '⏳ Starting secure sync...';
    statusSpan.style.color = '#f59e0b';

    syncAllMetadata(
      (current, total) => {
        const pct = total ? Math.round((current / total) * 100) : 0;
        statusSpan.innerText = `⏳ ${current}/${total} (${pct}%)`;
        btn.innerHTML = `⏳ ${pct}%`;
      },
      (success, fail) => {
        btn.disabled = false;
        btn.innerHTML = '🔄 Sync Stock Metadata';
        statusSpan.innerText = `✅ Done! ${success} success, ${fail} failed`;
        statusSpan.style.color = success ? '#10b981' : '#ef4444';
      }
    );
  };

  window.syncAllMetadata = syncAllMetadata;
  console.log('✅ sync-metadata.js v6.1.3 loaded — client writes to stock_metadata are disabled');
})();
