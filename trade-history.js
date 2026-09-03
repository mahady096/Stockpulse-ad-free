// ==========================================
// 📜 trade-history.js - Buy & Sell History
//    portfolio.js থেকে ভাগ করা
//    Buy History, Sell History, Edit/Delete
//
//    ✅ ফিক্স v2:
//    - editBuyRecord: isNaN() ভ্যালিডেশন + user_id ownership চেক
//    - deleteBuyRecord: user_id ownership চেক (IDOR প্রতিরোধ)
//    - টেবিল রো-তে docId/ticker escape করা (defense-in-depth)
// ==========================================

(function() {
    // ==========================================
    // 🛡️ HTML attribute-এ নিরাপদে বসানোর হেল্পার
    // ==========================================
    function escapeHtmlTH(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function makeBuyRecordToken(item) {
        return encodeURIComponent(JSON.stringify({
            id: item?.id ?? item?.doc_id ?? item?.docId ?? '',
            type: 'BUY',
            ticker: String(item?.share_name || item?.shareName || '').trim().toUpperCase(),
            quantity: item?.quantity ?? 0,
            price: item?.buy_price ?? item?.buyPrice ?? 0,
            date: item?.date ?? '',
            created_at: item?.created_at ?? item?.createdAt ?? ''
        }));
    }

    function decodeBuyRecordToken(value) {
        try { const x = JSON.parse(decodeURIComponent(String(value || ''))); return x && typeof x === 'object' ? x : null; }
        catch (_) { return null; }
    }

    // ==========================================
    // ১. Buy History
    // ==========================================
    window.loadBuyHistory = async function(ticker, portfolioId = null) {
        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            if (typeof showToast === 'function') showToast('Please login first', 'error');
            return;
        }

        const tbody = document.getElementById('buy-history-body');
        const footer = document.getElementById('buy-history-footer');
        if (!tbody) return;

        const avgEl = document.getElementById('buy-history-avg-price');
        const totalQtyEl = document.getElementById('buy-history-total-qty');
        const totalCostEl = document.getElementById('buy-history-total-cost');

        if (!ticker || ticker.trim() === '') {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">Search a share to see buy history.</td></tr>`;
            if (footer) footer.style.display = 'none';
            if (avgEl) avgEl.innerHTML = '📊 Avg Buy: -';
            if (totalQtyEl) totalQtyEl.innerHTML = '📦 Total Qty: -';
            if (totalCostEl) totalCostEl.innerHTML = '💰 Total Cost: -';
            return;
        }

        ticker = ticker.trim().toUpperCase();
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading...</td></tr>`;
        if (footer) footer.style.display = 'table-footer-group';

        try {
            let buyData = [];

            // Supabase
            if (typeof supabase !== 'undefined' && supabase) {
                try {
                    let query = supabase
                        .from('portfolios')
                        .select('*')
                        .eq('user_id', user.uid)
                        .eq('share_name', ticker)
                        .order('date', { ascending: false });
                    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
                    const { data } = await query;
                    if (data) buyData = data;
                } catch (e) {
                    console.warn('Supabase buy history fetch failed, trying Firebase...', e);
                }
            }

            // Firebase ফ্যালব্যাক
            if (buyData.length === 0 && typeof db !== 'undefined') {
                try {
                    let query = db.collection('portfolios')
                        .where('userId', '==', user.uid)
                        .where('shareName', '==', ticker)
                        .orderBy('date', 'desc');
                    if (portfolioId) query = query.where('portfolioId', '==', portfolioId);
                    const buySnapshot = await query.get();
                    buySnapshot.forEach(doc => {
                        const data = doc.data();
                        const parsedDate = safeParseDate(data.date);
                        const parsedCreatedAt = safeParseDate(data.createdAt);
                        buyData.push({
                            id: doc.id,
                            share_name: data.shareName,
                            quantity: data.quantity,
                            buy_price: data.buyPrice,
                            date: parsedDate ? parsedDate.toISOString() : null,
                            created_at: parsedCreatedAt ? parsedCreatedAt.toISOString() : null
                        });
                    });
                } catch (e) {
                    console.warn('Firebase buy history fetch failed', e);
                }
            }

            if (buyData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">No buy history found for ${ticker}.</td></tr>`;
                if (footer) footer.style.display = 'none';
                if (avgEl) avgEl.innerHTML = '📊 Avg Buy: -';
                if (totalQtyEl) totalQtyEl.innerHTML = '📦 Total Qty: -';
                if (totalCostEl) totalCostEl.innerHTML = '💰 Total Cost: -';
                return;
            }

            let html = '';
            let totalQty = 0;
            let totalCost = 0;

            buyData.forEach(item => {
                const date = safeParseDate(item.date) || new Date();
                const dateStr = date.toLocaleDateString('bn-BD');
                const qty = item.quantity || 0;
                const price = item.buy_price || 0;
                const total = qty * price;

                totalQty += qty;
                totalCost += total;

                const safeId = makeBuyRecordToken(item);

                html += `<tr>
                    <td style="padding: 8px;">${dateStr}</td>
                    <td style="padding: 8px; font-weight: bold;">${escapeHtmlTH(item.share_name)}</td>
                    <td style="padding: 8px;">${qty}</td>
                    <td style="padding: 8px;">৳${price.toFixed(2)}</td>
                    <td style="padding: 8px;">৳${total.toFixed(2)}</td>
                    <td style="padding: 8px;">
                        <button onclick="editBuyRecord('${safeId}')" style="background:#0284c7; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:4px;">✏️</button>
                        <button onclick="deleteBuyRecord('${safeId}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">🗑️</button>
                    </td>
                </tr>`;
            });

            tbody.innerHTML = html;

            const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
            if (avgEl) avgEl.innerHTML = `📊 Avg Buy: ৳${avgPrice.toFixed(2)}`;
            if (totalQtyEl) totalQtyEl.innerHTML = `📦 Total Qty: ${totalQty}`;
            if (totalCostEl) totalCostEl.innerHTML = `💰 Total Cost: ৳${totalCost.toLocaleString('bn-BD', { minimumFractionDigits: 2 })}`;

            if (footer) footer.style.display = 'table-footer-group';
        } catch (error) {
            console.error('Buy history error:', error);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: red;">Error loading data. ${error.message}</td></tr>`;
            if (footer) footer.style.display = 'none';
        }
    };

    // ==========================================
    // Buy রেকর্ড এডিট
    // ✅ ফিক্স: isNaN() ভ্যালিডেশন + user_id ownership চেক
    // ==========================================
    window.editBuyRecord = async function(docId) {
        const record = decodeBuyRecordToken(docId) || { id: docId };
        const firebaseId = record.id || '';
        const newQtyRaw = prompt("Enter new quantity:");
        if (newQtyRaw === null) return; // ইউজার Cancel চেপেছে
        const newPriceRaw = prompt("Enter new price:");
        if (newPriceRaw === null) return;

        const newQty = parseInt(newQtyRaw);
        const newPrice = parseFloat(newPriceRaw);

        // ✅ ফিক্স: আগে শুধু truthy string চেক হতো, এখন সত্যিকারের সংখ্যা কিনা যাচাই হচ্ছে
        if (isNaN(newQty) || newQty <= 0 || isNaN(newPrice) || newPrice <= 0) {
            if (typeof showToast === 'function') showToast('❌ Please enter valid quantity and price (numbers > 0).', 'error');
            return;
        }

        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            if (typeof showToast === 'function') showToast('Please login first', 'error');
            return;
        }

        try {
            let updated = false;

            // ---------- Supabase: user_id ফিল্টার সহ update ----------
            if (typeof supabase !== 'undefined' && supabase) {
                let query = supabase.from('portfolios').update({ quantity: newQty, buy_price: newPrice }).eq('user_id', user.uid);
                if (record.id) query = query.eq('id', record.id);
                else {
                    query = query.eq('share_name', record.ticker);
                    if (record.created_at) query = query.eq('created_at', record.created_at);
                    else if (record.date) query = query.eq('date', record.date);
                    query = query.eq('quantity', record.quantity).eq('buy_price', record.price);
                }
                const { error, data } = await query.select();
                if (!error && data && data.length > 0) updated = true;
            }

            // ---------- Firebase: update-এর আগে ownership ভেরিফাই ----------
            if (typeof db !== 'undefined' && firebaseId) {
                try {
                    const docRef = db.collection('portfolios').doc(firebaseId);
                    const docSnap = await docRef.get();
                    if (docSnap.exists && docSnap.data().userId === user.uid) {
                        await docRef.update({
                            quantity: newQty,
                            buyPrice: newPrice
                        });
                        updated = true;
                    } else if (docSnap.exists) {
                        console.warn('⚠️ Ownership mismatch — update blocked client-side');
                    }
                } catch (e) {
                    console.warn('Firebase update check failed', e);
                }
            }

            if (updated) {
                if (typeof showToast === 'function') showToast('✅ Updated successfully!', 'success');
                const searchInput = document.getElementById('buy-history-search');
                if (searchInput) loadBuyHistory(searchInput.value);
                resetUnifiedCache();
                resetUnifiedPriceCache();
            } else {
                if (typeof showToast === 'function') showToast('❌ Update failed or record not found', 'error');
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast('❌ Update failed: ' + err.message, 'error');
        }
    };

    // ==========================================
    // Buy রেকর্ড ডিলিট
    // ✅ ফিক্স: user_id ownership চেক (IDOR প্রতিরোধ)
    // ==========================================
    window.deleteBuyRecord = async function(docId) {
        const record = decodeBuyRecordToken(docId) || { id: docId };
        const firebaseId = record.id || '';
        if (!confirm('Are you sure you want to delete this buy record?')) return;

        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            if (typeof showToast === 'function') showToast('Please login first', 'error');
            return;
        }

        try {
            let deleted = false;

            // ---------- Supabase: user_id ফিল্টার সহ delete ----------
            if (typeof supabase !== 'undefined' && supabase) {
                let query = supabase.from('portfolios').delete().eq('user_id', user.uid);
                if (record.id) query = query.eq('id', record.id);
                else {
                    query = query.eq('share_name', record.ticker);
                    if (record.created_at) query = query.eq('created_at', record.created_at);
                    else if (record.date) query = query.eq('date', record.date);
                    query = query.eq('quantity', record.quantity).eq('buy_price', record.price);
                }
                const { error, data } = await query.select();
                if (!error && data && data.length > 0) deleted = true;
            }

            // ---------- Firebase: delete-এর আগে ownership ভেরিফাই ----------
            if (typeof db !== 'undefined' && firebaseId) {
                try {
                    const docRef = db.collection('portfolios').doc(firebaseId);
                    const docSnap = await docRef.get();
                    if (docSnap.exists && docSnap.data().userId === user.uid) {
                        await docRef.delete();
                        deleted = true;
                    } else if (docSnap.exists) {
                        console.warn('⚠️ Ownership mismatch — delete blocked client-side');
                    }
                } catch (e) {
                    console.warn('Firebase delete check failed', e);
                }
            }

            if (deleted) {
                if (typeof showToast === 'function') showToast('✅ Deleted successfully!', 'success');
                const searchInput = document.getElementById('buy-history-search');
                if (searchInput) loadBuyHistory(searchInput.value);
                resetUnifiedCache();
                resetUnifiedPriceCache();
            } else {
                if (typeof showToast === 'function') showToast('❌ Delete failed or record not found', 'error');
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast('❌ Delete failed: ' + err.message, 'error');
        }
    };

    // Buy History সার্চ
    function initBuyHistorySearch() {
        const searchInput = document.getElementById('buy-history-search');
        const suggestionBox = document.getElementById('buy-history-suggestion-box');
        if (!searchInput || !suggestionBox) return;

        const debouncedBuyHist = debounce(function(query) {
            suggestionBox.innerHTML = '';
            suggestionBox.classList.add('hidden');
            if (!query) {
                loadBuyHistory('');
                return;
            }
            const filtered = dseStocks.filter(stock => stock.startsWith(query));
            if (filtered.length > 0) {
                suggestionBox.classList.remove('hidden');
                const limited = filtered.slice(0, 15);
                limited.forEach(stock => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion-item');
                    div.innerText = stock;
                    div.addEventListener('click', function() {
                        searchInput.value = stock;
                        suggestionBox.classList.add('hidden');
                        const portfolioId = document.getElementById('buy-history-portfolio-select')?.value || null;
                        loadBuyHistory(stock, portfolioId);
                    });
                    suggestionBox.appendChild(div);
                });
            } else {
                suggestionBox.classList.add('hidden');
                loadBuyHistory('');
            }
        }, 300);

        searchInput.addEventListener('input', function() {
            const query = this.value.trim().toUpperCase();
            debouncedBuyHist(query);
        });

        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const ticker = this.value.trim().toUpperCase();
                suggestionBox.classList.add('hidden');
                if (ticker && dseStocks.includes(ticker)) {
                    const portfolioId = document.getElementById('buy-history-portfolio-select')?.value || null;
                    loadBuyHistory(ticker, portfolioId);
                } else {
                    loadBuyHistory('');
                }
            }
        });
    }

    // ==========================================
    // ২. Sell History (ইতিমধ্যে trade-sell.js-এ আছে, কিন্তু এখানে ডুপ্লিকেট এড়াতে আমরা রেফারেন্স রাখছি)
    //    আসলে Sell History ফাংশন trade-sell.js-এ ডিফাইন করা আছে, তাই এখানে শুধু রেফারেন্স দিচ্ছি
    // ==========================================
    // Sell History ফাংশন trade-sell.js থেকে কল হবে
    // window.loadSellHistory ইতিমধ্যে trade-sell.js-এ ডিফাইন করা আছে

    // ==========================================
    // ৩. Buy Tabs initialization
    // ==========================================
    function initBuyTabs() {
        const tabsContainer = document.querySelector('.buy-tabs');
        const buyPanel = document.getElementById('buy-tab-content');
        const historyPanel = document.getElementById('buy-history-tab-content');

        if (!tabsContainer || !buyPanel || !historyPanel) {
            console.warn('Buy tabs elements not found');
            return;
        }

        tabsContainer.addEventListener('click', function(e) {
            const tabBtn = e.target.closest('.buy-tab-btn');
            if (!tabBtn) return;
            const target = tabBtn.getAttribute('data-tab');
            if (!target) return;

            const allTabs = tabsContainer.querySelectorAll('.buy-tab-btn');
            allTabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = 'transparent';
                t.style.color = 'var(--text-primary)';
                t.style.border = '1px solid var(--border-color)';
                t.style.borderBottom = 'none';
            });

            tabBtn.classList.add('active');
            tabBtn.style.background = 'var(--primary-color)';
            tabBtn.style.color = 'white';
            tabBtn.style.border = 'none';

            buyPanel.style.display = 'none';
            historyPanel.style.display = 'none';

            if (target === 'buy') {
                buyPanel.style.display = 'block';
            } else if (target === 'history') {
                historyPanel.style.display = 'block';
                const searchInput = document.getElementById('buy-history-search');
                if (searchInput) {
                    searchInput.value = '';
                    if (typeof loadBuyHistory === 'function') {
                        loadBuyHistory('');
                    }
                }
            }
        });

        console.log('✅ Buy tabs initialized');
    }

    // ==========================================
    // ৪. DOMContentLoaded ইভেন্ট
    // ==========================================
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof initBuyTabs === 'function') initBuyTabs();
        if (typeof initBuyHistorySearch === 'function') initBuyHistorySearch();

        // Buy History Portfolio Selector
        const buyHistoryPortfolioSelect = document.getElementById('buy-history-portfolio-select');
        if (buyHistoryPortfolioSelect) {
            buyHistoryPortfolioSelect.addEventListener('change', function() {
                const ticker = document.getElementById('buy-history-search')?.value.trim().toUpperCase();
                if (ticker) {
                    loadBuyHistory(ticker, this.value);
                }
            });
        }
    });

    // ==========================================
    // ৫. গ্লোবাল এক্সপোজ
    // ==========================================
    window.loadBuyHistory = loadBuyHistory;
    window.editBuyRecord = editBuyRecord;
    window.deleteBuyRecord = deleteBuyRecord;
    window.initBuyTabs = initBuyTabs;
    window.initBuyHistorySearch = initBuyHistorySearch;

    console.log('✅ trade-history.js v2 loaded (IDOR fix + isNaN validation on edit)');
})();
