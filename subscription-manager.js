/* StockPulse Subscription Manager v6.2.0
   Firebase Auth -> custom Supabase JWT -> subscriptions table.
   Client never writes subscription status. */
(function () {
  'use strict';

  const KEY = 'stockpulse:subscription:v1';
  const TTL = 60 * 1000;
  let state = { plan: 'free', status: 'active', expiresAt: null, loadedAt: 0 };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function cached() {
    try {
      const x = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (x && Date.now() - Number(x.loadedAt || 0) < TTL) return x;
    } catch (_) {}
    return null;
  }

  function isProNow(s) {
    if (!s) return false;
    if (s.plan !== 'pro' || s.status !== 'active') return false;
    if (!s.expiresAt) return true;
    return new Date(s.expiresAt).getTime() > Date.now();
  }

  function applyUI() {
    const pro = isProNow(state);
    document.querySelectorAll('[data-pro-feature]').forEach(el => {
      el.classList.toggle('sp-pro-unlocked', pro);
      el.classList.toggle('sp-pro-locked', !pro);
    });
    document.querySelectorAll('[data-free-only]').forEach(el => el.classList.toggle('sp-free-visible', !pro));
    const badge = document.getElementById('sp-plan-badge');
    if (badge) {
      badge.textContent = pro ? '👑 PRO' : '🆓 FREE';
      badge.className = 'sp-plan-badge ' + (pro ? 'pro' : 'free');
    }
    const expiry = document.getElementById('sp-plan-expiry');
    if (expiry) expiry.textContent = pro && state.expiresAt ? `Valid until ${new Date(state.expiresAt).toLocaleDateString('en-GB')}` : 'Free plan';
    window.dispatchEvent(new CustomEvent('stockpulse:plan-changed', { detail: { ...state, isPro: pro } }));
  }

  async function load(force = false) {
    const user = window.auth?.currentUser;
    if (!user) {
      state = { plan: 'free', status: 'active', expiresAt: null, loadedAt: Date.now() };
      applyUI();
      return state;
    }
    if (!force) {
      const c = cached();
      if (c && c.uid === user.uid) { state = c; applyUI(); return state; }
    }
    try {
      if (typeof window.supabase === 'undefined' || !window.supabase) throw new Error('Supabase unavailable');
      const { data, error } = await window.supabase.from('subscriptions')
        .select('plan,status,expires_at')
        .eq('user_id', user.uid)
        .maybeSingle();
      if (error) throw error;
      state = {
        uid: user.uid,
        plan: data?.plan === 'pro' ? 'pro' : 'free',
        status: data?.status || 'active',
        expiresAt: data?.expires_at || null,
        loadedAt: Date.now()
      };
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Subscription read failed; using Free safely:', e?.message || e);
      state = { uid: user.uid, plan: 'free', status: 'active', expiresAt: null, loadedAt: Date.now() };
    }
    applyUI();
    return state;
  }

  function isPro() { return isProNow(state); }

  function openUpgrade(reason = '') {
    const modal = document.getElementById('sp-upgrade-modal');
    if (!modal) return;
    const r = document.getElementById('sp-upgrade-reason');
    if (r) r.textContent = reason || 'এই ফিচারটি StockPulse Pro-তে পাওয়া যায়।';
    modal.style.display = 'flex';
  }
  function closeUpgrade() {
    const m = document.getElementById('sp-upgrade-modal');
    if (m) m.style.display = 'none';
  }
  function requirePro(reason) {
    if (isPro()) return true;
    openUpgrade(reason);
    return false;
  }

  window.StockPulsePlan = {
    load, refresh: () => load(true), isPro, get: () => ({ ...state, isPro: isPro() }),
    openUpgrade, closeUpgrade, requirePro
  };

  // 🔒 Hard UI gate for every element marked as a Pro feature.
  // Capture phase prevents inline onclick handlers from navigating before the gate.
  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-require-pro]') : null;
    if (!target || isPro()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const reason = target.getAttribute('data-pro-reason') || 'এই ফিচারটি StockPulse Pro-তে পাওয়া যায়।';
    window.location.href = 'pro.html';
  }, true);

  window.addEventListener('stockpulse:auth-ready', () => load(true));
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => load(false), 250));
})();
