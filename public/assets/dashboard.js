// ============================================================
//  VIETNEW ENTERTAINMENT - Dashboard JavaScript
// ============================================================

const API_BASE = '/api';

// ============= State =============
let currentPage = 'dashboard';
let categories = [];
let expensesPage = 1;
let currentUser = null;
const EXPENSES_PER_PAGE = 20;

// ============= Charts =============
let chartDaily = null;
let chartCategory = null;
let chartMonthly = null;

// ============= Initialize =============
document.addEventListener('DOMContentLoaded', async () => {
    // Check auth first
    await loadCurrentUser();
    setupNavigation();
    setupMobileMenu();
    loadDashboard();
    loadBotInfo();
    loadCategoriesFilter();
});

// ============= Navigation =============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const activePage = document.getElementById(`page-${page}`);
    if (activePage) activePage.classList.add('active');

    // Close mobile menu
    document.getElementById('sidebar').classList.remove('open');

    // Load page data
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'expenses':
            expensesPage = 1;
            loadExpenses();
            break;
        case 'categories':
            loadCategories();
            break;
        case 'reports':
            loadReportUsersFilter();
            setReportPeriod(currentReportPeriod);
            break;
        case 'settings':
            loadBotInfo();
            break;
        case 'users':
            loadUsers();
            break;
    }
}

function setupMobileMenu() {
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.getElementById('main-content').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });
}

// ============= API Helpers =============
async function apiGet(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (res.status === 401) { window.location.href = '/login'; return { ok: false }; }
    return res.json();
}

async function apiPost(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (res.status === 401) { window.location.href = '/login'; return { ok: false }; }
    return res.json();
}

async function apiPut(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (res.status === 401) { window.location.href = '/login'; return { ok: false }; }
    return res.json();
}

async function apiDelete(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
    if (res.status === 401) { window.location.href = '/login'; return { ok: false }; }
    return res.json();
}

// ============= Auth & User Info =============
async function loadCurrentUser() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }
        const data = await res.json();
        if (data.ok) {
            currentUser = data.result;
            const nameEl = document.getElementById('sidebar-user-name');
            const roleEl = document.getElementById('sidebar-user-role');
            if (nameEl) nameEl.textContent = currentUser.display_name || 'User';
            if (roleEl) {
                roleEl.textContent = currentUser.role === 'admin' ? '🛡️ Admin' : '👤 User';
            }
            // Show/hide admin-only nav items
            const usersNav = document.getElementById('nav-users');
            if (usersNav && currentUser.role !== 'admin') {
                usersNav.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Auth check error:', err);
    }
}

// ============= Format Helpers =============
function formatCurrency(amount) {
    if (!amount || amount === 0) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// ============= Dashboard Page =============
async function loadDashboard() {
    try {
        const [statsRes, dailyRes, summaryRes] = await Promise.all([
            apiGet('/stats'),
            apiGet('/reports/daily-trend?days=30'),
            apiGet('/reports/summary'),
        ]);

        if (statsRes.ok) {
            const { today, month, all_time, recent } = statsRes.result;

            document.getElementById('stat-today').textContent = formatCurrency(today.total);
            document.getElementById('stat-today-count').textContent = `${today.count} giao dịch`;
            document.getElementById('stat-month').textContent = formatCurrency(month.total);
            document.getElementById('stat-month-count').textContent = `${month.count} giao dịch`;
            document.getElementById('stat-total').textContent = formatCurrency(all_time.total);
            document.getElementById('stat-total-count').textContent = `${all_time.count} giao dịch`;

            // Average per day
            const avg = dailyRes.ok && dailyRes.result.length > 0
                ? dailyRes.result.reduce((s, d) => s + d.total, 0) / dailyRes.result.length
                : 0;
            document.getElementById('stat-avg').textContent = formatCurrency(avg);

            // Recent table
            renderRecentTable(recent);
        }

        // Daily chart
        if (dailyRes.ok) {
            renderDailyChart(dailyRes.result);
        }

        // Category chart
        if (summaryRes.ok) {
            renderCategoryChart(summaryRes.result.by_category);
        }

    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

function renderRecentTable(expenses) {
    const tbody = document.getElementById('recent-tbody');
    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Chưa có chi tiêu nào. Hãy nhắn tin cho Bot trên Zalo để ghi nhận!</td></tr>';
        return;
    }

    tbody.innerHTML = expenses.map(e => `
    <tr>
      <td><strong>#${e.id}</strong></td>
      <td>${escapeHtml(e.description)}</td>
      <td>
        <span class="category-badge" style="background:${e.category_color || '#9E9E9E'}20;color:${e.category_color || '#9E9E9E'}">
          ${e.category_icon || '📦'} ${e.category_name || 'Chưa phân loại'}
        </span>
      </td>
      <td class="amount">${formatCurrency(e.amount)}</td>
      <td>${e.zalo_user_name || e.created_by || '-'}</td>
      <td class="time-text">${formatDate(e.created_at)}</td>
    </tr>
  `).join('');
}

function renderDailyChart(data) {
    const ctx = document.getElementById('chart-daily');
    if (!ctx) return;

    if (chartDaily) chartDaily.destroy();

    const labels = data.map(d => {
        const parts = d.day.split('-');
        return `${parts[2]}/${parts[1]}`;
    });

    chartDaily = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Chi tiêu (VND)',
                data: data.map(d => d.total),
                borderColor: '#00582a',
                backgroundColor: 'rgba(0, 88, 42, 0.08)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#00582a',
                pointHoverRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => formatCurrency(ctx.raw),
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v) => {
                            if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
                            if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
                            return v;
                        },
                        font: { size: 11 },
                        color: '#8a9590',
                    },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                x: {
                    ticks: { font: { size: 11 }, color: '#8a9590', maxRotation: 45 },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderCategoryChart(data) {
    const ctx = document.getElementById('chart-category');
    if (!ctx) return;

    if (chartCategory) chartCategory.destroy();

    if (!data || data.length === 0) {
        chartCategory = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Chưa có dữ liệu'],
                datasets: [{ data: [1], backgroundColor: ['#e2e8e4'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    chartCategory = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(c => `${c.icon} ${c.name}`),
            datasets: [{
                data: data.map(c => c.total),
                backgroundColor: data.map(c => c.color || '#00582a'),
                borderWidth: 2,
                borderColor: '#ffffff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return `${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ============= Expenses Page =============
async function loadExpenses() {
    try {
        const search = document.getElementById('filter-search')?.value || '';
        const category_id = document.getElementById('filter-category')?.value || '';
        const from_date = document.getElementById('filter-from')?.value || '';
        const to_date = document.getElementById('filter-to')?.value || '';
        const offset = (expensesPage - 1) * EXPENSES_PER_PAGE;

        const params = new URLSearchParams({
            limit: EXPENSES_PER_PAGE,
            offset,
            ...(search && { search }),
            ...(category_id && { category_id }),
            ...(from_date && { from_date }),
            ...(to_date && { to_date }),
        });

        const res = await apiGet(`/expenses?${params}`);

        if (res.ok) {
            renderExpensesTable(res.result.rows);
            renderPagination(res.result.total);
        }
    } catch (err) {
        console.error('Load expenses error:', err);
    }
}

function renderExpensesTable(expenses) {
    const tbody = document.getElementById('expenses-tbody');
    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Không có chi tiêu nào</td></tr>';
        return;
    }

    tbody.innerHTML = expenses.map(e => `
    <tr>
      <td><strong>#${e.id}</strong></td>
      <td>${escapeHtml(e.description)}</td>
      <td>
        <span class="category-badge" style="background:${e.category_color || '#9E9E9E'}20;color:${e.category_color || '#9E9E9E'}">
          ${e.category_icon || '📦'} ${e.category_name || 'Chưa phân loại'}
        </span>
      </td>
      <td class="amount">${formatCurrency(e.amount)}</td>
      <td>${escapeHtml(e.note || '-')}</td>
      <td>${e.zalo_user_name || e.created_by || '-'}</td>
      <td class="time-text">${formatDate(e.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-icon" onclick="editExpense(${e.id})" title="Sửa"><i class="fas fa-edit"></i></button>
          <button class="btn-icon delete" onclick="deleteExpenseItem(${e.id})" title="Xóa"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPagination(total) {
    const container = document.getElementById('expenses-pagination');
    const pages = Math.ceil(total / EXPENSES_PER_PAGE);

    if (pages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    if (expensesPage > 1) {
        html += `<button onclick="goToExpensePage(${expensesPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
    }

    const startPage = Math.max(1, expensesPage - 2);
    const endPage = Math.min(pages, expensesPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === expensesPage ? 'active' : ''}" onclick="goToExpensePage(${i})">${i}</button>`;
    }

    if (expensesPage < pages) {
        html += `<button onclick="goToExpensePage(${expensesPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
    }

    container.innerHTML = html;
}

function goToExpensePage(page) {
    expensesPage = page;
    loadExpenses();
}

function resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    expensesPage = 1;
    loadExpenses();
}

// ============= Add/Edit Expense =============
function openAddExpense() {
    document.getElementById('expense-modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> Thêm chi tiêu mới';
    document.getElementById('expense-edit-id').value = '';
    document.getElementById('expense-desc').value = '';
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-category').value = '';
    document.getElementById('expense-note').value = '';
    loadCategoriesFilter();
    openModal('expense-modal');
}

async function editExpense(id) {
    try {
        const res = await apiGet(`/expenses?search=&limit=1&offset=0`);
        // Simple approach - load the expense directly
        document.getElementById('expense-modal-title').innerHTML = '<i class="fas fa-edit"></i> Sửa chi tiêu';
        document.getElementById('expense-edit-id').value = id;
        openModal('expense-modal');
        loadCategoriesFilter();
    } catch (err) {
        showToast('Lỗi khi tải chi tiêu', 'error');
    }
}

async function saveExpense() {
    const editId = document.getElementById('expense-edit-id').value;
    const description = document.getElementById('expense-desc').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const category_id = document.getElementById('expense-category').value;
    const note = document.getElementById('expense-note').value.trim();

    if (!description) return showToast('Vui lòng nhập mô tả', 'error');
    if (!amount || amount <= 0) return showToast('Vui lòng nhập số tiền hợp lệ', 'error');
    if (!category_id) return showToast('Vui lòng chọn danh mục', 'error');

    try {
        const data = {
            description,
            amount,
            category_id: parseInt(category_id),
            note,
            created_by: 'dashboard',
        };

        if (editId) {
            await apiPut(`/expenses/${editId}`, data);
            showToast('Đã cập nhật chi tiêu', 'success');
        } else {
            await apiPost('/expenses', data);
            showToast('Đã thêm chi tiêu mới', 'success');
        }

        closeModal('expense-modal');
        loadExpenses();
        if (currentPage === 'dashboard') loadDashboard();
    } catch (err) {
        showToast('Lỗi khi lưu chi tiêu', 'error');
    }
}

async function deleteExpenseItem(id) {
    if (!confirm('Bạn có chắc muốn xóa chi tiêu này?')) return;
    try {
        await apiDelete(`/expenses/${id}`);
        showToast('Đã xóa chi tiêu', 'success');
        loadExpenses();
        if (currentPage === 'dashboard') loadDashboard();
    } catch (err) {
        showToast('Lỗi khi xóa', 'error');
    }
}

// ============= Categories Page =============
async function loadCategories() {
    try {
        const res = await apiGet('/categories');
        if (res.ok) {
            categories = res.result;
            renderCategories(categories);
        }
    } catch (err) {
        console.error('Load categories error:', err);
    }
}

function renderCategories(cats) {
    const grid = document.getElementById('categories-grid');
    if (!cats || cats.length === 0) {
        grid.innerHTML = '<p class="empty-state">Chưa có danh mục nào</p>';
        return;
    }

    grid.innerHTML = cats.map(c => `
    <div class="category-card">
      <div class="category-icon" style="background:${c.color}15;">
        <span>${c.icon}</span>
      </div>
      <div class="category-info">
        <div class="category-name">${escapeHtml(c.name)}</div>
        <div class="category-count" style="color:${c.color}">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color};margin-right:4px;"></span>
          ${c.color}
        </div>
      </div>
      <div class="category-actions">
        <button class="btn-icon delete" onclick="deleteCategory(${c.id})" title="Xóa">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function openAddCategory() {
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-icon').value = '📦';
    document.getElementById('cat-color').value = '#00582a';
    openModal('category-modal');
}

async function saveCategory() {
    const name = document.getElementById('cat-name').value.trim();
    const icon = document.getElementById('cat-icon').value.trim() || '📦';
    const color = document.getElementById('cat-color').value;

    if (!name) return showToast('Vui lòng nhập tên danh mục', 'error');

    try {
        await apiPost('/categories', { name, icon, color });
        showToast('Đã thêm danh mục mới', 'success');
        closeModal('category-modal');
        loadCategories();
        loadCategoriesFilter();
    } catch (err) {
        showToast('Lỗi khi thêm danh mục', 'error');
    }
}

async function deleteCategory(id) {
    if (!confirm('Xóa danh mục này? Các chi tiêu liên quan sẽ trở thành "Chưa phân loại".')) return;
    try {
        await apiDelete(`/categories/${id}`);
        showToast('Đã xóa danh mục', 'success');
        loadCategories();
        loadCategoriesFilter();
    } catch (err) {
        showToast('Lỗi khi xóa danh mục', 'error');
    }
}

async function loadCategoriesFilter() {
    try {
        const res = await apiGet('/categories');
        if (res.ok) {
            categories = res.result;

            const selects = ['filter-category', 'expense-category'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const currentVal = el.value;
                el.innerHTML = '<option value="">Tất cả</option>' +
                    categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
                if (id === 'expense-category') {
                    el.innerHTML = '<option value="">Chọn danh mục</option>' +
                        categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
                }
                el.value = currentVal;
            });
        }
    } catch (err) {
        console.error('Load categories filter error:', err);
    }
}

// ============= Reports Page =============
let currentReportPeriod = 'week';

function setReportPeriod(period) {
    currentReportPeriod = period;
    const now = new Date();
    let from_date = '';
    let to_date = now.toISOString().split('T')[0];

    // Update active button
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });

    switch (period) {
        case 'week': {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
            from_date = weekStart.toISOString().split('T')[0];
            break;
        }
        case 'month': {
            from_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            break;
        }
        case 'year': {
            from_date = `${now.getFullYear()}-01-01`;
            break;
        }
        case 'all': {
            from_date = '';
            to_date = '';
            break;
        }
        case 'custom': {
            // Use values from date inputs
            from_date = document.getElementById('report-from')?.value || '';
            to_date = document.getElementById('report-to')?.value || '';
            break;
        }
    }

    // Set date inputs to reflect the period
    if (period !== 'custom') {
        const fromEl = document.getElementById('report-from');
        const toEl = document.getElementById('report-to');
        if (fromEl) fromEl.value = from_date;
        if (toEl) toEl.value = to_date;
    }

    loadReports();
}

async function loadReportUsersFilter() {
    try {
        const res = await apiGet('/users');
        if (res.ok) {
            const select = document.getElementById('report-user');
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">👥 Tất cả</option>' +
                res.result
                    .filter(u => u.is_active)
                    .map(u => `<option value="${u.zalo_user_id}">${u.display_name || u.zalo_user_id}</option>`)
                    .join('');
            select.value = currentVal;
        }
    } catch (err) {
        console.error('Load report users error:', err);
    }
}

async function loadReports() {
    try {
        const from_date = document.getElementById('report-from')?.value || '';
        const to_date = document.getElementById('report-to')?.value || '';
        const zalo_user_id = document.getElementById('report-user')?.value || '';

        const params = new URLSearchParams({
            ...(from_date && { from_date }),
            ...(to_date && { to_date }),
            ...(zalo_user_id && { zalo_user_id }),
        });

        const [monthlyRes, topRes, summaryRes] = await Promise.all([
            apiGet(`/reports/monthly-trend?months=12${zalo_user_id ? '&zalo_user_id=' + zalo_user_id : ''}`),
            apiGet(`/reports/top-expenses?${params}`),
            apiGet(`/reports/summary?${params}`),
        ]);

        // Monthly chart
        if (monthlyRes.ok) {
            renderMonthlyChart(monthlyRes.result);
        }

        // Top expenses
        if (topRes.ok) {
            renderTopExpenses(topRes.result);
        }

        // Category summary bars + summary cards
        if (summaryRes.ok) {
            renderCategorySummaryBars(summaryRes.result);

            // Update summary cards
            const total = summaryRes.result.total_amount || 0;
            const count = summaryRes.result.total_count || 0;
            const avg = count > 0 ? total / count : 0;
            const catCount = summaryRes.result.by_category?.length || 0;

            document.getElementById('report-total').textContent = formatCurrency(total);
            document.getElementById('report-count').textContent = count;
            document.getElementById('report-avg').textContent = formatCurrency(avg);
            document.getElementById('report-cat-count').textContent = catCount;
        }

    } catch (err) {
        console.error('Load reports error:', err);
    }
}

function renderMonthlyChart(data) {
    const ctx = document.getElementById('chart-monthly');
    if (!ctx) return;

    if (chartMonthly) chartMonthly.destroy();

    if (!data || data.length === 0) {
        chartMonthly = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Chưa có dữ liệu'], datasets: [{ data: [0] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    chartMonthly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.month),
            datasets: [{
                label: 'Chi tiêu (VND)',
                data: data.map(d => d.total),
                backgroundColor: 'rgba(0, 88, 42, 0.7)',
                borderColor: '#00582a',
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => formatCurrency(ctx.raw),
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v) => {
                            if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
                            if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
                            return v;
                        },
                        font: { size: 11 },
                        color: '#8a9590',
                    },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                x: {
                    ticks: { font: { size: 11 }, color: '#8a9590' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderTopExpenses(expenses) {
    const tbody = document.getElementById('top-expenses-tbody');
    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Không có dữ liệu</td></tr>';
        return;
    }

    tbody.innerHTML = expenses.map((e, i) => `
    <tr>
      <td><strong>${i + 1}</strong></td>
      <td>${escapeHtml(e.description)}</td>
      <td>
        <span class="category-badge" style="background:${e.category_color || '#9E9E9E'}20;color:${e.category_color || '#9E9E9E'}">
          ${e.category_icon || '📦'} ${e.category_name || 'Chưa phân loại'}
        </span>
      </td>
      <td class="amount">${formatCurrency(e.amount)}</td>
      <td class="time-text">${formatDate(e.created_at)}</td>
    </tr>
  `).join('');
}

function renderCategorySummaryBars(summary) {
    const container = document.getElementById('category-summary-bars');
    if (!summary || !summary.by_category || summary.by_category.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding:20px;">Chưa có dữ liệu chi tiêu</p>';
        return;
    }

    const maxTotal = Math.max(...summary.by_category.map(c => c.total));

    container.innerHTML = summary.by_category.map(cat => {
        const pct = maxTotal > 0 ? (cat.total / maxTotal * 100).toFixed(1) : 0;
        const totalPct = summary.total_amount > 0 ? ((cat.total / summary.total_amount) * 100).toFixed(1) : 0;
        return `
      <div class="summary-bar-item">
        <div class="summary-bar-header">
          <span class="summary-bar-label">${cat.icon} ${cat.name} <small style="color:var(--text-muted)">(${totalPct}%)</small></span>
          <span class="summary-bar-value">${formatCurrency(cat.total)}</span>
        </div>
        <div class="summary-bar-track">
          <div class="summary-bar-fill" style="width:${pct}%;background:${cat.color || '#00582a'}"></div>
        </div>
      </div>
    `;
    }).join('');
}

// ============= Settings Page =============
async function loadBotInfo() {
    try {
        const res = await apiGet('/bot-info');

        if (res.ok && res.result) {
            const { bot, webhook, mode } = res.result;

            if (bot) {
                document.getElementById('bot-name').textContent = bot.account_name || '-';
                document.getElementById('bot-type').textContent = bot.account_type || '-';
                document.getElementById('bot-connection-status').innerHTML = '<span style="color:#22c55e">✅ Đã kết nối</span>';

                // Update sidebar status
                const statusEl = document.getElementById('bot-status');
                statusEl.innerHTML = '<div class="status-dot online"></div><span>Bot đang hoạt động</span>';
            } else {
                document.getElementById('bot-connection-status').innerHTML = '<span style="color:#ef4444">❌ Không kết nối được</span>';
            }

            document.getElementById('bot-mode').textContent = mode === 'polling' ? '🔄 Long Polling' : '🌐 Webhook';

            if (webhook && webhook.url) {
                document.getElementById('webhook-url').textContent = webhook.url;
            } else {
                document.getElementById('webhook-url').textContent = 'Chưa cấu hình';
            }
        }
    } catch (err) {
        console.error('Load bot info error:', err);
        document.getElementById('bot-connection-status').innerHTML = '<span style="color:#ef4444">❌ Lỗi kết nối server</span>';
    }
}

async function setWebhookUrl() {
    const url = document.getElementById('new-webhook-url').value.trim();
    if (!url) return showToast('Vui lòng nhập Webhook URL', 'error');

    try {
        const res = await apiPost('/webhook/set', { url });
        if (res.ok) {
            showToast('Đã thiết lập Webhook thành công!', 'success');
            loadBotInfo();
        } else {
            showToast('Lỗi: ' + (res.error || 'Không rõ'), 'error');
        }
    } catch (err) {
        showToast('Lỗi kết nối', 'error');
    }
}

async function deleteWebhookUrl() {
    if (!confirm('Bạn có chắc muốn xóa cấu hình Webhook?')) return;
    try {
        const res = await apiPost('/webhook/delete', {});
        if (res.ok) {
            showToast('Đã xóa Webhook', 'success');
            loadBotInfo();
        }
    } catch (err) {
        showToast('Lỗi khi xóa Webhook', 'error');
    }
}

async function startPollingMode() {
    try {
        const res = await apiPost('/polling/start', {});
        if (res.ok) {
            showToast('Đã bắt đầu chế độ Polling', 'success');
            setTimeout(loadBotInfo, 1000);
        }
    } catch (err) {
        showToast('Lỗi', 'error');
    }
}

async function stopPollingMode() {
    try {
        const res = await apiPost('/polling/stop', {});
        if (res.ok) {
            showToast('Đã dừng Polling', 'success');
            loadBotInfo();
        }
    } catch (err) {
        showToast('Lỗi', 'error');
    }
}

// ============= Modal Helpers =============
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
        e.target.classList.remove('active');
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// ============= Toast =============
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============= Utils =============
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============= Users Management =============
async function loadUsers() {
    try {
        const res = await apiGet('/users');
        if (res.ok) {
            renderUsersTable(res.result);
        }
    } catch (err) {
        console.error('Load users error:', err);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Chưa có người dùng nào</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>#${u.id}</strong></td>
      <td><code style="background:rgba(0,88,42,0.08);padding:2px 8px;border-radius:4px;font-size:0.82rem;">${escapeHtml(u.zalo_user_id)}</code></td>
      <td>${escapeHtml(u.display_name) || '<span style="color:var(--text-muted)">Chưa có tên</span>'}</td>
      <td>
        <span class="category-badge" style="background:${u.role === 'admin' ? '#00582a20' : '#3b82f620'};color:${u.role === 'admin' ? '#00582a' : '#3b82f6'}">
          ${u.role === 'admin' ? '🛡️ Admin' : '👤 User'}
        </span>
      </td>
      <td>
        <span style="color:${u.is_active ? '#22c55e' : '#ef4444'};font-weight:600;">
          ${u.is_active ? '✅ Hoạt động' : '⛔ Bị khóa'}
        </span>
      </td>
      <td class="time-text">${formatDate(u.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-icon" onclick="toggleUserActive(${u.id}, ${u.is_active ? 0 : 1})" title="${u.is_active ? 'Khóa' : 'Mở khóa'}">
            <i class="fas fa-${u.is_active ? 'lock' : 'unlock'}"></i>
          </button>
          <button class="btn-icon delete" onclick="deleteUser(${u.id})" title="Xóa">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddUser() {
    if (currentUser?.role !== 'admin') {
        showToast('Chỉ Admin mới có quyền thêm người dùng', 'error');
        return;
    }
    document.getElementById('user-zalo-id').value = '';
    document.getElementById('user-display-name').value = '';
    document.getElementById('user-role').value = 'user';
    openModal('user-modal');
}

async function saveUser() {
    const zalo_user_id = document.getElementById('user-zalo-id').value.trim();
    const display_name = document.getElementById('user-display-name').value.trim();
    const role = document.getElementById('user-role').value;

    if (!zalo_user_id) return showToast('Vui lòng nhập Zalo User ID', 'error');

    try {
        const res = await apiPost('/users', { zalo_user_id, display_name, role });
        if (res.ok) {
            showToast('Đã thêm người dùng', 'success');
            closeModal('user-modal');
            loadUsers();
        } else {
            showToast(res.error || 'Lỗi khi thêm', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi thêm người dùng', 'error');
    }
}

async function toggleUserActive(id, newState) {
    try {
        const res = await apiPut(`/users/${id}`, { is_active: newState });
        if (res.ok) {
            showToast(newState ? 'Đã mở khóa người dùng' : 'Đã khóa người dùng', 'success');
            loadUsers();
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('Bạn có chắc muốn xóa người dùng này?')) return;
    try {
        const res = await apiDelete(`/users/${id}`);
        if (res.ok) {
            showToast('Đã xóa người dùng', 'success');
            loadUsers();
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi xóa', 'error');
    }
}
