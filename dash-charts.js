// ==========================================
// 📊 dash-charts.js - চার্ট রেন্ডারিং
//    dashboard.js থেকে ভাগ করা (ফাইল ৩)
//    পোর্টফোলিও গ্রোথ ও ডেইলি P&L চার্ট
// ==========================================

// ==========================================
// ১. ড্যাশবোর্ড চার্ট রেন্ডার (পোর্টফোলিও গ্রোথ)
// ==========================================

async function renderDashboardHistoryChart(startDate = null, endDate = null) {
    const canvas = document.getElementById('dashboardHistoryChart');
    if (!canvas) return;

    const parent = canvas.parentElement;
    let loadingDiv = document.getElementById('chart-loading-placeholder');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'chart-loading-placeholder';
        loadingDiv.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; justify-content: center; align-items: center;
            color: var(--text-muted); font-size: 14px; z-index: 10;
            background: var(--bg-secondary); border-radius: 12px;
        `;
        loadingDiv.innerHTML = '⏳ Loading portfolio history...';
        if (parent) {
            parent.style.position = 'relative';
            parent.appendChild(loadingDiv);
        }
    } else {
        loadingDiv.style.display = 'flex';
        loadingDiv.innerHTML = '⏳ Loading portfolio history...';
    }

    try {
        const historyData = await fetchPortfolioTimelineData(startDate, endDate, window.currentDashboardPortfolioId);
        if (!historyData || historyData.length === 0) {
            if (loadingDiv) loadingDiv.innerHTML = '📭 No history data available';
            return;
        }

        let displayData = historyData;
        if (historyData.length > 100) {
            const step = Math.ceil(historyData.length / 100);
            displayData = historyData.filter((_, index) => index % step === 0);
        }

        const labels = displayData.map(item => item.date);
        const investData = displayData.map(item => item.totalInvestment);
        const valueData = displayData.map(item => item.totalCurrentValue);

        if (loadingDiv) loadingDiv.remove();

        if (window.dashboardChartInstance) {
            window.dashboardChartInstance.destroy();
            window.dashboardChartInstance = null;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f1f5f9' : '#1e293b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        const ctx = canvas.getContext('2d');
        window.dashboardChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { 
                        label: 'Total Investment', 
                        data: investData, 
                        borderColor: '#3b82f6', 
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        borderWidth: 2.5, 
                        tension: 0.2, 
                        fill: true,
                        pointRadius: 2,
                        pointBackgroundColor: '#3b82f6'
                    },
                    { 
                        label: 'Current Value', 
                        data: valueData, 
                        borderColor: '#10b981', 
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 2.5, 
                        tension: 0.2, 
                        fill: true,
                        pointRadius: 2,
                        pointBackgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { 
                        position: 'top', 
                        labels: { color: textColor, boxWidth: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.raw;
                                if (val === null || val === undefined) return null;
                                return `${ctx.dataset.label}: ৳${val.toLocaleString('bn-BD', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        ticks: { color: textColor, maxRotation: 45, font: { size: 9 } }, 
                        grid: { color: gridColor } 
                    },
                    y: { 
                        ticks: { color: textColor, callback: (v) => '৳' + v.toLocaleString() }, 
                        grid: { color: gridColor } 
                    }
                }
            }
        });

    } catch (error) {
        console.error('Chart render error:', error);
        if (loadingDiv) loadingDiv.innerHTML = '❌ Failed to load chart';
    }
}

// ==========================================
// ২. ড্যাশবোর্ড চার্ট রেন্ডার (ডেইলি P&L)
// ==========================================

async function renderDashboardDailyPLChart(startDate = null, endDate = null) {
    const canvas = document.getElementById('dashboardDailyPLChart');
    if (!canvas) return;

    const parent = canvas.parentElement;
    let loadingDiv = document.getElementById('daily-pl-chart-loading');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'daily-pl-chart-loading';
        loadingDiv.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; justify-content: center; align-items: center;
            color: var(--text-muted); font-size: 14px; z-index: 10;
            background: var(--bg-secondary); border-radius: 12px;
        `;
        loadingDiv.innerHTML = '⏳ Loading daily P&L...';
        if (parent) {
            parent.style.position = 'relative';
            parent.appendChild(loadingDiv);
        }
    } else {
        loadingDiv.style.display = 'flex';
        loadingDiv.innerHTML = '⏳ Loading daily P&L...';
    }

    try {
        const historyData = await fetchPortfolioTimelineData(startDate, endDate, window.currentDashboardPortfolioId);
        if (!historyData || historyData.length === 0) {
            if (loadingDiv) loadingDiv.innerHTML = '📭 No history data available';
            return;
        }

        const labels = historyData.map(item => item.date);
        const dailyPLData = historyData.map(item => item.dailyPL);

        let displayLabels = labels;
        let displayPL = dailyPLData;
        if (labels.length > 100) {
            const step = Math.ceil(labels.length / 100);
            displayLabels = labels.filter((_, index) => index % step === 0);
            displayPL = dailyPLData.filter((_, index) => index % step === 0);
        }

        if (loadingDiv) loadingDiv.remove();

        if (window.dailyPLChartInstance) {
            window.dailyPLChartInstance.destroy();
            window.dailyPLChartInstance = null;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f1f5f9' : '#1e293b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        const ctx = canvas.getContext('2d');
        window.dailyPLChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: displayLabels,
                datasets: [{
                    label: 'Daily P&L (৳)',
                    data: displayPL,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.2,
                    fill: true,
                    pointRadius: 2,
                    pointBackgroundColor: '#8b5cf6',
                    segment: {
                        borderColor: (ctx) => {
                            const value = ctx.p0.parsed.y;
                            return value >= 0 ? '#10b981' : '#ef4444';
                        }
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { 
                        display: true, 
                        position: 'top', 
                        labels: { color: textColor, boxWidth: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.raw;
                                if (val === null || val === undefined) return null;
                                return `Daily P&L: ${val >= 0 ? '+' : ''}৳${val.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        ticks: { color: textColor, maxRotation: 45, font: { size: 9 } }, 
                        grid: { color: gridColor } 
                    },
                    y: { 
                        ticks: { color: textColor, callback: (v) => '৳' + v.toFixed(0) }, 
                        grid: { color: gridColor } 
                    }
                }
            }
        });

    } catch (error) {
        console.error('Daily PL chart error:', error);
        if (loadingDiv) loadingDiv.innerHTML = '❌ Failed to load chart';
    }
}

// ==========================================
// ৩. ড্যাশবোর্ড ডেট ফিল্টার
// ==========================================

window.applyDashboardDateFilter = function() {
    const start = document.getElementById('dash-chart-start')?.value;
    const end = document.getElementById('dash-chart-end')?.value;
    if (start && end) {
        renderDashboardChartsWithRange(start, end);
    } else {
        if (typeof showToast === 'function') showToast('Please select both dates.', 'warning');
    }
};

window.resetDashboardDateFilter = function() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const start = thirtyDaysAgo.toISOString().split('T')[0];
    const end = today.toISOString().split('T')[0];
    const startInput = document.getElementById('dash-chart-start');
    const endInput = document.getElementById('dash-chart-end');
    if (startInput) startInput.value = start;
    if (endInput) endInput.value = end;
    renderDashboardChartsWithRange(start, end);
};

// ==========================================
// ৪. রেঞ্জ সহ চার্ট রেন্ডার (হেলপার)
// ==========================================

async function renderDashboardChartsWithRange(start, end) {
    const historyData = await fetchPortfolioTimelineData(start, end);
    if (!historyData || historyData.length === 0) {
        if (typeof showToast === 'function') showToast('No data in selected range.', 'warning');
        return;
    }
    await renderDashboardHistoryChart(start, end);
    await renderDashboardDailyPLChart(start, end);
}

// ==========================================
// 📌 গ্লোবাল এক্সপোজ
// ==========================================

window.renderDashboardHistoryChart = renderDashboardHistoryChart;
window.renderDashboardDailyPLChart = renderDashboardDailyPLChart;
window.applyDashboardDateFilter = window.applyDashboardDateFilter;
window.resetDashboardDateFilter = window.resetDashboardDateFilter;

console.log('✅ dash-charts.js loaded successfully');