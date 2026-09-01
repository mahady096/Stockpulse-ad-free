// ==========================================
// 📂 portfolio-manager.js - সম্পূর্ণ ইরর-ফ্রি ভার্সন v3.1
//    Create, Edit, Delete, Access, List View
//    ✅ রিয়ালাইজড গেইন যোগ করা হয়েছে (ক্যাশের বদলে)
//    ✅ সব পোর্টফোলিও সিলেক্টর অটো-আপডেট
//    ✅ ফিক্স v3.1: পোর্টফোলিও নাম রেন্ডার করার সময় HTML-escape
//       (Stored XSS প্রতিরোধ — নাম ইউজারের নিজের ইনপুট থেকে আসে)
// ==========================================

let currentPortfolioMeta = null;
let portfolioSummaries = {};
let currentSelectedPortfolio = 'main';

// ==========================================
// 🆓 FREE PLAN LIMITS
//    Main portfolio counts toward the total. Pro users are unlimited.
// ==========================================
const FREE_MAX_PORTFOLIOS = 2;       // Main + 1 custom portfolio
const FREE_MAX_UNIQUE_SHARES = 20;   // Active unique share symbols across all portfolios

async function ensureSubscriptionLoaded() {
    try {
        if (window.StockPulsePlan && typeof window.StockPulsePlan.load === 'function') {
            await window.StockPulsePlan.load(true);
        }
    } catch (e) {
        console.warn('Subscription status check failed; Free limits remain enabled:', e?.message || e);
    }
    return !!(window.StockPulsePlan && typeof window.StockPulsePlan.isPro === 'function' && window.StockPulsePlan.isPro());
}

// ==========================================
// 🛡️ HTML Escape হেল্পার
//    যেকোনো ইউজার-সাপ্লায়েড টেক্সট innerHTML-এ বসানোর আগে
//    এই ফাংশন দিয়ে পাস করাতে হবে — <img onerror=...> জাতীয়
//    stored XSS ঠেকাতে।
// ==========================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================
// 🚀 পোর্টফোলিও ম্যানেজার ওপেন
// ==========================================
window.openPortfolioManager = async function() {
    const modal = document.getElementById('portfolio-manager-modal');
    if (!modal) {
        console.warn('⚠️ portfolio-manager-modal not found');
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }

    modal.style.display = 'flex';
    await loadPortfolioManagerData();
};

window.closePortfolioManager = function() {
    const modal = document.getElementById('portfolio-manager-modal');
    if (modal) modal.style.display = 'none';
};

// ==========================================
// 📊 ডেটা লোড ও কার্ড রেন্ডার
// ==========================================
window.loadPortfolioManagerData = async function() {
    const user = auth.currentUser;
    if (!user) return;

    const grid = document.getElementById('portfolio-cards-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">⏳ Loading portfolios...</div>';

    try {
        // ১. মেটাডেটা লোড
        const meta = await getPortfolioMeta(user.uid);
        currentPortfolioMeta = meta;

        // ২. সব সেল হিস্ট্রি একবারে ফেচ (পোর্টফোলিও অনুযায়ী গ্রুপ)
        let allSales = [];
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('sales_history')
                    .select('profit_or_loss, portfolio_id')
                    .eq('user_id', user.uid);
                if (!error && data) allSales = data;
            } catch (e) {}
        }
        if (allSales.length === 0 && typeof db !== 'undefined') {
            try {
                const snap = await db.collection('sales_history')
                    .where('userId', '==', user.uid)
                    .get();
                snap.forEach(doc => {
                    const d = doc.data();
                    allSales.push({
                        profit_or_loss: d.profitOrLoss || 0,
                        portfolio_id: d.portfolioId || 'main'
                    });
                });
            } catch (e) {}
        }

        // পোর্টফোলিও আইডি অনুযায়ী রিয়ালাইজড গেইন গ্রুপ
        const realizedMap = new Map();
        allSales.forEach(sale => {
            const pid = sale.portfolio_id || 'main';
            const pl = parseFloat(sale.profit_or_loss) || 0;
            realizedMap.set(pid, (realizedMap.get(pid) || 0) + pl);
        });

        // ৩. প্রতিটি পোর্টফোলিওর সামারি ক্যালকুলেট
        const summaries = {};
        for (const p of meta.portfolios) {
            const data = await unifiedEngine.calculate(user.uid, p.id, true);
            if (data) {
                // রিয়ালাইজড গেইন (গ্রুপ থেকে)
                const realized = realizedMap.get(p.id) || 0;

                let dailyGL = 0, dailyPct = 0;
                let totalGL = 0, totalPct = 0;
                let totalCurrentValue = 0;

                const tickers = data.stockDetails.map(s => s.ticker);
                if (tickers.length > 0) {
                    const priceMap = await getLatestAndPreviousPrices(tickers);
                    for (const stock of data.stockDetails) {
                        const priceData = priceMap.get(stock.ticker);
                        const currentPrice = priceData?.currentPrice || 0;
                        const prevPrice = priceData?.previousPrice || 0;
                        const qty = stock.totalQty || 0;
                        const cost = stock.totalCost || 0;
                        const currentValue = qty * currentPrice;
                        totalCurrentValue += currentValue;
                        const gl = currentValue - cost;
                        totalGL += gl;
                        if (prevPrice > 0 && qty > 0) {
                            const daily = qty * (currentPrice - prevPrice);
                            dailyGL += daily;
                        }
                    }
                    totalPct = data.totalInvestment > 0 ? (totalGL / data.totalInvestment) * 100 : 0;
                    dailyPct = data.totalInvestment > 0 ? (dailyGL / data.totalInvestment) * 100 : 0;
                } else {
                    totalCurrentValue = data.totalInvestment || 0;
                }

                summaries[p.id] = {
                    name: p.name,
                    type: p.type,
                    isDefault: p.isDefault || false,
                    totalInvestment: data.totalInvestment || 0,
                    totalCurrentValue: totalCurrentValue,
                    totalQty: data.totalRemainingQty || 0,
                    realized: realized,  // 👈 রিয়ালাইজড গেইন
                    dailyGL: dailyGL,
                    dailyPct: dailyPct,
                    totalGL: totalGL,
                    totalPct: totalPct,
                };
            }
        }
        portfolioSummaries = summaries;

        // ৪. গ্র্যান্ড টোটাল (সব পোর্টফোলিওর সমষ্টি)
        const grandData = await unifiedEngine.calculate(user.uid, null, true);
        if (grandData) {
            // গ্র্যান্ড রিয়ালাইজড = সব পোর্টফোলিওর সমষ্টি
            let grandRealized = 0;
            for (const p of meta.portfolios) {
                grandRealized += realizedMap.get(p.id) || 0;
            }
            let grandDailyGL = 0, grandTotalGL = 0, grandTotalCurrentValue = 0;
            const tickers = grandData.stockDetails.map(s => s.ticker);
            if (tickers.length > 0) {
                const priceMap = await getLatestAndPreviousPrices(tickers);
                for (const stock of grandData.stockDetails) {
                    const priceData = priceMap.get(stock.ticker);
                    const currentPrice = priceData?.currentPrice || 0;
                    const prevPrice = priceData?.previousPrice || 0;
                    const qty = stock.totalQty || 0;
                    const cost = stock.totalCost || 0;
                    const currentValue = qty * currentPrice;
                    grandTotalCurrentValue += currentValue;
                    const gl = currentValue - cost;
                    grandTotalGL += gl;
                    if (prevPrice > 0 && qty > 0) {
                        grandDailyGL += qty * (currentPrice - prevPrice);
                    }
                }
            } else {
                grandTotalCurrentValue = grandData.totalInvestment || 0;
            }
            summaries['grand'] = {
                name: '📊 Grand Portfolio',
                type: 'main',
                isDefault: true,
                totalInvestment: grandData.totalInvestment || 0,
                totalCurrentValue: grandTotalCurrentValue,
                totalQty: grandData.totalRemainingQty || 0,
                realized: grandRealized,  // 👈 গ্র্যান্ড রিয়ালাইজড
                dailyGL: grandDailyGL,
                dailyPct: grandData.totalInvestment > 0 ? (grandDailyGL / grandData.totalInvestment) * 100 : 0,
                totalGL: grandTotalGL,
                totalPct: grandData.totalInvestment > 0 ? (grandTotalGL / grandData.totalInvestment) * 100 : 0,
            };
        }

        renderPortfolioCards();
        updateAllPortfolioSelectors();
        updateSidebarPortfolioList();
        updateBuyPortfolioSelect();

    } catch (error) {
        console.error('Error loading portfolio manager:', error);
        grid.innerHTML = `<div style="text-align: center; padding: 40px; color: red;">❌ Error loading portfolios: ${escapeHtml(error.message)}</div>`;
    }
};

// ==========================================
// 🖥️ পোর্টফোলিও কার্ড রেন্ডার
// ==========================================
window.renderPortfolioCards = function() {
    const grid = document.getElementById('portfolio-cards-grid');
    if (!grid) return;

    if (!currentPortfolioMeta || !currentPortfolioMeta.portfolios) {
        grid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">No portfolios found.</div>';
        return;
    }

    let html = '';

    // গ্র্যান্ড পোর্টফোলিও
    const grand = portfolioSummaries['grand'];
    if (grand) {
        html += createPortfolioCardHTML('grand', grand);
    }

    // বাকি পোর্টফোলিও
    for (const p of currentPortfolioMeta.portfolios) {
        const summary = portfolioSummaries[p.id];
        if (summary) {
            html += createPortfolioCardHTML(p.id, summary);
        }
    }

    grid.innerHTML = html;
};

// ==========================================
// 🏷️ পোর্টফোলিও কার্ড HTML তৈরি (রিয়ালাইজড গেইন দেখানো)
//    ✅ ফিক্স: summary.name escape করে বসানো হচ্ছে (XSS প্রতিরোধ)
// ==========================================
function createPortfolioCardHTML(portfolioId, summary) {
    const isMain = portfolioId === 'grand' || summary.type === 'main';
    const isActive = summary.totalQty > 0;

    const totalInvestment = summary.totalInvestment || 0;
    const totalCurrentValue = summary.totalCurrentValue || 0;
    const dailyGL = summary.dailyGL || 0;
    const dailyPct = summary.dailyPct || 0;
    const totalGL = summary.totalGL || 0;
    const totalPct = summary.totalPct || 0;
    const realized = summary.realized || 0;  // 👈 রিয়ালাইজড গেইন

    const dailyColor = dailyGL >= 0 ? '#10b981' : '#ef4444';
    const totalColor = totalGL >= 0 ? '#10b981' : '#ef4444';
    const realizedColor = realized >= 0 ? '#10b981' : '#ef4444';

    // ✅ escapeHtml() — user-supplied পোর্টফোলিও নাম নিরাপদে রেন্ডার
    const name = escapeHtml(summary.name || (portfolioId === 'grand' ? '📊 Grand Portfolio' : portfolioId));
    const badgeMain = isMain ? '<span class="card-badge card-badge-main">MAIN</span>' : '';
    const badgeStatus = isActive
        ? '<span class="card-badge card-badge-active">🟢 Active</span>'
        : '<span class="card-badge card-badge-empty">⚪ Empty</span>';

    // portfolioId নিজে সিস্টেম-জেনারেটেড (UUID জাতীয়), তাও escape করে দিচ্ছি — defense in depth
    const safePortfolioId = escapeHtml(portfolioId);

    const deleteBtn = !isMain ?
        `<button class="btn-delete" onclick="deletePortfolioHandler('${safePortfolioId}')" ${isActive ? 'disabled title="Cannot delete: portfolio has shares"' : ''}>
            🗑️ DELETE
        </button>` : '';

    const editBtn = !isMain ?
        `<button class="btn-edit" onclick="editPortfolioHandler('${safePortfolioId}')">✏️ EDIT</button>` : '';

    return `
        <div class="portfolio-card" style="${isMain ? 'border-left: 4px solid var(--primary-color);' : ''}">
            <div class="card-header">
                <div>
                    <span class="card-name">${name}</span>
                    ${badgeMain}
                    <div style="margin-top: 4px;">${badgeStatus}</div>
                </div>
                <span style="font-size: 12px; color: var(--text-muted);">${summary.totalQty || 0} shares</span>
            </div>

            <div class="card-stats">
                <div>
                    <div class="stat-label">Port Size</div>
                    <div class="stat-value">৳${totalInvestment.toFixed(2)}</div>
                </div>
                <div>
                    <div class="stat-label">Realized Gain</div>
                    <div class="stat-value" style="color: ${realizedColor};">${realized >= 0 ? '+' : ''}৳${realized.toFixed(2)}</div>
                </div>
            </div>

            <div class="card-pl-grid">
                <div>
                    <div class="pl-label">Value/Cost</div>
                    <div class="pl-value">${totalCurrentValue.toFixed(0)}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">/${totalInvestment.toFixed(0)}</div>
                </div>
                <div>
                    <div class="pl-label">Daily G/L</div>
                    <div class="pl-value" style="color: ${dailyColor};">${dailyGL >= 0 ? '+' : ''}${dailyGL.toFixed(2)}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">${dailyPct >= 0 ? '+' : ''}${dailyPct.toFixed(2)}%</div>
                </div>
                <div>
                    <div class="pl-label">Total G/L</div>
                    <div class="pl-value" style="color: ${totalColor};">${totalGL >= 0 ? '+' : ''}${totalGL.toFixed(2)}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%</div>
                </div>
            </div>

            <div class="card-actions">
                ${deleteBtn}
                ${editBtn}
                <button class="btn-access" onclick="accessPortfolioHandler('${safePortfolioId}')">🔍 ACCESS</button>
            </div>
        </div>
    `;
}

// ==========================================
// 🎯 পোর্টফোলিও অ্যাকশন হ্যান্ডলার
// ==========================================

// 🗑️ DELETE
window.deletePortfolioHandler = async function(portfolioId) {
    if (portfolioId === 'main' || portfolioId === 'grand') {
        if (typeof showToast === 'function') showToast('Cannot delete main portfolio', 'warning');
        return;
    }
    const name = getPortfolioNameFromMeta(portfolioId);
    // ⚠️ confirm() plain text দেখায়, HTML রেন্ডার করে না — তাই এখানে escape লাগবে না
    if (!confirm(`Are you sure you want to delete portfolio "${name}"? This action cannot be undone.`)) {
        return;
    }
    const user = auth.currentUser;
    if (!user) return;
    const success = await deletePortfolio(user.uid, portfolioId);
    if (success) {
        if (typeof showToast === 'function') showToast('✅ Portfolio deleted successfully', 'success');
        await loadPortfolioManagerData();
        updateAllPortfolioSelectors();
        updateSidebarPortfolioList();
        updateBuyPortfolioSelect();
    } else {
        if (typeof showToast === 'function') showToast('❌ Cannot delete: portfolio may have shares', 'error');
    }
};

// ✏️ EDIT
window.editPortfolioHandler = function(portfolioId) {
    const currentName = getPortfolioNameFromMeta(portfolioId);
    const newName = prompt('Enter new portfolio name:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
        renamePortfolioHandler(portfolioId, newName.trim());
    }
};

async function renamePortfolioHandler(portfolioId, newName) {
    const user = auth.currentUser;
    if (!user) return;
    // ✅ defense-in-depth: নাম সেভ করার আগে সাধারণ HTML ক্যারেক্টার আটকানো
    const sanitizedName = sanitizePortfolioName(newName);
    if (!sanitizedName) {
        if (typeof showToast === 'function') showToast('❌ Invalid portfolio name', 'error');
        return;
    }
    const success = await renamePortfolio(user.uid, portfolioId, sanitizedName);
    if (success) {
        if (typeof showToast === 'function') showToast('✅ Portfolio renamed successfully', 'success');
        await loadPortfolioManagerData();
        updateAllPortfolioSelectors();
        updateSidebarPortfolioList();
        updateBuyPortfolioSelect();
    } else {
        if (typeof showToast === 'function') showToast('❌ Failed to rename portfolio', 'error');
    }
}

// 🔍 ACCESS
window.accessPortfolioHandler = function(portfolioId) {
    closePortfolioManager();
    // পোর্টফোলিও অ্যানালাইসিস ট্যাবে যান
    if (typeof switchTab === 'function') switchTab('portfolio-analysis');
    // পোর্টফোলিও আইডি সেট করুন
    currentSelectedPortfolio = portfolioId;
    // টেবিল রিলোড করুন
    const user = auth.currentUser;
    if (user && typeof loadPortfolioAnalysisTable === 'function') {
        loadPortfolioAnalysisTable(user.uid, portfolioId === 'grand' ? null : portfolioId, true);
        const name = portfolioId === 'grand' ? 'Grand Portfolio' : getPortfolioNameFromMeta(portfolioId);
        const header = document.querySelector('#sec-portfolio-analysis h3');
        // ✅ ফিক্স: escapeHtml() — নাম header-এ innerHTML দিয়ে বসছিল আগে
        if (header) header.innerHTML = `📊 ${escapeHtml(name)} - Analysis`;
    }
};

// ==========================================
// 📋 হেলপার ফাংশন
// ==========================================
function getPortfolioNameFromMeta(portfolioId) {
    if (!currentPortfolioMeta) return portfolioId === 'grand' ? '📊 Grand Portfolio' : portfolioId;
    const found = currentPortfolioMeta.portfolios.find(p => p.id === portfolioId);
    return found ? found.name : (portfolioId === 'grand' ? '📊 Grand Portfolio' : portfolioId);
}

// ==========================================
// 🧼 পোর্টফোলিও নাম sanitize (সেভ করার আগে)
//    defense-in-depth: রেন্ডার-টাইম escape ছাড়াও ইনপুট-টাইমে
//    HTML ট্যাগ জাতীয় ক্যারেক্টার আটকে দেওয়া হচ্ছে
// ==========================================
function sanitizePortfolioName(name) {
    if (!name) return '';
    let cleaned = String(name).trim();
    // < > ক্যারেক্টার সরিয়ে ফেলা হচ্ছে যাতে কোনোভাবেই ট্যাগ তৈরি না হতে পারে
    cleaned = cleaned.replace(/[<>]/g, '');
    // অতিরিক্ত লম্বা নাম আটকানো (UI ভেঙে যাওয়া ঠেকাতে)
    if (cleaned.length > 50) cleaned = cleaned.substring(0, 50);
    return cleaned.trim();
}

// ==========================================
// 🔄 সব পোর্টফোলিও সিলেক্টর আপডেট (সব ট্যাবের জন্য)
// ==========================================
window.updateAllPortfolioSelectors = function() {
    const selectors = document.querySelectorAll('[id$="-portfolio-select"]');
    selectors.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '';

        // গ্র্যান্ড পোর্টফোলিও
        const grandOption = document.createElement('option');
        grandOption.value = 'grand';
        grandOption.textContent = '📊 Grand Portfolio'; // ✅ textContent — নিরাপদ, escape দরকার নেই
        select.appendChild(grandOption);

        // মেইন পোর্টফোলিও
        const mainOption = document.createElement('option');
        mainOption.value = 'main';
        mainOption.textContent = '📊 Main Portfolio'; // ✅ textContent — নিরাপদ
        select.appendChild(mainOption);

        // ইউজারের তৈরি পোর্টফোলিও
        if (currentPortfolioMeta && currentPortfolioMeta.portfolios) {
            currentPortfolioMeta.portfolios.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name; // ✅ textContent — DOM API নিজেই escape করে, XSS-প্রুফ
                select.appendChild(opt);
            });
        }

        // আগের সিলেক্টেড ভ্যালু রিস্টোর
        if (currentValue) select.value = currentValue;
    });
};

// ==========================================
// 📂 সাইডবার পোর্টফোলিও লিস্ট আপডেট
//    ✅ ফিক্স: p.name এখন escapeHtml() দিয়ে বসছে
// ==========================================
window.updateSidebarPortfolioList = function() {
    const subList = document.getElementById('portfolio-sub-list');
    if (!subList) return;
    if (!currentPortfolioMeta || !currentPortfolioMeta.portfolios) {
        subList.innerHTML = '';
        return;
    }
    let html = '';
    for (const p of currentPortfolioMeta.portfolios) {
        const isActive = currentSelectedPortfolio === p.id;
        const safeId = escapeHtml(p.id);
        const safeName = escapeHtml(p.name);
        html += `
            <li onclick="switchToPortfolio('${safeId}')" style="padding: 6px 16px; border-radius: 4px; transition: background 0.2s; cursor: pointer; ${isActive ? 'background: var(--sidebar-active); color: white;' : ''}"
                onmouseover="this.style.background='var(--sidebar-hover)'" onmouseout="this.style.background='${isActive ? 'var(--sidebar-active)' : 'transparent'}'">
                ${safeName}
            </li>
        `;
    }
    subList.innerHTML = html;
};

// ==========================================
// 🛒 Buy ফর্মের পোর্টফোলিও সিলেক্টর আপডেট
//    ✅ ফিক্স: p.name এখন escapeHtml() দিয়ে বসছে
// ==========================================
window.updateBuyPortfolioSelect = function() {
    const select = document.getElementById('buy-portfolio-select');
    if (!select) return;
    if (!currentPortfolioMeta || !currentPortfolioMeta.portfolios) {
        select.innerHTML = '<option value="main">📊 Main Portfolio</option>';
        return;
    }
    let html = '';
    // Buy-তে গ্র্যান্ড সিলেক্ট করা যায় না, তাই শুধু সাব পোর্টফোলিও
    for (const p of currentPortfolioMeta.portfolios) {
        const selected = (currentSelectedPortfolio === p.id) ? 'selected' : '';
        const safeId = escapeHtml(p.id);
        const safeName = escapeHtml(p.name);
        html += `<option value="${safeId}" ${selected}>${safeName}</option>`;
    }
    select.innerHTML = html;
};

// ==========================================
// 🔄 পোর্টফোলিও সুইচ (সাইডবার থেকে)
// ==========================================
window.switchToPortfolio = function(portfolioId) {
    currentSelectedPortfolio = portfolioId;
    updateSidebarPortfolioList();
    updateBuyPortfolioSelect();
    updateAllPortfolioSelectors();

    const user = auth.currentUser;
    if (user) {
        // ড্যাশবোর্ড রিলোড
        const dashboardSection = document.getElementById('sec-dashboard');
        if (dashboardSection && !dashboardSection.classList.contains('hidden')) {
            loadDashboardDataForPortfolio(portfolioId);
        }
        // পোর্টফোলিও অ্যানালাইসিস রিলোড
        const paSection = document.getElementById('sec-portfolio-analysis');
        if (paSection && !paSection.classList.contains('hidden') && typeof loadPortfolioAnalysisTable === 'function') {
            loadPortfolioAnalysisTable(user.uid, portfolioId === 'grand' ? null : portfolioId, true);
        }
    }
    const name = portfolioId === 'grand' ? 'Grand Portfolio' : getPortfolioNameFromMeta(portfolioId);
    if (typeof showToast === 'function') showToast(`Switched to ${name}`, 'info');
};

async function loadDashboardDataForPortfolio(portfolioId) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const data = await unifiedEngine.calculate(user.uid, portfolioId === 'grand' ? null : portfolioId, true);
        if (typeof updateDashboardCards === 'function') {
            updateDashboardCards(data);
        }
    } catch (e) {
        console.warn('Dashboard update error:', e);
    }
}

// ==========================================
// ➕ নতুন পোর্টফোলিও তৈরি
//    ✅ ফিক্স: sanitizePortfolioName() দিয়ে ইনপুট ক্লিন করা হচ্ছে সেভ করার আগেই
// ==========================================
window.createNewPortfolioFromSidebar = function() {
    openPortfolioManager();
    const input = document.getElementById('new-portfolio-name-input');
    if (input) input.focus();
};

window.createNewPortfolio = async function() {
    const input = document.getElementById('new-portfolio-name-input');
    const status = document.getElementById('new-portfolio-status');
    if (!input) return;

    const rawName = input.value.trim();
    if (!rawName) {
        if (status) status.innerText = '⚠️ Please enter a name';
        return;
    }

    // ✅ defense-in-depth sanitization — সেভ করার আগেই < > সরানো
    const name = sanitizePortfolioName(rawName);
    if (!name) {
        if (status) status.innerText = '⚠️ Invalid portfolio name';
        if (typeof showToast === 'function') showToast('❌ Invalid portfolio name', 'error');
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }

    // 🆓 Free users: limit total portfolios (Main counts as one).
    const isPro = await ensureSubscriptionLoaded();
    if (!isPro) {
        const meta = await getPortfolioMeta(user.uid);
        const portfolioCount = Array.isArray(meta?.portfolios) ? meta.portfolios.length : 1;
        if (portfolioCount >= FREE_MAX_PORTFOLIOS) {
            const msg = `Free plan allows up to ${FREE_MAX_PORTFOLIOS} portfolios (including Main). Upgrade to Pro for unlimited portfolios.`;
            if (status) status.innerText = '🔒 Portfolio limit reached';
            if (typeof showToast === 'function') showToast(msg, 'warning');
            return;
        }
    }

    const id = await createPortfolio(user.uid, name);
    if (id) {
        if (status) status.innerText = '✅ Portfolio created!';
        input.value = '';
        if (typeof showToast === 'function') showToast(`✅ Portfolio "${name}" created successfully`, 'success');
        await loadPortfolioManagerData();
        updateAllPortfolioSelectors();
        updateSidebarPortfolioList();
        updateBuyPortfolioSelect();
        setTimeout(() => { if (status) status.innerText = ''; }, 3000);
    } else {
        if (status) status.innerText = '❌ Failed to create portfolio';
        if (typeof showToast === 'function') showToast('❌ Failed to create portfolio', 'error');
    }
};

// ==========================================
// 🎚️ ড্রপডাউন টগল (সাইডবার)
// ==========================================
window.togglePortfolioDropdown = function() {
    const dropdown = document.getElementById('portfolio-dropdown');
    const arrow = document.getElementById('portfolio-arrow');
    if (!dropdown) return;
    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'block';
        if (arrow) arrow.textContent = '▼';
        if (auth.currentUser) {
            loadPortfolioManagerData();
        }
    } else {
        dropdown.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
};

// ==========================================
// 🌐 গ্লোবাল এক্সপোজ (সব ফাংশন উইন্ডোতে)
// ==========================================
window.openPortfolioManager = openPortfolioManager;
window.closePortfolioManager = closePortfolioManager;
window.loadPortfolioManagerData = loadPortfolioManagerData;
window.renderPortfolioCards = renderPortfolioCards;
window.deletePortfolioHandler = deletePortfolioHandler;
window.editPortfolioHandler = editPortfolioHandler;
window.accessPortfolioHandler = accessPortfolioHandler;
window.switchToPortfolio = switchToPortfolio;
window.createNewPortfolio = createNewPortfolio;
window.createNewPortfolioFromSidebar = createNewPortfolioFromSidebar;
window.togglePortfolioDropdown = togglePortfolioDropdown;
window.updateSidebarPortfolioList = updateSidebarPortfolioList;
window.updateBuyPortfolioSelect = updateBuyPortfolioSelect;
window.updateAllPortfolioSelectors = updateAllPortfolioSelectors;
window.getPortfolioNameFromMeta = getPortfolioNameFromMeta;

console.log('✅ portfolio-manager.js v3.1 loaded successfully (Realized Gain + XSS fix)');
