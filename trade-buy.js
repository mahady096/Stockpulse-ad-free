// ==========================================
// 📥 trade-buy.js - Buy ফাংশনালিটি
//    portfolio.js থেকে ভাগ করা
//    Supabase + Firebase ডুয়াল রাইট
//
//    ✅ ফিক্স v2:
//    - Cache wildcard বাগ: CacheManager.remove('chart_X_*') কাজ করত না
//      → CacheManager.clearByPattern('chart_X') ব্যবহার করা হচ্ছে
//    - ডুপ্লিকেট initBuyTabs সরানো (trade-history.js-এ একই ফাংশন আছে,
//      ওটাই এখন single source of truth — ডাবল ইভেন্ট লিসেনার এড়াতে)
//    - quantity/price-এ isNaN() ভ্যালিডেশন যোগ
// ==========================================

(function() {

    // 🆓 FREE PLAN LIMIT: maximum active unique shares across all portfolios.
    const FREE_MAX_UNIQUE_SHARES = 20;

    async function ensureSubscriptionLoadedForBuy() {
        try {
            if (window.StockPulsePlan && typeof window.StockPulsePlan.load === 'function') {
                await window.StockPulsePlan.load(true);
            }
        } catch (e) {
            console.warn('Subscription status check failed; Free share limit remains enabled:', e?.message || e);
        }
        return !!(window.StockPulsePlan && typeof window.StockPulsePlan.isPro === 'function' && window.StockPulsePlan.isPro());
    }

    async function getActiveUniqueShares(userId) {
        const seen = new Set();
        try {
            const unified = await unifiedEngine.calculate(userId, null, true);
            if (unified?.stockDetails) {
                unified.stockDetails.forEach(item => {
                    const ticker = String(item?.ticker || '').trim().toUpperCase();
                    if (ticker && Number(item?.totalQty || 0) > 0) seen.add(ticker);
                });
            }
        } catch (e) {
            console.warn('Could not count active shares for Free limit:', e?.message || e);
        }
        return seen;
    }
    // DOM এলিমেন্টগুলো নিরাপদে রেফারেন্স
    const tickerInput = document.getElementById('trade-ticker');
    const priceInput = document.getElementById('trade-price');
    const suggestionBox = document.getElementById('suggestion-box');
    const tradeDateInput = document.getElementById('trade-date');
    const qtyInput = document.getElementById('trade-qty');
    const btnBuy = document.querySelector('.btn-buy');
    const buyPortfolioSelect = document.getElementById('buy-portfolio-select');

    if (tradeDateInput) tradeDateInput.value = getBangladeshDateString();

    // ==========================================
    // ১. Buy সাজেশন – ডিবাউন্স সহ
    // ==========================================
    if (tickerInput && suggestionBox) {
        const debouncedSearch = debounce(function(query) {
            suggestionBox.innerHTML = "";
            if (!query) { suggestionBox.classList.add('hidden'); return; }
            const filtered = dseStocks.filter(stock => stock.startsWith(query));
            if (filtered.length > 0) {
                suggestionBox.classList.remove('hidden');
                filtered.forEach(stock => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion-item');
                    div.innerText = stock;
                    div.addEventListener('click', () => {
                        tickerInput.value = stock;
                        suggestionBox.classList.add('hidden');
                        fetchLivePriceForBuy(stock);
                    });
                    suggestionBox.appendChild(div);
                });
            } else {
                suggestionBox.classList.add('hidden');
            }
        }, 250);

        tickerInput.addEventListener('input', function() {
            const query = this.value.trim().toUpperCase();
            debouncedSearch(query);
        });

        // বাইরে ক্লিক করলে সাজেশন বন্ধ
        document.addEventListener('click', function(e) {
            if (!tickerInput.contains(e.target) && !suggestionBox.contains(e.target)) {
                suggestionBox.classList.add('hidden');
            }
        });
    }

    // ==========================================
    // ২. লাইভ প্রাইস ফেচ (API থেকে)
    // ==========================================
    async function fetchLivePriceForBuy(ticker) {
        if (!priceInput) return;
        const cached = await getCachedPrice(ticker);
        if (cached) { priceInput.value = cached; return; }
        try {
            const response = await fetch(`${SCRAPER_BASE_URL}?symbol=${ticker}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.ltp) { priceInput.value = data.ltp; return; }
            }
        } catch (e) { /* ignore */ }
        const unified = typeof getUnifiedPrice === 'function' ? await getUnifiedPrice(ticker, true) : 0;
        if (unified > 0) {
            priceInput.value = unified;
        } else {
            priceInput.value = '';
            if (typeof showToast === 'function') showToast('Current price is unavailable. Please enter the executed trade price manually.', 'warning');
        }
    }

    async function getCachedPrice(ticker) {
        try {
            if (typeof db === 'undefined') return null;
            const doc = await db.collection('current_prices').doc(ticker).get();
            if (doc.exists) return doc.data().price;
        } catch(e) { /* ignore */ }
        return null;
    }

    // ==========================================
    // ৩. Buy বাটন – ডুয়াল রাইট
    // ==========================================
    if (btnBuy) {
        const newBtnBuy = btnBuy.cloneNode(true);
        btnBuy.parentNode.replaceChild(newBtnBuy, btnBuy);
        newBtnBuy.addEventListener('click', async () => {
            const shareName = tickerInput ? tickerInput.value.trim().toUpperCase() : '';
            const quantityRaw = qtyInput ? qtyInput.value : '';
            const priceRaw = priceInput ? priceInput.value : '';
            const portfolioId = buyPortfolioSelect ? buyPortfolioSelect.value : 'main';
            const user = auth && auth.currentUser ? auth.currentUser : null;

            if (!user) {
                if (typeof showToast === 'function') showToast("Please login first", "error");
                return;
            }
            if (!shareName || !quantityRaw || !priceRaw) {
                if (typeof showToast === 'function') showToast("Please fill all fields correctly", "warning");
                return;
            }

            // ✅ ফিক্স: সংখ্যা ভ্যালিড কিনা যাচাই (NaN হলে আটকে দেওয়া)
            const quantity = Number(quantityRaw);
            const price = Number(priceRaw);
            if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) {
                if (typeof showToast === 'function') showToast("Please enter valid quantity and price (numbers > 0).", "warning");
                return;
            }

            let selectedDate = tradeDateInput ? tradeDateInput.value : getBangladeshDateString();
            if (!selectedDate) selectedDate = getBangladeshDateString();
            const transactionDate = getUTCFromLocalDate(selectedDate);
            if (isNaN(transactionDate.getTime())) {
                if (typeof showToast === 'function') showToast("Invalid date!", "error");
                return;
            }

            // 🆓 Free users can hold up to FREE_MAX_UNIQUE_SHARES active unique shares.
            // Buying more of an existing holding remains allowed.
            const isPro = await ensureSubscriptionLoadedForBuy();
            if (!isPro) {
                const activeShares = await getActiveUniqueShares(user.uid);
                if (activeShares.size >= FREE_MAX_UNIQUE_SHARES && !activeShares.has(shareName)) {
                    if (typeof showToast === 'function') showToast(
                        `Free plan allows up to ${FREE_MAX_UNIQUE_SHARES} active shares. Upgrade to Pro for unlimited shares.`,
                        'warning'
                    );
                    return;
                }
            }

            const totalAmount = quantity * price;
            const commissionPercent = commissionManager.getPercent();
            const commissionAmount = commissionManager.calculateCommission(totalAmount);
            const totalWithCommission = totalAmount + commissionAmount;

            const confirmBody = `
                <div class="confirm-summary-grid">
                    <span>Stock</span><strong>${shareName}</strong>
                    <span>Quantity</span><strong>${quantity}</strong>
                    <span>Price</span><strong>৳${price.toFixed(2)}</strong>
                    <span>Trade value</span><strong>৳${totalAmount.toFixed(2)}</strong>
                    <span>Commission</span><strong>৳${commissionAmount.toFixed(2)} (${commissionPercent}%)</strong>
                    <span class="total-label">Total payable</span><strong class="total-value">৳${totalWithCommission.toFixed(2)}</strong>
                </div>`;
            if (typeof window.showConfirmModal === 'function') {
                const confirmed = await window.showConfirmModal({
                    title: 'Confirm Buy',
                    icon: '🛒',
                    body: confirmBody,
                    confirmText: 'Confirm Buy'
                });
                if (!confirmed) return;
            } else if (!window.confirm(`Buy ${quantity} ${shareName} at ৳${price.toFixed(2)}?`)) {
                return;
            }

            try {
                const result = await savePortfolioToBoth(user.uid, {
                    shareName: shareName,
                    quantity: quantity,
                    buyPrice: price,
                    commission: commissionAmount,
                    commissionPercent: commissionPercent,
                    date: transactionDate.toISOString().split('T')[0],
                    portfolioId: portfolioId
                });

                if (result.supabaseSuccess) {
                    if (!result.firebaseSuccess && typeof showToast === 'function') {
                        showToast('⚠️ Supabase saved successfully, but Firebase mirror failed.', 'warning');
                    }
                    // ক্যাশ রিসেট
                    resetUnifiedCache();
                    resetUnifiedPriceCache();
                    CacheManager.remove(`price_${shareName}`);
                    CacheManager.remove(`price_detail_${shareName}`);
                    // ✅ ফিক্স: wildcard '*' লিটারাল ক্যারেক্টার হিসেবে যেত, কোনো কী ম্যাচ করত না
                    CacheManager.clearByPattern(`chart_${shareName}`);

                    // UI রিফ্রেশ
                    if (typeof loadDashboardData === 'function') {
                        loadDashboardData(portfolioId, true);
                    }
                    if (typeof loadPortfolioAnalysisTable === 'function') {
                        loadPortfolioAnalysisTable(user.uid, portfolioId, true);
                    }
                    if (typeof loadUnifiedStockTable === 'function') {
                        loadUnifiedStockTable(user.uid);
                    }

                    if (typeof showToast === 'function') showToast(`✅ ${shareName} purchased successfully!`, 'success');

                    // ফর্ম রিসেট
                    if (tickerInput) tickerInput.value = "";
                    if (qtyInput) qtyInput.value = "";
                    if (priceInput) priceInput.value = "";
                    if (tradeDateInput) tradeDateInput.value = getTodayDate();
                } else {
                    if (typeof showToast === 'function') showToast("Failed to save purchase in both databases!", "error");
                }
            } catch (error) {
                console.error('Buy error:', error);
                if (typeof showToast === 'function') showToast("Failed to save purchase!", "error");
            }
        });
    }

    // ==========================================
    // ৪. Buy ট্যাব ইনিশিয়ালাইজেশন
    //    ✅ ফিক্স: এই ফাংশন এখান থেকে সরানো হয়েছে।
    //    trade-history.js-এ হুবহু একই ফাংশন আছে এবং সেটা নিজের
    //    DOMContentLoaded-এ কল হয় — দুই জায়গায় থাকলে
    //    window.initBuyTabs ওভাররাইট হয়ে যেত এবং ভবিষ্যতে
    //    দুই ফাইল ভিন্ন অর্ডারে লোড হলে ডাবল ইভেন্ট লিসেনার
    //    অ্যাটাচ হওয়ার ঝুঁকি ছিল। এখন single source of truth
    //    হলো trade-history.js।
    // ==========================================

    console.log('✅ trade-buy.js v2 loaded (cache fix, duplicate initBuyTabs removed)');
})();
