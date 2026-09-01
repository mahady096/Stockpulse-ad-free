// ==========================================
// 📁 ui-helpers.js - UI হেলপার ও কোর ফাংশন
//    ui.js থেকে ভাগ করা (থিম, টোস্ট, সাইডবার, কমিশন, ব্যাকআপ, ডেটা মোড)
//    🔥 Database vs Live Data – দুই মোড সাপোর্ট
//    ✅ লগইন/সাইনআপ ফাংশনালিটি DOMContentLoaded-এর ভেতরে নেওয়া হয়েছে
//    🔔 ডেইলি সামারি শিডিউলার কল (scheduleDailySummary) যোগ করা হয়েছে
//    📡 Push Notification সেটআপ (FCM) যোগ করা হয়েছে
//    ⏰ ব্যাকগ্রাউন্ড প্রাইস অ্যালার্ট চেকার যোগ করা হয়েছে
// ==========================================

// ==========================================
// 📌 গ্লোবাল ভেরিয়েবল (core.js থেকে নেওয়া)
// ==========================================
// currentDataMode, isManualReloading, autoRefreshEnabled ইত্যাদি core.js-এ ডিফাইন

let priceAlertInterval = null;

// ==========================================
// ০. থিম ফাংশন (সবার আগে)
// ==========================================

function updateChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    if (window.dashboardChartInstance) {
        try {
            window.dashboardChartInstance.options.plugins.legend.labels.color = textColor;
            window.dashboardChartInstance.options.scales.x.ticks.color = textColor;
            window.dashboardChartInstance.options.scales.y.ticks.color = textColor;
            window.dashboardChartInstance.options.scales.x.grid.color = gridColor;
            window.dashboardChartInstance.options.scales.y.grid.color = gridColor;
            window.dashboardChartInstance.update();
        } catch (e) { /* ignore */ }
    }
    if (window.advChartInstance) {
        try {
            window.advChartInstance.options.plugins.legend.labels.color = textColor;
            window.advChartInstance.options.scales.x.ticks.color = textColor;
            window.advChartInstance.options.scales.y.ticks.color = textColor;
            window.advChartInstance.options.scales.x.grid.color = gridColor;
            window.advChartInstance.options.scales.y.grid.color = gridColor;
            window.advChartInstance.update();
        } catch (e) { /* ignore */ }
    }
    if (window.rsiChartInstance) {
        try {
            window.rsiChartInstance.options.plugins.legend.labels.color = textColor;
            window.rsiChartInstance.options.scales.x.ticks.color = textColor;
            window.rsiChartInstance.options.scales.y.ticks.color = textColor;
            window.rsiChartInstance.options.scales.x.grid.color = gridColor;
            window.rsiChartInstance.options.scales.y.grid.color = gridColor;
            window.rsiChartInstance.update();
        } catch (e) { /* ignore */ }
    }
    if (window.gainChartInstance) {
        try {
            window.gainChartInstance.options.plugins.legend.labels.color = textColor;
            window.gainChartInstance.options.scales.x.ticks.color = textColor;
            window.gainChartInstance.options.scales.y.ticks.color = textColor;
            window.gainChartInstance.options.scales.x.grid.color = gridColor;
            window.gainChartInstance.options.scales.y.grid.color = gridColor;
            window.gainChartInstance.update();
        } catch (e) { /* ignore */ }
    }
}

window.toggleDarkMode = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('theme', newTheme); } catch(e) {}
    
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    if (text) text.textContent = newTheme === 'dark' ? 'Light' : 'Dark';
    
    if (typeof updateChartColors === 'function') updateChartColors();
};

window.loadSavedTheme = function() {
    let theme = 'light';
    try {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = saved || (prefersDark ? 'dark' : 'light');
    } catch (e) { /* ignore */ }
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (text) text.textContent = theme === 'dark' ? 'Light' : 'Dark';
};

function watchSystemTheme() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            const newTheme = e.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            const button = document.getElementById('theme-toggle');
            if (button) button.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        }
    });
}

// ==========================================
// ১. Production confirmation modal
// ==========================================
window.showConfirmModal = function({ title = 'Confirm', icon = '🧾', body = '', confirmText = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('app-confirm-modal');
        const titleEl = document.getElementById('app-confirm-title');
        const iconEl = document.getElementById('app-confirm-icon');
        const bodyEl = document.getElementById('app-confirm-body');
        const okBtn = document.getElementById('app-confirm-ok');
        const cancelBtn = document.getElementById('app-confirm-cancel');
        if (!modal || !titleEl || !bodyEl || !okBtn || !cancelBtn) {
            resolve(window.confirm(title));
            return;
        }
        iconEl.textContent = icon;
        titleEl.textContent = title;
        bodyEl.innerHTML = body;
        okBtn.textContent = confirmText;
        okBtn.classList.toggle('danger', !!danger);
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onBackdrop = (e) => { if (e.target === modal) finish(false); };
        const onKey = (e) => {
            if (e.key === 'Escape') finish(false);
            if (e.key === 'Enter') finish(true);
        };
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);
        setTimeout(() => okBtn.focus(), 0);
    });
};

// ==========================================
// ২. টোস্ট
// ==========================================

window.showToast = function(message, type = 'info') {
    const toast = document.createElement('div');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const bgColors = { 
        success: '#10b981', 
        error: '#ef4444', 
        warning: '#f59e0b', 
        info: '#3b82f6' 
    };
    const bgColor = bgColors[type] || '#3b82f6';
    const icon = icons[type] || 'ℹ️';
    
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 14px 24px;
        background: ${bgColor};
        color: white;
        border-radius: 12px;
        z-index: 100000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        animation: slideDown 0.3s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 90%;
        border: 1px solid rgba(255,255,255,0.1);
    `;
    toast.innerHTML = `<span style="font-size:18px;">${icon}</span> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        }
    }, 3000);
};

// ==========================================
// ২. সাইডবার ও ট্যাব
// ==========================================

window.toggleLeftSidebar = function() {
    const sidebar = document.getElementById('left-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;
    const isOpen = sidebar.classList.contains('active');
    if (isOpen) {
        sidebar.classList.remove('active');
        overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    } else {
        sidebar.classList.add('active');
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
};

window.toggleRightSidebar = function() {
    const rightSidebar = document.getElementById('right-sidebar');
    if (rightSidebar) rightSidebar.classList.toggle('active');
};

window.switchTab = function(tabName) {
    // 🔒 Smart Signals / Deep Analysis are Pro-only.
    const proTabs = new Set(['smart-signals', 'deep-analysis']);
    if (proTabs.has(tabName) && window.StockPulsePlan && !window.StockPulsePlan.isPro()) {
        window.location.href = 'pro.html';
        return;
    }

    // 🧹 ১. সব ইন্টারভাল ক্লিয়ার করুন
    if (window.portfolioAnalysisInterval) {
        clearInterval(window.portfolioAnalysisInterval);
        window.portfolioAnalysisInterval = null;
    }
    if (window.stockTableRefreshInterval) {
        clearInterval(window.stockTableRefreshInterval);
        window.stockTableRefreshInterval = null;
    }
    if (window.autoRefreshInterval) {
        clearInterval(window.autoRefreshInterval);
        window.autoRefreshInterval = null;
    }
    if (window.dataRefreshInterval) {
        clearInterval(window.dataRefreshInterval);
        window.dataRefreshInterval = null;
    }

    // 📑 ট্যাব কন্টেন্ট লুকান
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.add('hidden'));

    // 🎯 মেনু আইটেম থেকে অ্যাক্টিভ ক্লাস রিমুভ
    const menuItems = document.querySelectorAll('.left-sidebar ul li');
    menuItems.forEach(item => item.classList.remove('active'));

    // 🟢 নির্দিষ্ট ট্যাব দেখান
    const activeSection = document.getElementById(`sec-${tabName}`);
    if (activeSection) {
        activeSection.classList.remove('hidden');
    } else {
        console.warn(`⚠️ Tab section #sec-${tabName} not found`);
    }

    // 📌 মেনু আইটেম অ্যাক্টিভ করুন (যদি event থেকে আসে)
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }

    // 👤 ইউজার চেক
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        console.log('👤 No user logged in, skipping data load');
        return;
    }

    // ⏳ ডেটা লোড (সব ট্যাবের জন্য)
    setTimeout(() => {
        try {
            switch (tabName) {
                case 'dashboard':
                    if (typeof loadDashboardData === 'function') {
                        const portfolioId = window.currentDashboardPortfolioId || null;
                        loadDashboardData(portfolioId, true);
                    } else {
                        console.warn('⚠️ loadDashboardData not found');
                    }
                    break;
                case 'portfolio-analysis':
                    if (typeof loadPortfolioAnalysisTable === 'function') {
                        loadPortfolioAnalysisTable(user.uid, null, true);
                    } else {
                        console.warn('⚠️ loadPortfolioAnalysisTable not found');
                    }
                    break;
                case 'buy':
                    // Buy ট্যাবে কোনো অটো লোড নেই
                    break;
                case 'sell':
                    // Sell ট্যাবে কোনো অটো লোড নেই
                    break;
                case 'table':
                    if (typeof loadUnifiedStockTable === 'function') {
                        const pid = document.getElementById('stock-table-portfolio-select')?.value || null;
                        loadUnifiedStockTable(user.uid, pid === 'grand' ? null : pid);
                    } else {
                        console.warn('⚠️ loadUnifiedStockTable not found');
                    }
                    break;
                case 'trade-history':
                    if (typeof loadTradeHistory === 'function') {
                        loadTradeHistory();
                    } else {
                        console.warn('⚠️ loadTradeHistory not found');
                    }
                    break;
                case 'analysis':
                    // ইউজার সার্চ করবে
                    break;
                case 'statement':
                    if (typeof loadStatementData === 'function') {
                        loadStatementData();
                    } else {
                        console.warn('⚠️ loadStatementData not found');
                    }
                    break;
                case 'suggestion':
                    const threshold = document.getElementById('suggestion-threshold')?.value || 50;
                    const sugPid = document.getElementById('suggestion-portfolio-select')?.value || null;
                    if (typeof loadSuggestionData === 'function') {
                        loadSuggestionData(parseFloat(threshold), sugPid === 'grand' ? null : sugPid);
                    } else {
                        console.warn('⚠️ loadSuggestionData not found');
                    }
                    break;
                case 'dividend':
                    const divPid = document.getElementById('dividend-portfolio-select')?.value || null;
                    if (typeof loadDividendData === 'function') {
                        loadDividendData(divPid === 'grand' ? null : divPid);
                    } else {
                        console.warn('⚠️ loadDividendData not found');
                    }
                    break;
                case 'history':
                    if (typeof loadPortfolioHistory === 'function') {
                        loadPortfolioHistory();
                    } else {
                        console.warn('⚠️ loadPortfolioHistory not found');
                    }
                    break;
                case 'screener':
                    if (typeof loadScreenerData === 'function') {
                        const scrPid = document.getElementById('screener-portfolio-select')?.value || null;
                        loadScreenerData('buy', scrPid === 'grand' ? null : scrPid);
                    } else {
                        console.warn('⚠️ loadScreenerData not found');
                        const tbody = document.getElementById('screener-table-body');
                        if (tbody) {
                            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">Screener module not loaded. Please refresh.</td></tr>`;
                        }
                    }
                    break;
                case 'all-scanner':
                    if (typeof loadAllScannerPage === 'function') {
                        loadAllScannerPage();
                    } else {
                        console.warn('⚠️ loadAllScannerPage not found');
                        const buyBody = document.getElementById('all-scanner-buy-body');
                        if (buyBody) {
                            buyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:red;">Scanner module not loaded.</td></tr>`;
                        }
                    }
                    break;
                case 'rsi-indicator':
                    if (typeof loadRSIIndicatorPage === 'function') {
                        loadRSIIndicatorPage();
                    } else {
                        console.warn('⚠️ loadRSIIndicatorPage not found');
                        const buyBody = document.getElementById('rsi-buy-body');
                        if (buyBody) {
                            buyBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:red;">RSI module not loaded.</td></tr>`;
                        }
                    }
                    break;
                case 'smart-signals':
                    if (typeof loadSmartSignalsPage === 'function') {
                        loadSmartSignalsPage();
                    } else {
                        console.warn('⚠️ loadSmartSignalsPage not found');
                        const tbody = document.getElementById('smart-signals-tbody');
                        if (tbody) {
                            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:red;">Smart Signals module not loaded.</td></tr>`;
                        }
                    }
                    break;
                case 'market-watch':
                    if (typeof loadMarketWatchPage === 'function') {
                        loadMarketWatchPage();
                    } else {
                        console.warn('⚠️ loadMarketWatchPage not found');
                        const container = document.getElementById('market-watchlist-container');
                        if (container) {
                            container.innerHTML = `<div style="text-align:center; padding:40px; color:red;">Market Watch module not loaded.</div>`;
                        }
                    }
                    break;
                case 'deep-analysis':
                    if (typeof loadDeepAnalysisPage === 'function') {
                        const daPid = document.getElementById('deep-analysis-portfolio-select')?.value || null;
                        window._deepAnalysisPortfolio = daPid === 'grand' ? null : daPid;
                        loadDeepAnalysisPage();
                    } else {
                        console.warn('⚠️ loadDeepAnalysisPage not found');
                        const tbody = document.getElementById('deep-analysis-tbody');
                        if (tbody) {
                            tbody.innerHTML = `<tr><td colspan="21" style="text-align:center; padding:40px; color:red;">Deep Analysis module not loaded.</td></tr>`;
                        }
                    }
                    break;
                case 'record-date':
                    if (typeof loadRecordDateSection === 'function') {
                        loadRecordDateSection();
                    } else {
                        console.warn('⚠️ loadRecordDateSection not found');
                        const tbody = document.getElementById('sec-record-date-tbody');
                        if (tbody) {
                            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:red;">Record Date module not loaded.</td></tr>`;
                        }
                    }
                    break;
                default:
                    console.log(`ℹ️ Tab "${tabName}" loaded (no specific data load)`);
                    break;
            }
        } catch (error) {
            console.error(`❌ Error loading tab "${tabName}":`, error);
            if (typeof showToast === 'function') {
                showToast(`Error loading ${tabName}: ${error.message}`, 'error');
            }
        }
    }, 300);
};

// ==========================================
// ৩. কমিশন সেটিংস
// ==========================================

window.toggleCommissionSettings = function() {
    const panel = document.getElementById('commission-panel');
    if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
};

window.saveCommissionSettings = function() {
    const percentInput = document.getElementById('commission-percent');
    const percent = parseFloat(percentInput?.value) || 0;
    if (typeof commissionManager !== 'undefined' && commissionManager) {
        commissionManager.updatePercent(percent);
    }
    if (typeof showToast === 'function') showToast(`Commission set to ${percent}% for both Buy & Sell`, 'success');
    if (auth && auth.currentUser) {
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadUnifiedStockTable === 'function') loadUnifiedStockTable(auth.currentUser.uid);
        if (typeof loadPortfolioAnalysisTable === 'function') loadPortfolioAnalysisTable(auth.currentUser.uid);
    }
    const panel = document.getElementById('commission-panel');
    if (panel) panel.style.display = 'none';
};

window.resetCommissionSettings = function() {
    if (typeof commissionManager !== 'undefined' && commissionManager) {
        commissionManager.updatePercent(0);
    }
    const percentInput = document.getElementById('commission-percent');
    if (percentInput) percentInput.value = 0;
    if (typeof showToast === 'function') showToast('Commission reset to 0%', 'info');
    if (auth && auth.currentUser) {
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadUnifiedStockTable === 'function') loadUnifiedStockTable(auth.currentUser.uid);
        if (typeof loadPortfolioAnalysisTable === 'function') loadPortfolioAnalysisTable(auth.currentUser.uid);
    }
    const panel = document.getElementById('commission-panel');
    if (panel) panel.style.display = 'none';
};

function updateCommissionDisplay() {
    const percent = (typeof commissionManager !== 'undefined' && commissionManager) ? commissionManager.getPercent() : 0;
    let infoDiv = document.getElementById('commission-info-display');
    if (!infoDiv) {
        const dashboardSection = document.getElementById('sec-dashboard');
        if (dashboardSection) {
            const cardsDiv = dashboardSection.querySelector('.portfolio-summary-cards');
            if (cardsDiv) {
                infoDiv = document.createElement('div');
                infoDiv.id = 'commission-info-display';
                infoDiv.className = 'commission-info-bar';
                cardsDiv.insertAdjacentElement('afterend', infoDiv);
            }
        }
    }
    if (infoDiv) {
        infoDiv.innerHTML = percent > 0 ?
            `<span>💸 Commission Active</span><span class="commission-badge">${percent}% on Buy & Sell</span>` :
            `<span>💸 No Commission</span><span class="commission-badge">0%</span>`;
        infoDiv.style.display = 'flex';
    }
}
setTimeout(updateCommissionDisplay, 500);

// ==========================================
// ৪. ড্যাশবোর্ড সার্চ
// ==========================================

window.initDashboardSearch = function() {
    const searchInput = document.getElementById('dashboard-search-input');
    const suggestionsBox = document.getElementById('dashboard-search-suggestions');
    
    if (!searchInput) { console.error('❌ Input missing'); return; }
    if (!suggestionsBox) { console.error('❌ Suggestions box missing'); return; }

    let stockList = [];
    if (typeof dseStocks !== 'undefined') stockList = dseStocks;
    else if (window.dseStocks) stockList = window.dseStocks;
    else { console.error('❌ No stock list'); return; }

    const debouncedSearch = debounce(function(query) {
        suggestionsBox.innerHTML = '';
        if (!query) { suggestionsBox.classList.add('hidden'); return; }
        const filtered = stockList.filter(s => s.startsWith(query));
        if (filtered.length > 0) {
            suggestionsBox.classList.remove('hidden');
            filtered.slice(0, 15).forEach(stock => {
                const div = document.createElement('div');
                div.classList.add('suggestion-item');
                div.innerText = stock;
                div.addEventListener('click', function() {
                    searchInput.value = stock;
                    suggestionsBox.classList.add('hidden');
                    if (typeof openStockDetailModal === 'function') openStockDetailModal(stock);
                });
                suggestionsBox.appendChild(div);
            });
        } else {
            suggestionsBox.classList.add('hidden');
        }
    }, 300);

    searchInput.addEventListener('input', function() {
        debouncedSearch(this.value.trim().toUpperCase());
    });

    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.add('hidden');
        }
    });

    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const first = suggestionsBox.querySelector('.suggestion-item');
            if (first) first.click();
        }
    });
};

// ==========================================
// ৫. ব্যাকআপ/রিস্টোর
// ==========================================

window.downloadPortfolioData = async function() {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) { 
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    if (!confirm("আপনার পোর্টফোলিও ডাটা ব্যাকআপ ডাউনলোড করতে চান?")) return;
    const loadingBtn = document.getElementById('btn-download-data');
    const originalText = loadingBtn ? loadingBtn.innerText : "ডাউনলোড";
    if (loadingBtn) { loadingBtn.innerText = "⏳ লোড হচ্ছে..."; loadingBtn.disabled = true; }
    try {
        if (typeof db === 'undefined') { 
            if (typeof showToast === 'function') showToast('Firebase not available', 'error');
            return;
        }
        const buySnapshot = await db.collection('portfolios').where('userId', '==', user.uid).get();
        const sellSnapshot = await db.collection('sales_history').where('userId', '==', user.uid).get();
        const buyData = [];
        buySnapshot.forEach(doc => {
            const d = doc.data();
            buyData.push({
                shareName: d.shareName,
                quantity: d.quantity,
                buyPrice: d.buyPrice,
                date: d.date?.toDate?.().toISOString() || new Date().toISOString(),
                type: "BUY"
            });
        });
        const sellData = [];
        sellSnapshot.forEach(doc => {
            const d = doc.data();
            sellData.push({
                shareName: d.shareName,
                quantitySold: d.quantitySold,
                sellPrice: d.sellPrice,
                buyPrice: d.buyPrice,
                profitOrLoss: d.profitOrLoss,
                date: d.date?.toDate?.().toISOString() || new Date().toISOString()
            });
        });
        const backupData = {
            version: "1.1",
            downloadedAt: new Date().toISOString(),
            buyTransactions: buyData,
            sellTransactions: sellData
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        if (typeof showToast === 'function') {
            showToast(`✅ ${buyData.length + sellData.length} records downloaded!`, 'success');
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('Backup failed', 'error');
    } finally {
        if (loadingBtn) {
            loadingBtn.innerText = originalText;
            loadingBtn.disabled = false;
        }
    }
};

window.uploadPortfolioData = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    if (!confirm("ফাইল আপলোড করবেন?")) { event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.buyTransactions || !data.sellTransactions) throw new Error("ভুল ফাইল ফরম্যাট!");
            if (typeof db === 'undefined') {
                if (typeof showToast === 'function') showToast('Firebase not available', 'error');
                return;
            }
            const batch = db.batch();
            data.buyTransactions.forEach(item => {
                if (item.shareName) batch.set(db.collection('portfolios').doc(), {
                    userId: user.uid,
                    shareName: item.shareName,
                    quantity: Number(item.quantity),
                    buyPrice: Number(item.buyPrice),
                    type: "BUY",
                    date: new Date(item.date),
                    createdAt: new Date()
                });
            });
            data.sellTransactions.forEach(item => {
                if (item.shareName) batch.set(db.collection('sales_history').doc(), {
                    userId: user.uid,
                    shareName: item.shareName,
                    quantitySold: Number(item.quantitySold),
                    sellPrice: Number(item.sellPrice),
                    buyPrice: Number(item.buyPrice),
                    profitOrLoss: Number(item.profitOrLoss),
                    date: new Date(item.date),
                    createdAt: new Date()
                });
            });
            await batch.commit();
            if (typeof showToast === 'function') showToast('✅ Data restored successfully!', 'success');
            location.reload();
        } catch (err) {
            console.error(err);
            if (typeof showToast === 'function') showToast('❌ Upload failed: ' + err.message, 'error');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
};

// ==========================================
// ৬. ফ্লোটিং লোডার
// ==========================================

window.showFloatingLoader = function(text = 'Loading...', subText = 'Please wait') {
    const loader = document.getElementById('floating-loader');
    const overlay = document.getElementById('loader-overlay');
    const statusText = document.getElementById('loader-status-text');
    const subTextEl = document.getElementById('loader-sub-text');
    if (loader) {
        loader.style.display = 'flex';
        if (statusText) statusText.innerText = text;
        if (subTextEl) subTextEl.innerText = subText;
    }
    if (overlay) overlay.style.display = 'block';
};

window.hideFloatingLoader = function() {
    const loader = document.getElementById('floating-loader');
    const overlay = document.getElementById('loader-overlay');
    if (loader) loader.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
};

// ==========================================
// ৭. স্ক্রিনার ড্রপডাউন টগল
// ==========================================

window.toggleScreenerDropdown = function() {
    const dropdown = document.getElementById('screener-dropdown');
    const arrow = document.getElementById('screener-arrow');
    if (!dropdown) return;
    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'block';
        if (arrow) arrow.textContent = '▼';
    } else {
        dropdown.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
};

// ==========================================
// ৮. পোর্টফোলিও ডিলিট কনফার্ম
// ==========================================

window.confirmAndDeletePortfolio = async function() {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    const firstCheck = confirm("সতর্কতা! আপনি কি আপনার পোর্টফোলিওর সমস্ত বাই (BUY) এবং সেল (SELL) হিস্ট্রি চিরতরে মুছে ফেলতে চান?");
    if (!firstCheck) return;
    const secondCheck = confirm("আপনি কিন্তু এই ডাটা আর কখনো ফিরে পাবেন না! আপনি কি আসলেই সম্পূর্ণ পোর্টফোলিও ডিলিট করতে নিশ্চিত?");
    if (!secondCheck) return;
    try {
        if (typeof db === 'undefined') {
            if (typeof showToast === 'function') showToast('Firebase not available', 'error');
            return;
        }
        if (typeof showToast === 'function') showToast('⏳ Deleting portfolio...', 'info');
        const buySnapshot = await db.collection("portfolios").where("userId", "==", user.uid).get();
        const sellSnapshot = await db.collection("sales_history").where("userId", "==", user.uid).get();
        const batch = db.batch();
        buySnapshot.forEach(doc => batch.delete(db.collection("portfolios").doc(doc.id)));
        sellSnapshot.forEach(doc => batch.delete(db.collection("sales_history").doc(doc.id)));
        await batch.commit();
        if (typeof showToast === 'function') showToast('✅ Portfolio deleted successfully!', 'success');
        window.location.reload();
    } catch (error) {
        console.error(error);
        if (typeof showToast === 'function') showToast('❌ Failed to delete portfolio', 'error');
    }
};

// ==========================================
// ৯. ডেটা মোড সুইচ (Database vs Live API)
// ==========================================

// currentDataMode core.js থেকে গ্লোবালি ডিফাইন
async function setDatabaseMode() {
    try {
        if (currentDataMode === 'database') return;
        currentDataMode = 'database';
        window.currentDataMode = 'database';
        localStorage.setItem('dataMode', 'database');
        if (typeof showToast === 'function') showToast('💾 Switching to Database Mode...', 'info');
        // UI আপডেট
        const dbBtn = document.getElementById('btn-database-mode');
        const liveBtn = document.getElementById('btn-live-mode');
        if (dbBtn) {
            dbBtn.classList.add('active');
            dbBtn.style.background = 'var(--primary-color)';
            dbBtn.style.color = 'white';
            dbBtn.disabled = false;
        }
        if (liveBtn) {
            liveBtn.classList.remove('active');
            liveBtn.style.background = 'transparent';
            liveBtn.style.color = 'var(--text-primary)';
            liveBtn.disabled = false;
        }
        const user = auth?.currentUser;
        if (user) {
            if (typeof loadDashboardData === 'function') await loadDashboardData(null, true);
            if (typeof loadUnifiedStockTable === 'function') await loadUnifiedStockTable(user.uid);
            if (typeof loadPortfolioAnalysisTable === 'function') await loadPortfolioAnalysisTable(user.uid, null, true);
            if (typeof showToast === 'function') showToast('✅ Database mode activated', 'success');
        }
    } catch (error) {
        console.error('Database mode error:', error);
        if (typeof showToast === 'function') showToast('❌ Failed to switch: ' + error.message, 'error');
    } finally {
        const liveBtn = document.getElementById('btn-live-mode');
        const dbBtn = document.getElementById('btn-database-mode');
        if (liveBtn) liveBtn.disabled = false;
        if (dbBtn) dbBtn.disabled = false;
    }
}

// ==========================================
// 📡 লাইভ মোডে সুইচ (সম্পূর্ণ আপডেটেড)
// ==========================================
async function setLiveDataMode() {
    try {
        if (currentDataMode === 'live') {
            console.log('ℹ️ Already in Live mode.');
            return;
        }

        console.log('🔵 Switching to Live mode...');
        currentDataMode = 'live';
        window.currentDataMode = 'live';
        localStorage.setItem('dataMode', 'live');

        const dbBtn = document.getElementById('btn-database-mode');
        const liveBtn = document.getElementById('btn-live-mode');

        if (liveBtn) {
            liveBtn.classList.add('active');
            liveBtn.style.background = 'var(--primary-color)';
            liveBtn.style.color = 'white';
            liveBtn.disabled = false;
        }
        if (dbBtn) {
            dbBtn.classList.remove('active');
            dbBtn.style.background = 'transparent';
            dbBtn.style.color = 'var(--text-primary)';
            dbBtn.disabled = false;
        }

        if (typeof showToast === 'function') {
            showToast('📡 Switching to Live Data (API)...', 'info');
        }

        const user = auth?.currentUser;
        if (user) {
            await loadLiveDashboardData();
            await loadLiveStockTable();
            await loadLivePortfolioAnalysis();
            if (typeof showToast === 'function') {
                showToast('✅ Live mode activated successfully!', 'success');
            }
        } else {
            if (typeof showToast === 'function') {
                showToast('⚠️ No user logged in.', 'warning');
            }
        }
    } catch (error) {
        console.error('❌ Live mode error:', error);
        if (typeof showToast === 'function') {
            showToast('❌ Failed to switch: ' + error.message, 'error');
        }
    } finally {
        const liveBtn = document.getElementById('btn-live-mode');
        const dbBtn = document.getElementById('btn-database-mode');
        if (liveBtn) liveBtn.disabled = false;
        if (dbBtn) dbBtn.disabled = false;
        console.log('✅ Buttons re-enabled in finally block.');
    }
}

// ==========================================
// 📡 লাইভ ডেটা লোডার ফাংশন (API থেকে)
// ==========================================

async function loadLiveDashboardData() {
    const user = auth && auth.currentUser;
    if (!user) return;
    
    try {
        const allStocks = await fetchAllLatestStocks();
        if (!allStocks || allStocks.length === 0) {
            if (typeof showToast === 'function') showToast('No live data available', 'error');
            return;
        }
        
        const unifiedData = await unifiedEngine.calculate(user.uid, null, true);
        if (!unifiedData || unifiedData.stockDetails.length === 0) {
            if (typeof showToast === 'function') showToast('No holdings found', 'warning');
            return;
        }
        
        const priceMap = new Map();
        allStocks.forEach(item => {
            const ticker = item['TRADING CODE'];
            const ltp = parseFloat(item['LTP*']) || 0;
            const ycp = parseFloat(item['YCP*']) || ltp;
            priceMap.set(ticker, { currentPrice: ltp, prevClose: ycp });
        });
        
        let totalCurrentValue = 0, totalInvestment = 0, dailyGL = 0;
        for (const stock of unifiedData.stockDetails) {
            const priceData = priceMap.get(stock.ticker);
            const currentPrice = priceData?.currentPrice || stock.avgBuyPriceWithCommission;
            const prevPrice = priceData?.prevClose || currentPrice;
            const qty = stock.totalQty || 0;
            totalCurrentValue += qty * currentPrice;
            totalInvestment += stock.totalCost || 0;
            dailyGL += qty * (currentPrice - prevPrice);
        }
        const totalProfitLoss = totalCurrentValue - totalInvestment;
        
        if (typeof updateDashboardCards === 'function') {
            updateDashboardCards({
                totalCurrentValue,
                totalInvestment,
                totalProfitLoss,
                dailyGL,
                dailyPct: totalInvestment > 0 ? (dailyGL / totalInvestment) * 100 : 0
            });
        }
        
        if (typeof updateDSEXIndicator === 'function') {
            const dsexSpan = document.getElementById('dsex-value');
            if (dsexSpan) dsexSpan.innerText = '--';
        }
        
        if (typeof showToast === 'function') showToast('✅ Live dashboard updated!', 'success');
        
    } catch (error) {
        console.error('Live dashboard error:', error);
        if (typeof showToast === 'function') showToast('Error loading live data', 'error');
    }
}

async function loadLiveStockTable() {
    const user = auth && auth.currentUser;
    if (!user) return;
    
    try {
        const allStocks = await fetchAllLatestStocks();
        if (!allStocks) return;
        
        const priceMap = new Map();
        allStocks.forEach(item => {
            const ticker = item['TRADING CODE'];
            const ltp = parseFloat(item['LTP*']) || 0;
            const ycp = parseFloat(item['YCP*']) || ltp;
            priceMap.set(ticker, { currentPrice: ltp, prevClose: ycp });
        });
        
        const unifiedData = await unifiedEngine.calculate(user.uid, null, true);
        if (!unifiedData || unifiedData.stockDetails.length === 0) {
            const tbody = document.getElementById('portfolio-table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="12">No holdings found.</td></tr>`;
            return;
        }
        
        renderLiveStockTable(unifiedData, priceMap);
        
    } catch (error) {
        console.error('Live stock table error:', error);
    }
}

async function loadLivePortfolioAnalysis() {
    const user = auth && auth.currentUser;
    if (!user) return;
    try {
        if (typeof loadPortfolioAnalysisTable === 'function') {
            await loadPortfolioAnalysisTable(user.uid, null, true);
        }
    } catch (error) {
        console.error('Live portfolio analysis error:', error);
    }
}

// ==========================================
// 🎨 রেন্ডার লাইভ স্টক টেবিল (হেলপার)
// ==========================================
function renderLiveStockTable(unifiedData, priceMap) {
    const tbody = document.getElementById('portfolio-table-body');
    if (!tbody) return;
    
    let html = '';
    let grandTotalBuyQty = 0, grandTotalRemainingQty = 0, grandTotalInvestment = 0;
    let grandTotalCurrentValue = 0, grandTotalUnrealized = 0, grandTotalDailyGL = 0;
    
    for (const stock of unifiedData.stockDetails) {
        const ticker = stock.ticker;
        const priceData = priceMap.get(ticker);
        const currentPrice = priceData?.currentPrice || 0;
        const prevClose = priceData?.prevClose || currentPrice;
        const qty = stock.totalQty || 0;
        const avgBuy = stock.avgBuyPriceWithCommission || 0;
        const totalCost = stock.totalCost || 0;
        const currentValue = qty * currentPrice;
        const unrealized = currentValue - totalCost;
        const dailyGL = qty * (currentPrice - prevClose);
        const dailyChangePercent = prevClose > 0 ? (dailyGL / (qty * prevClose)) * 100 : 0;
        
        grandTotalBuyQty += stock.totalBuyQty || 0;
        grandTotalRemainingQty += qty;
        grandTotalInvestment += totalCost;
        grandTotalCurrentValue += currentValue;
        grandTotalUnrealized += unrealized;
        grandTotalDailyGL += dailyGL;
        
        html += `<tr onclick="navigateToAnalysis('${ticker}')">`;
        html += `<td><b>${ticker}</b></td>`;
        html += `<td>${stock.totalBuyQty || 0}</td>`;
        html += `<td>৳${avgBuy.toFixed(2)}</td>`;
        html += `<td>${qty}</td>`;
        html += `<td>${qty > 0 ? `৳${currentPrice.toFixed(2)}` : '-'}</td>`;
        html += `<td>${qty > 0 ? `৳${unrealized.toFixed(2)}` : '-'}</td>`;
        html += `<td>${qty > 0 ? `${((unrealized/totalCost)*100).toFixed(2)}%` : '-'}</td>`;
        html += `<td>-</td>`;
        html += `<td>-</td>`;
        html += `<td>-</td>`;
        html += `<td style="color: ${dailyChangePercent >= 0 ? '#10b981' : '#ef4444'};">${dailyChangePercent >= 0 ? '+' : ''}${dailyChangePercent.toFixed(2)}%</td>`;
        html += `<td style="color: ${dailyGL >= 0 ? '#10b981' : '#ef4444'};">${dailyGL >= 0 ? '+' : ''}৳${dailyGL.toFixed(2)}</td>`;
        html += `</tr>`;
    }
    
    // ফুটার
    html += `<tr style="font-weight:bold; border-top:2px solid;">`;
    html += `<td><b>📊 TOTAL</b></td>`;
    html += `<td><b>${grandTotalBuyQty}</b></td>`;
    html += `<td>-</td>`;
    html += `<td><b>${grandTotalRemainingQty}</b></td>`;
    html += `<td><b>৳${grandTotalCurrentValue.toLocaleString()}</b></td>`;
    html += `<td><b>${grandTotalUnrealized >= 0 ? '+' : ''}৳${grandTotalUnrealized.toLocaleString()}</b></td>`;
    html += `<td><b>${grandTotalInvestment > 0 ? ((grandTotalUnrealized / grandTotalInvestment) * 100).toFixed(2) : '0'}%</b></td>`;
    html += `<td>-</td>`;
    html += `<td>-</td>`;
    html += `<td>-</td>`;
    html += `<td><b>${grandTotalInvestment > 0 ? ((grandTotalDailyGL / grandTotalInvestment) * 100).toFixed(2) : '0'}%</b></td>`;
    html += `<td><b>${grandTotalDailyGL >= 0 ? '+' : ''}৳${grandTotalDailyGL.toLocaleString()}</b></td>`;
    html += `</tr>`;
    
    tbody.innerHTML = html;
    
    if (typeof updateFooterCards === 'function') {
        updateFooterCards(grandTotalInvestment, grandTotalCurrentValue, grandTotalUnrealized, 0, grandTotalRemainingQty);
    }
}

// গ্লোবালি এক্সপোজ (ডেটা মোড ফাংশন)
window.setDatabaseMode = setDatabaseMode;
window.setLiveDataMode = setLiveDataMode;
window.loadLiveDashboardData = loadLiveDashboardData;

// ==========================================
// ১০. 🔥 লগইন/সাইনআপ UI (DOMContentLoaded-এর ভেতরে)
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    // ---- থিম লোড ----
    if (typeof loadSavedTheme === 'function') loadSavedTheme();
    watchSystemTheme();

    // ---- ডেটা মোড বাটন ----
    const dbBtn = document.getElementById('btn-database-mode');
    const liveBtn = document.getElementById('btn-live-mode');
    if (dbBtn) dbBtn.addEventListener('click', setDatabaseMode);
    if (liveBtn) liveBtn.addEventListener('click', setLiveDataMode);

    // লোকাল স্টোরেজ থেকে মোড রিস্টোর
    const savedMode = localStorage.getItem('dataMode') || 'database';
    if (savedMode === 'live') {
        setTimeout(() => setLiveDataMode(), 100);
    } else {
        setTimeout(() => setDatabaseMode(), 100);
    }

    // ---- কমিশন ডিসপ্লে ----
    setTimeout(updateCommissionDisplay, 500);

    // ==========================================
    // 🔐 লগইন/সাইনআপ ইভেন্ট লিসেনার
    // ==========================================
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const btnLogin = document.getElementById('btn-login');
    const btnSignup = document.getElementById('btn-signup');
    const btnLogout = document.getElementById('btn-logout');
    const authError = document.getElementById('auth-error');
    const authTitle = document.getElementById('auth-title');
    const toggleAuthText = document.getElementById('toggle-auth-text');
    let isLoginMode = true;

    // টগল টেক্সট
    if (toggleAuthText) {
        toggleAuthText.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            if (authError) authError.innerText = "";
            if (isLoginMode) {
                if (authTitle) authTitle.innerText = "Portfolio Login";
                if (btnLogin) btnLogin.classList.remove('hidden');
                if (btnSignup) btnSignup.classList.add('hidden');
                toggleAuthText.innerText = "Don't have an account? Register here";
            } else {
                if (authTitle) authTitle.innerText = "Portfolio Register";
                if (btnLogin) btnLogin.classList.add('hidden');
                if (btnSignup) btnSignup.classList.remove('hidden');
                toggleAuthText.innerText = "Already have an account? Login here";
            }
        });
    }

    // লগইন
    if (btnLogin) {
        btnLogin.addEventListener('click', function() {
            const email = document.getElementById('login-email')?.value.trim() || '';
            const password = document.getElementById('login-password')?.value || '';
            if (authError) authError.innerText = "";
            if (!email || !password) {
                if (authError) authError.innerText = "দয়া করে ইমেইল এবং পাসওয়ার্ড দুটিই দিন।";
                return;
            }
            if (typeof auth !== 'undefined' && auth) {
                auth.signInWithEmailAndPassword(email, password)
                    .then(() => {
                        // সফল হলে কিছু করার দরকার নেই, onAuthStateChanged সামলাবে
                    })
                    .catch((error) => {
                        if (authError) {
                            if (error.code === 'auth/user-not-found') {
                                authError.innerText = "এই ইমেইলে কোনো অ্যাকাউন্ট নেই।";
                            } else if (error.code === 'auth/wrong-password') {
                                authError.innerText = "ভুল পাসওয়ার্ড!";
                            } else {
                                authError.innerText = "লগইন ব্যর্থ: " + error.message;
                            }
                        }
                    });
            } else {
                if (authError) authError.innerText = "Firebase Auth not initialized.";
            }
        });
    }

    // সাইনআপ
    if (btnSignup) {
        btnSignup.addEventListener('click', function() {
            const email = document.getElementById('login-email')?.value.trim() || '';
            const password = document.getElementById('login-password')?.value || '';
            if (authError) authError.innerText = "";
            if (!email || !password) {
                if (authError) authError.innerText = "দয়া করে ইমেইল এবং পাসওয়ার্ড দুটিই দিন।";
                return;
            }
            if (password.length < 6) {
                if (authError) authError.innerText = "পাসওয়ার্ড অন্তত ৬ ডিজিটের হতে হবে।";
                return;
            }
            if (typeof auth !== 'undefined' && auth) {
                auth.createUserWithEmailAndPassword(email, password)
                    .then(() => {
                        if (typeof showToast === 'function') {
                            showToast('✅ Account created! Please login.', 'success');
                        }
                        if (toggleAuthText) toggleAuthText.click();
                    })
                    .catch((error) => {
                        if (authError) {
                            if (error.code === 'auth/email-already-in-use') {
                                authError.innerText = "এই ইমেইল ইতিমধ্যে ব্যবহার করা হয়েছে।";
                            } else {
                                authError.innerText = "অ্যাকাউন্ট তৈরি ব্যর্থ: " + error.message;
                            }
                        }
                    });
            } else {
                if (authError) authError.innerText = "Firebase Auth not initialized.";
            }
        });
    }

    // লগআউট
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            if (typeof auth !== 'undefined' && auth) auth.signOut();
        });
    }

    // ==========================================
    // 🔐 অথেনটিকেশন স্টেট লিসেনার
    // ==========================================
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log(`✅ User logged in: ${user.email || user.uid}`);
                
                // Firebase identity → Supabase JWT. Dashboard queries wait for this to finish.
                try {
                    await syncSupabaseAuth(false);
                } catch (e) {
                    console.error('❌ Supabase authentication failed:', e);
                    if (authError) authError.innerText = 'ডেটা সার্ভিসে সংযোগ করা যাচ্ছে না। আবার চেষ্টা করুন।';
                    return;
                }

                if (loginContainer) loginContainer.classList.add('hidden');
                if (appContainer) appContainer.classList.remove('hidden');
                if (authError) authError.innerText = '';

                // ড্যাশবোর্ড লোড
                if (typeof initDashboardSearch === 'function') initDashboardSearch();
                const mode = currentDataMode || 'database';
                if (mode === 'database') {
                    if (typeof loadDashboardData === 'function') await loadDashboardData(null, true);
                    if (typeof loadUnifiedStockTable === 'function') await loadUnifiedStockTable(user.uid);
                    if (typeof loadPortfolioAnalysisTable === 'function') await loadPortfolioAnalysisTable(user.uid, null, true);
                } else {
                    if (typeof loadLiveDashboardData === 'function') await loadLiveDashboardData();
                    if (typeof loadLiveStockTable === 'function') await loadLiveStockTable();
                    if (typeof loadLivePortfolioAnalysis === 'function') await loadLivePortfolioAnalysis();
                }
                if (typeof startAutoRefresh === 'function') startAutoRefresh();
                if (typeof updateAllPortfolioSelectors === 'function') await updateAllPortfolioSelectors();
                if (typeof loadPortfolioManagerData === 'function') await loadPortfolioManagerData();
                
                // ==========================================
                // 🔔 ডেইলি সামারি শিডিউলার চালু করুন
                // ==========================================
                if (typeof scheduleDailySummary === 'function') {
                    try {
                        scheduleDailySummary();
                        console.log('📅 Daily summary scheduler started');
                    } catch (e) {
                        console.warn('Daily summary scheduler error:', e);
                    }
                }

                // ==========================================
                // 📡 FCM Push Notification সেটআপ
                // ==========================================
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(() => {
                        setTimeout(setupPushNotifications, 2000);
                    });
                }

                // ==========================================
                // ⏰ ব্যাকগ্রাউন্ড প্রাইস অ্যালার্ট চেকার স্টার্ট
                // ==========================================
                startPriceAlertChecker();
                
                console.log('✅ Dashboard loaded successfully');
            } else {
                console.log('👤 User logged out');
                if (loginContainer) loginContainer.classList.remove('hidden');
                if (appContainer) appContainer.classList.add('hidden');
                if (authError) authError.innerText = '';
                if (typeof stopAutoRefresh === 'function') stopAutoRefresh();
                if (typeof CacheManager !== 'undefined' && CacheManager.clearAll) CacheManager.clearAll();
                cachedSupabaseToken = null;
                if (typeof window.clearSupabaseAuth === 'function') window.clearSupabaseAuth();
                
                // প্রাইস অ্যালার্ট চেকার বন্ধ
                if (priceAlertInterval) {
                    clearInterval(priceAlertInterval);
                    priceAlertInterval = null;
                }
            }
        });
        // Firebase may refresh its ID token without changing the auth state.
        // Re-exchange it so Supabase continues receiving a valid JWT.
        if (typeof auth.onIdTokenChanged === 'function') {
            auth.onIdTokenChanged(async (tokenUser) => {
                if (tokenUser) {
                    try {
                        await syncSupabaseAuth(true);
                    } catch (e) {
                        console.warn('⚠️ Supabase token refresh failed:', e);
                    }
                } else if (typeof window.clearSupabaseAuth === 'function') {
                    window.clearSupabaseAuth();
                }
            });
        }
    } else {
        console.warn('⚠️ Auth not available, state listener skipped.');
    }
});

// ==========================================
// ১১. পেজ আনলোডে ক্লিনআপ
// ==========================================

window.addEventListener('beforeunload', () => {
    if (window.portfolioAnalysisInterval) clearInterval(window.portfolioAnalysisInterval);
    if (window.stockTableRefreshInterval) clearInterval(window.stockTableRefreshInterval);
    if (window.autoRefreshInterval) clearInterval(window.autoRefreshInterval);
    if (window.firebaseDataManager) window.firebaseDataManager.clearCache();
    if (priceAlertInterval) {
        clearInterval(priceAlertInterval);
        priceAlertInterval = null;
    }
});

// ==========================================
// ১২. 📡 Firebase Cloud Messaging (FCM) সেটআপ
// ==========================================

// VAPID পাবলিক কী (Firebase Console থেকে নিন)
const VAPID_PUBLIC_KEY = 'BJvVefLaxMNoMclXOJ_lNNGfTiYtT0e30u2MtEd9fNYN6OqW6SrIkzy_UpK-yEM0dBmhTXnsNOgabTxYtH6MDZo';

async function setupPushNotifications() {
    try {
        // ১. Service Worker রেজিস্টার চেক
        if (!('serviceWorker' in navigator)) {
            console.warn('Service Worker not supported');
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        
        // ২. Push Manager থেকে সাবস্ক্রিপশন চেক
        let subscription = await registration.pushManager.getSubscription();
        
        // ৩. যদি সাবস্ক্রিপশন না থাকে, নতুন তৈরি করুন
        if (!subscription) {
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });
            
            console.log('✅ Push subscription created');
        } else {
            console.log('✅ Existing push subscription found');
        }

        // ৪. টোকেন বের করা (এন্ডপয়েন্ট থেকে)
        const token = subscription.endpoint;
        
        // ৫. টোকেন সার্ভারে (Firestore/Supabase) সেভ করুন
        await saveFCMToken(token);
        
        return subscription;
    } catch (error) {
        console.error('❌ Push setup error:', error);
    }
}

// VAPID কী কনভার্ট করার হেলপার
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// টোকেন সেভ করার ফাংশন (Firestore অথবা Supabase)
async function saveFCMToken(token) {
    const user = auth?.currentUser;
    if (!user) return;
    
    try {
        // Firebase Firestore-এ সেভ
        if (typeof db !== 'undefined') {
            await db.collection('users').doc(user.uid).set({
                fcmToken: token,
                updatedAt: new Date()
            }, { merge: true });
            console.log('✅ FCM token saved to Firestore');
        }
        
        // অথবা Supabase-এ সেভ
        if (typeof supabase !== 'undefined' && supabase) {
            await supabase
                .from('users')
                .upsert({
                    user_id: user.uid,
                    fcm_token: token,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            console.log('✅ FCM token saved to Supabase');
        }
    } catch (err) {
        console.warn('Failed to save FCM token:', err);
    }
}

// ==========================================
// ১৩. ⏰ ব্যাকগ্রাউন্ড প্রাইস অ্যালার্ট চেকার
// ==========================================

function startPriceAlertChecker() {
    // আগের ইন্টারভাল ক্লিয়ার করুন
    if (priceAlertInterval) {
        clearInterval(priceAlertInterval);
        priceAlertInterval = null;
    }
    
    // ইউজার লগইন না থাকলে চেকার চালাবেন না
    const user = auth?.currentUser;
    if (!user) {
        console.log('⏸️ Price alert checker paused (no user)');
        return;
    }
    
    console.log('⏰ Starting price alert checker (every 5 minutes)');
    
    // প্রথমবার ১০ সেকেন্ড পরে চেক করবে (ড্যাশবোর্ড লোডের পর)
    setTimeout(async () => {
        await checkPriceAlertsInBackground();
    }, 10000);
    
    // তারপর প্রতি ৫ মিনিট পর পর চেক করবে
    priceAlertInterval = setInterval(async () => {
        await checkPriceAlertsInBackground();
    }, 300000); // ৫ মিনিট
}

async function checkPriceAlertsInBackground() {
    const user = auth?.currentUser;
    if (!user) {
        // ইউজার লগআউট করলে ইন্টারভাল বন্ধ করুন
        if (priceAlertInterval) {
            clearInterval(priceAlertInterval);
            priceAlertInterval = null;
        }
        return;
    }
    
    // নোটিফিকেশন ম্যানেজার না থাকলে বা পারমিশন না থাকলে রিটার্ন
    if (typeof notificationManager === 'undefined' || !notificationManager || !notificationManager.permission) {
        return;
    }
    
    try {
        const unifiedData = await unifiedEngine.calculate(user.uid, null, true);
        if (!unifiedData || !unifiedData.stockDetails || unifiedData.stockDetails.length === 0) return;
        
        const tickers = unifiedData.stockDetails.map(s => s.ticker);
        const priceMap = await getLatestAndPreviousPrices(tickers);
        
        let alertTriggered = false;
        for (const [ticker, data] of priceMap) {
            if (data.currentPrice > 0) {
                notificationManager.checkPriceAlerts(ticker, data.currentPrice);
                // অ্যালার্ট ট্রিগার হলে ফ্ল্যাগ সেট করুন
                const alert = notificationManager.getAlertStatus(ticker);
                if (alert && alert.triggered) {
                    alertTriggered = true;
                }
            }
        }
        
        // অ্যালার্ট ট্রিগার হলে UI রিফ্রেশ (অ্যালার্ট লিস্ট আপডেট)
        if (alertTriggered && typeof loadActiveAlerts === 'function') {
            loadActiveAlerts();
        }
        
    } catch (error) {
        console.warn('Background price alert check error:', error);
    }
}

// ==========================================
// ১৪. 🔔 অ্যালার্ট ফাংশন (ui-helpers.js-তে যোগ করুন)
// ==========================================

/**
 * ব্রাউজার নোটিফিকেশন পারমিশন চাওয়া
 */
window.requestNotificationPermission = async function() {
    if (!('Notification' in window)) {
        showToast('This browser does not support notifications.', 'error');
        return;
    }
    if (Notification.permission === 'granted') {
        showToast('✅ Notification already enabled!', 'success');
        return;
    }
    if (Notification.permission === 'denied') {
        showToast('❌ Notification blocked. Please enable from browser settings.', 'error');
        return;
    }
    // পারমিশন চাওয়া
    const result = await Notification.requestPermission();
    if (result === 'granted') {
        showToast('✅ Notification enabled!', 'success');
        // নোটিফিকেশন ম্যানেজার আপডেট
        if (notificationManager) {
            notificationManager.permission = true;
        }
    } else {
        showToast('❌ Notification permission denied.', 'error');
    }
};

/**
 * প্রাইস অ্যালার্ট সেট করা (HTML বাটন থেকে কল হবে)
 */
window.setPriceAlert = function() {
    const tickerInput = document.getElementById('alert-ticker');
    const targetInput = document.getElementById('alert-target-price');
    const directionSelect = document.getElementById('alert-direction');
    const suggestionBox = document.getElementById('alert-suggestions');

    if (!tickerInput || !targetInput || !directionSelect) {
        showToast('Alert form elements not found.', 'error');
        return;
    }

    const ticker = tickerInput.value.trim().toUpperCase();
    const target = parseFloat(targetInput.value);
    const direction = directionSelect.value;

    // ভ্যালিডেশন
    if (!ticker) {
        showToast('Please enter a ticker (e.g., GP).', 'warning');
        return;
    }
    if (!target || target <= 0) {
        showToast('Please enter a valid target price.', 'warning');
        return;
    }
    
    // স্টক লিস্টে আছে কিনা চেক (ঐচ্ছিক)
    const stockList = (typeof dseStocks !== 'undefined') ? dseStocks : (window.dseStocks || []);
    if (!stockList.includes(ticker)) {
        showToast('Share not found. Please select from suggestions.', 'warning');
        return;
    }

    // নোটিফিকেশন ম্যানেজার চেক
    if (typeof notificationManager === 'undefined' || !notificationManager) {
        showToast('Notification manager not loaded.', 'error');
        return;
    }

    // অ্যালার্ট সেট করা
    const success = notificationManager.setAlert(ticker, target, direction);
    if (success) {
        // UI রিফ্রেশ
        if (typeof loadActiveAlerts === 'function') {
            setTimeout(loadActiveAlerts, 300);
        }
        // ইনপুট ফিল্ড ক্লিয়ার
        tickerInput.value = '';
        targetInput.value = '';
        if (suggestionBox) suggestionBox.classList.add('hidden');
        showToast(`✅ Alert set for ${ticker} at ৳${target.toFixed(2)}`, 'success');
    } else {
        showToast('Failed to set alert. Maximum 50 alerts allowed.', 'error');
    }
};

// ==========================================
// ১৫. 🚀 অ্যালার্ট সার্চ সাজেশন (ইনপুটের জন্য)
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    const alertTickerInput = document.getElementById('alert-ticker');
    const alertSuggestionBox = document.getElementById('alert-suggestions');
    
    if (alertTickerInput && alertSuggestionBox) {
        const stockList = (typeof dseStocks !== 'undefined') ? dseStocks : (window.dseStocks || []);
        
        alertTickerInput.addEventListener('input', function() {
            const query = this.value.trim().toUpperCase();
            alertSuggestionBox.innerHTML = '';
            if (!query) {
                alertSuggestionBox.classList.add('hidden');
                return;
            }
            const filtered = stockList.filter(s => s.startsWith(query)).slice(0, 10);
            if (filtered.length > 0) {
                alertSuggestionBox.classList.remove('hidden');
                filtered.forEach(stock => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion-item');
                    div.innerText = stock;
                    div.addEventListener('click', function() {
                        alertTickerInput.value = stock;
                        alertSuggestionBox.classList.add('hidden');
                    });
                    alertSuggestionBox.appendChild(div);
                });
            } else {
                alertSuggestionBox.classList.add('hidden');
            }
        });

        document.addEventListener('click', function(e) {
            if (!alertTickerInput.contains(e.target) && !alertSuggestionBox.contains(e.target)) {
                alertSuggestionBox.classList.add('hidden');
            }
        });
    }
});

// ==========================================
// 📌 গ্লোবাল এক্সপোজ (সব ফাংশন উইন্ডোতে)
// ==========================================

window.updateChartColors = updateChartColors;
window.toggleDarkMode = window.toggleDarkMode;
window.loadSavedTheme = window.loadSavedTheme;
window.showToast = window.showToast;
window.toggleLeftSidebar = window.toggleLeftSidebar;
window.toggleRightSidebar = window.toggleRightSidebar;
window.switchTab = window.switchTab;
window.toggleCommissionSettings = window.toggleCommissionSettings;
window.saveCommissionSettings = window.saveCommissionSettings;
window.resetCommissionSettings = window.resetCommissionSettings;
window.initDashboardSearch = window.initDashboardSearch;
window.downloadPortfolioData = window.downloadPortfolioData;
window.uploadPortfolioData = window.uploadPortfolioData;
window.showFloatingLoader = window.showFloatingLoader;
window.hideFloatingLoader = window.hideFloatingLoader;
window.toggleScreenerDropdown = window.toggleScreenerDropdown;
window.confirmAndDeletePortfolio = window.confirmAndDeletePortfolio;
window.setDatabaseMode = setDatabaseMode;
window.setLiveDataMode = setLiveDataMode;
window.loadLiveDashboardData = loadLiveDashboardData;
window.loadLiveStockTable = loadLiveStockTable;
window.loadLivePortfolioAnalysis = loadLivePortfolioAnalysis;
window.requestNotificationPermission = window.requestNotificationPermission;
window.setPriceAlert = window.setPriceAlert;
window.setupPushNotifications = setupPushNotifications;
window.startPriceAlertChecker = startPriceAlertChecker;
window.saveFCMToken = saveFCMToken;
window.urlBase64ToUint8Array = urlBase64ToUint8Array;

// ==========================================
// 📜 ট্রেড হিস্ট্রি ফাংশন
// ==========================================

let allTransactions = [];

async function loadTradeHistory() {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) return;
    const tbody = document.getElementById('trade-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading transactions...</td></tr>';

    try {
        if (typeof db === 'undefined') {
            tbody.innerHTML = '<tr><td colspan="6">Firebase not available</td></tr>';
            return;
        }
        const buySnapshot = await db.collection('portfolios')
            .where('userId', '==', user.uid)
            .get();
        const sellSnapshot = await db.collection('sales_history')
            .where('userId', '==', user.uid)
            .get();

        const transactions = [];
        buySnapshot.forEach(doc => {
            const data = doc.data();
            let dateObj = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
            transactions.push({
                id: doc.id,
                date: dateObj,
                shareName: data.shareName,
                quantity: data.quantity,
                price: data.buyPrice,
                type: 'BUY',
                commission: data.commission || 0
            });
        });
        sellSnapshot.forEach(doc => {
            const data = doc.data();
            let dateObj = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
            transactions.push({
                id: doc.id,
                date: dateObj,
                shareName: data.shareName,
                quantity: data.quantitySold,
                price: data.sellPrice,
                type: 'SELL',
                profitOrLoss: data.profitOrLoss
            });
        });
        transactions.sort((a, b) => b.date - a.date);
        allTransactions = transactions;

        const today = new Date();
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(today.getDate() - 3);
        const startInput = document.getElementById('trade-history-start');
        const endInput = document.getElementById('trade-history-end');
        if (startInput) startInput.value = threeDaysAgo.toISOString().split('T')[0];
        if (endInput) endInput.value = today.toISOString().split('T')[0];

        applyTradeFilter();
        const applyBtn = document.getElementById('apply-trade-filter');
        const resetBtn = document.getElementById('reset-trade-filter');
        if (applyBtn) applyBtn.onclick = applyTradeFilter;
        if (resetBtn) resetBtn.onclick = resetTradeFilter;
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6">Error loading transactions.</td></tr>';
    }
}

function applyTradeFilter() {
    const startInput = document.getElementById('trade-history-start');
    const endInput = document.getElementById('trade-history-end');
    const startDate = startInput?.value ? new Date(startInput.value) : null;
    const endDate = endInput?.value ? new Date(endInput.value) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);
    const filtered = allTransactions.filter(tx => {
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
    });
    renderTradeTable(filtered);
}

function resetTradeFilter() {
    const startInput = document.getElementById('trade-history-start');
    const endInput = document.getElementById('trade-history-end');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    applyTradeFilter();
}

// ✅ HTML attribute-এ নিরাপদে বসানোর হেল্পার (defense-in-depth)
function escapeHtmlUI(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderTradeTable(transactions) {
    const tbody = document.getElementById('trade-history-tbody');
    if (!tbody) return;
    if (!transactions.length) {
        tbody.innerHTML = '<tr><td colspan="6">No transactions in this period.</td></tr>';
        return;
    }
    let html = '';
    for (const tx of transactions) {
        const dateStr = tx.date.toLocaleDateString('bn-BD');
        const typeClass = tx.type === 'BUY' ? 'up' : 'error';
        const safeId = escapeHtmlUI(tx.id);
        const safeType = escapeHtmlUI(tx.type);
        html += `<tr>
            <td style="padding: 8px;">${dateStr}</td>
            <td style="padding: 8px;">${escapeHtmlUI(tx.shareName)}</td>
            <td style="padding: 8px;">${tx.quantity}</td>
            <td style="padding: 8px;">৳${tx.price.toFixed(2)}</td>
            <td style="padding: 8px;" class="${typeClass}">${tx.type}</td>
            <td style="padding: 8px;">
                <button onclick="editTrade('${safeId}', '${safeType}')" style="background:#0284c7; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:4px;">✏️</button>
                <button onclick="deleteTrade('${safeId}', '${safeType}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">🗑️</button>
            </td>
        </tr>`;
    }
    tbody.innerHTML = html;
}

// ✅ ফিক্স v2:
// - isNaN() ভ্যালিডেশন (আগে শুধু truthy-string চেক হতো, "abc" টাইপ করলেও NaN সেভ হয়ে যেত)
// - Firebase-এ update-এর আগে ownership ভেরিফাই (userId চেক) — IDOR প্রতিরোধ,
//   কারণ এই কালেকশনগুলোতে RLS নেই (Firestore Security Rules-এর উপর নির্ভরশীল)
window.editTrade = async function(id, type) {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    if (typeof db === 'undefined') {
        if (typeof showToast === 'function') showToast('Database not available', 'error');
        return;
    }

    if (type === 'BUY') {
        const newQtyRaw = prompt("Enter new quantity:");
        if (newQtyRaw === null) return; // Cancel
        const newPriceRaw = prompt("Enter new price:");
        if (newPriceRaw === null) return; // Cancel

        const newQty = parseInt(newQtyRaw);
        const newPrice = parseFloat(newPriceRaw);
        if (isNaN(newQty) || newQty <= 0 || isNaN(newPrice) || newPrice <= 0) {
            if (typeof showToast === 'function') showToast('❌ Please enter valid quantity and price (numbers > 0).', 'error');
            return;
        }

        try {
            const docRef = db.collection('portfolios').doc(id);
            const docSnap = await docRef.get();
            if (!docSnap.exists || docSnap.data().userId !== user.uid) {
                if (typeof showToast === 'function') showToast('❌ Record not found or access denied', 'error');
                return;
            }
            await docRef.update({
                quantity: newQty,
                buyPrice: newPrice
            });
            if (typeof showToast === 'function') showToast('✅ Updated successfully!', 'success');
            loadTradeHistory();
        } catch (err) {
            if (typeof showToast === 'function') showToast('❌ Update failed: ' + err.message, 'error');
        }
    } else {
        const newQtyRaw = prompt("Enter new quantity sold:");
        if (newQtyRaw === null) return; // Cancel
        const newPriceRaw = prompt("Enter new sell price:");
        if (newPriceRaw === null) return; // Cancel

        const newQty = parseInt(newQtyRaw);
        const newPrice = parseFloat(newPriceRaw);
        if (isNaN(newQty) || newQty <= 0 || isNaN(newPrice) || newPrice <= 0) {
            if (typeof showToast === 'function') showToast('❌ Please enter valid quantity and price (numbers > 0).', 'error');
            return;
        }

        try {
            const docRef = db.collection('sales_history').doc(id);
            const docSnap = await docRef.get();
            if (!docSnap.exists || docSnap.data().userId !== user.uid) {
                if (typeof showToast === 'function') showToast('❌ Record not found or access denied', 'error');
                return;
            }
            const buyPrice = docSnap.data().buyPrice || 0;
            await docRef.update({
                quantitySold: newQty,
                sellPrice: newPrice,
                profitOrLoss: (newPrice - buyPrice) * newQty
            });
            if (typeof showToast === 'function') showToast('✅ Updated successfully!', 'success');
            loadTradeHistory();
        } catch (err) {
            if (typeof showToast === 'function') showToast('❌ Update failed: ' + err.message, 'error');
        }
    }
};

// ✅ ফিক্স v2: delete-এর আগে ownership ভেরিফাই (IDOR প্রতিরোধ)
window.deleteTrade = async function(id, type) {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    if (typeof db === 'undefined') {
        if (typeof showToast === 'function') showToast('Database not available', 'error');
        return;
    }

    const collection = type === 'BUY' ? 'portfolios' : 'sales_history';
    try {
        const docRef = db.collection(collection).doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists || docSnap.data().userId !== user.uid) {
            if (typeof showToast === 'function') showToast('❌ Record not found or access denied', 'error');
            return;
        }
        await docRef.delete();
        if (typeof showToast === 'function') showToast('🗑️ Deleted successfully!', 'info');
        loadTradeHistory();
    } catch (err) {
        if (typeof showToast === 'function') showToast('❌ Delete failed: ' + err.message, 'error');
    }
};

// গ্লোবালি এক্সপোজ
window.loadTradeHistory = loadTradeHistory;
window.applyTradeFilter = applyTradeFilter;
window.resetTradeFilter = resetTradeFilter;
window.editTrade = window.editTrade;
window.deleteTrade = window.deleteTrade;

console.log('✅ ui-helpers.js v2 loaded (with Push Notification, Price Alert Checker, Daily Summary scheduler + IDOR/validation fix on editTrade/deleteTrade)');