// ==========================================
// 💰 dividend.js - Dividend Analysis
//    portfolio.js থেকে ভাগ করা (ফাইল ৪)
//    ডিভিডেন্ড অ্যাড/এডিট/ডিলিট
//
//    ✅ ফিক্স v2:
//    - deleteDividendRecord: Supabase-এ .eq('user_id', ...) যোগ করা হয়েছে
//      (IDOR প্রতিরোধ — RLS-এর উপর একতরফা নির্ভর না করা)
//    - Firebase delete/update-এর আগে ownership ভেরিফাই (doc পড়ে userId চেক)
//    - saveDividendData (edit): একই ownership চেক
//    - html টেবিলে docId/ticker escape করা (defense-in-depth)
// ==========================================

let currentEditingDividendId = null;

// ==========================================
// 🛡️ HTML attribute-এ নিরাপদে বসানোর জন্য escape হেল্পার
// ==========================================
function escapeHtmlDiv(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadDividendData(portfolioId = null) {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        const tb = document.getElementById('dividend-table-body');
        if (tb) tb.innerHTML = `<tr><td colspan="6">Please login</td></tr>`;
        return;
    }
    const tableBody = document.getElementById('dividend-table-body');
    if (!tableBody) return;

    try {
        let dividendRecords = [];
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                let query = supabase.from('dividend_records').select('*').eq('user_id', user.uid);
                if (portfolioId) query = query.eq('portfolio_id', portfolioId);
                const { data } = await query;
                if (data) dividendRecords = data;
            } catch (e) {
                console.warn('Supabase dividend fetch failed, trying Firebase...', e);
            }
        }

        if (dividendRecords.length === 0 && typeof db !== 'undefined') {
            try {
                let query = db.collection('dividend_records').where('userId', '==', user.uid);
                if (portfolioId) query = query.where('portfolioId', '==', portfolioId);
                const snapshot = await query.get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const parsedCreatedAt = safeParseDate(data.createdAt);
                    const parsedUpdatedAt = safeParseDate(data.updatedAt);
                    dividendRecords.push({
                        id: doc.id,
                        user_id: data.userId,
                        share_name: data.shareName,
                        stock_percent: data.stockPercent || 0,
                        cash_amount: data.cashAmount || 0,
                        portfolio_id: data.portfolioId || 'main',
                        created_at: parsedCreatedAt ? parsedCreatedAt.toISOString() : null,
                        updated_at: parsedUpdatedAt ? parsedUpdatedAt.toISOString() : null
                    });
                });
            } catch (e) {
                console.warn('Firebase dividend fetch failed', e);
            }
        }

        if (dividendRecords.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6">No dividend records found.</td></tr>`;
            return;
        }

        let portfolioData = [];
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                let query = supabase.from('portfolios').select('share_name, quantity, portfolio_id').eq('user_id', user.uid);
                if (portfolioId) query = query.eq('portfolio_id', portfolioId);
                const { data } = await query;
                if (data) portfolioData = data;
            } catch (e) { /* ignore */ }
        }
        if (portfolioData.length === 0 && typeof db !== 'undefined') {
            try {
                let query = db.collection('portfolios').where('userId', '==', user.uid);
                if (portfolioId) query = query.where('portfolioId', '==', portfolioId);
                const snap = await query.get();
                snap.forEach(doc => {
                    const data = doc.data();
                    portfolioData.push({ share_name: data.shareName, quantity: data.quantity, portfolio_id: data.portfolioId || 'main' });
                });
            } catch (e) { /* ignore */ }
        }

        const remainingQtyMap = new Map();
        portfolioData.forEach(item => {
            const ticker = item.share_name;
            const qty = item.quantity || 0;
            remainingQtyMap.set(ticker, (remainingQtyMap.get(ticker) || 0) + qty);
        });

        let html = '';
        for (const rec of dividendRecords) {
            const ticker = rec.share_name;
            const stockPercent = rec.stock_percent || 0;
            const cashAmount = rec.cash_amount || 0;
            const docId = rec.id;
            const remainingQty = remainingQtyMap.get(ticker) || 0;

            let avgBuyPrice = 0;
            const portfolioItems = portfolioData.filter(p => p.share_name === ticker);
            if (portfolioItems.length > 0) {
                let totalCost = 0, totalQty = 0;
                portfolioItems.forEach(p => {
                    totalCost += (p.quantity || 0) * (p.buy_price || 0);
                    totalQty += (p.quantity || 0);
                });
                avgBuyPrice = totalQty > 0 ? totalCost / totalQty : 0;
            }

            let totalDividendGain = 0, unrealizedGain = 0;
            if (remainingQty > 0 && avgBuyPrice > 0) {
                const stockGain = remainingQty * (stockPercent / 100) * avgBuyPrice;
                const cashGain = remainingQty * (cashAmount / 10);
                totalDividendGain = stockGain + cashGain;
                let currentPrice = currentPriceData.get(ticker) || avgBuyPrice;
                unrealizedGain = (currentPrice - avgBuyPrice) * remainingQty;
            }

            // ✅ escape — docId/ticker onclick attribute-এ বসার আগে
            const safeDocId = escapeHtmlDiv(docId);
            const safeTicker = escapeHtmlDiv(ticker);

            html += `<tr onclick="openDividendEditModal('${safeDocId}','${safeTicker}',${stockPercent},${cashAmount})">
                <td><b>${safeTicker}</b></td>
                <td>${stockPercent}%</td>
                <td>৳${cashAmount.toFixed(2)}</td>
                <td>${remainingQty > 0 ? `৳${totalDividendGain.toFixed(2)}` : '-'}</td>
                <td>${remainingQty > 0 ? `৳${unrealizedGain.toFixed(2)}` : '-'}</td>
                <td><button onclick="deleteDividendRecord('${safeDocId}', event)">Delete</button></td>
            </tr>`;
        }
        tableBody.innerHTML = html;
    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading data</td></tr>`;
    }
}

// ==========================================
// 🗑️ Delete — ✅ ফিক্স: user_id ownership চেক (IDOR প্রতিরোধ)
// ==========================================
window.deleteDividendRecord = async function(docId, event) {
    event.stopPropagation();
    if (!confirm('Delete?')) return;

    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }

    try {
        let deleted = false;

        // ---------- Supabase: user_id ফিল্টার সহ delete ----------
        if (typeof supabase !== 'undefined' && supabase) {
            const { error, data } = await supabase
                .from('dividend_records')
                .delete()
                .eq('id', docId)
                .eq('user_id', user.uid)   // ✅ শুধু নিজের রেকর্ড ডিলিট হবে
                .select();
            if (!error && data && data.length > 0) deleted = true;
        }

        // ---------- Firebase: delete-এর আগে ownership ভেরিফাই ----------
        if (typeof db !== 'undefined') {
            try {
                const docRef = db.collection('dividend_records').doc(docId);
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
            loadDividendData();
            if (typeof showToast === 'function') showToast('🗑️ Deleted successfully!', 'info');
        } else {
            if (typeof showToast === 'function') showToast('❌ Delete failed or record not found', 'error');
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('Delete failed', 'error');
    }
};

window.openDividendEditModal = function(docId, ticker, stockPercent, cashAmount) {
    currentEditingDividendId = docId;
    const searchInput = document.getElementById('div-search-ticker');
    const stockInput = document.getElementById('div-stock-percent');
    const cashInput = document.getElementById('div-cash-amount');
    if (searchInput) searchInput.value = ticker;
    if (stockInput) stockInput.value = stockPercent;
    if (cashInput) cashInput.value = cashAmount;
    const saveBtn = document.getElementById('btn-save-dividend');
    if (saveBtn) {
        saveBtn.innerHTML = '✏️ Update';
        saveBtn.style.background = '#f59e0b';
    }
    const suggestionBox = document.getElementById('div-suggestion-box');
    if (suggestionBox) suggestionBox.classList.add('hidden');
};

// ==========================================
// 💾 Save/Update — ✅ ফিক্স: edit path-এ user_id ownership চেক
// ==========================================
async function saveDividendData(ticker, stockPercent, cashAmount, editId = null, portfolioId = null) {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return false;
    }
    if (!ticker) {
        if (typeof showToast === 'function') showToast('Select share', 'warning');
        return false;
    }

    try {
        const data = {
            shareName: ticker,
            stockPercent: Number(stockPercent),
            cashAmount: Number(cashAmount),
            portfolioId: portfolioId || 'main'
        };

        if (editId) {
            let updated = false;

            // ---------- Supabase: user_id ফিল্টার সহ update ----------
            if (typeof supabase !== 'undefined' && supabase) {
                const { error, data: updData } = await supabase
                    .from('dividend_records')
                    .update({
                        stock_percent: Number(stockPercent),
                        cash_amount: Number(cashAmount),
                        portfolio_id: portfolioId || 'main',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editId)
                    .eq('user_id', user.uid)   // ✅ শুধু নিজের রেকর্ড আপডেট হবে
                    .select();
                if (!error && updData && updData.length > 0) updated = true;
            }

            // ---------- Firebase: update-এর আগে ownership ভেরিফাই ----------
            if (typeof db !== 'undefined') {
                try {
                    const docRef = db.collection('dividend_records').doc(editId);
                    const docSnap = await docRef.get();
                    if (docSnap.exists && docSnap.data().userId === user.uid) {
                        await docRef.update({
                            stockPercent: Number(stockPercent),
                            cashAmount: Number(cashAmount),
                            portfolioId: portfolioId || 'main',
                            updatedAt: new Date()
                        });
                        updated = true;
                    } else if (docSnap.exists) {
                        console.warn('⚠️ Ownership mismatch — update blocked client-side');
                    }
                } catch (e) {
                    console.warn('Firebase update check failed', e);
                }
            }

            if (!updated) {
                if (typeof showToast === 'function') showToast('❌ Update failed or record not found', 'error');
                return false;
            }
        } else {
            await saveDividendToBoth(user.uid, data);
        
        if (typeof window.invalidateAppDataCache === 'function') window.invalidateAppDataCache('dividend saved');}
        await loadDividendData(portfolioId);
        if (typeof showToast === 'function') showToast('✅ Dividend saved successfully!', 'success');
        return true;
    } catch (error) {
        console.error(error);
        if (typeof showToast === 'function') showToast('Error saving dividend', 'error');
        return false;
    }
}

// ডিভিডেন্ড সাজেশন
(function() {
    const divSearchInput = document.getElementById('div-search-ticker');
    const divSuggestionBox = document.getElementById('div-suggestion-box');
    if (divSearchInput && divSuggestionBox) {
        divSearchInput.addEventListener('input', () => {
            const query = divSearchInput.value.trim().toUpperCase();
            divSuggestionBox.innerHTML = '';
            if (!query) { divSuggestionBox.classList.add('hidden'); return; }
            const filtered = dseStocks.filter(stock => stock.startsWith(query));
            if (filtered.length > 0) {
                divSuggestionBox.classList.remove('hidden');
                filtered.forEach(stock => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion-item');
                    div.innerText = stock;
                    div.addEventListener('click', () => {
                        divSearchInput.value = stock;
                        divSuggestionBox.classList.add('hidden');
                    });
                    divSuggestionBox.appendChild(div);
                });
            } else divSuggestionBox.classList.add('hidden');
        });
        document.addEventListener('click', function(e) {
            if (divSearchInput && !divSearchInput.contains(e.target) && divSuggestionBox && !divSuggestionBox.contains(e.target)) {
                divSuggestionBox.classList.add('hidden');
            }
        });
    }

    const saveDividendBtn = document.getElementById('btn-save-dividend');
    if (saveDividendBtn) {
        saveDividendBtn.addEventListener('click', async () => {
            const ticker = document.getElementById('div-search-ticker')?.value.trim().toUpperCase() || '';
            const stockPercent = document.getElementById('div-stock-percent')?.value || 0;
            const cashAmount = document.getElementById('div-cash-amount')?.value || 0;
            const portfolioId = document.getElementById('dividend-portfolio-select')?.value || 'main';
            if (!ticker) {
                if (typeof showToast === 'function') showToast('Select share', 'warning');
                return;
            }
            const success = await saveDividendData(ticker, stockPercent, cashAmount, currentEditingDividendId, portfolioId);
            if (success) {
                const searchInput = document.getElementById('div-search-ticker');
                const stockInput = document.getElementById('div-stock-percent');
                const cashInput = document.getElementById('div-cash-amount');
                if (searchInput) searchInput.value = '';
                if (stockInput) stockInput.value = '0';
                if (cashInput) cashInput.value = '0';
                const saveBtn = document.getElementById('btn-save-dividend');
                if (saveBtn) {
                    saveBtn.innerHTML = '💾 Save';
                    saveBtn.style.background = '#10b981';
                }
                currentEditingDividendId = null;
                // রিলোড
                if (typeof loadDividendData === 'function') {
                    loadDividendData(portfolioId);
                }
                if (typeof loadDashboardData === 'function') {
                    loadDashboardData(portfolioId, true);
                }
            }
        });
    }
})();

// গ্লোবাল এক্সপোজ
window.loadDividendData = loadDividendData;
window.saveDividendData = saveDividendData;

console.log('✅ dividend.js v2 loaded (IDOR fix: user_id ownership check on delete/update)');
