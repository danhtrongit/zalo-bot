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
            loadExpenseUsersFilter();
            setExpensePeriod(currentExpensePeriod);
            if (currentUser?.is_admin) {
                loadPendingActions();
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
            break;
        case 'categories':
            loadCategories();
            break;
        case 'settings':
            loadBotInfo();
            loadCompanySettings();
            loadClearDataUserList();
            if (currentUser?.is_admin) {
                document.querySelectorAll('#page-settings .admin-only').forEach(el => el.style.display = '');
            } else {
                document.querySelectorAll('#page-settings .admin-only').forEach(el => el.style.display = 'none');
            }
            break;
        case 'users':
            loadUsers();
            break;
        case 'payment-requests':
            loadPRUsersFilter();
            setPRPeriod(currentPRPeriod);
            break;
        case 'advances':
            loadAdvances();
            break;
        case 'deleted':
            loadDeletedExpenses();
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
        const res = await fetch('/api/me');
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
                roleEl.textContent = currentUser.is_admin ? '🛡️ Admin' : '👤 Nhân viên';
            }

            const isAdmin = currentUser.is_admin;

            // Hide admin-only nav items for regular users
            ['nav-users', 'nav-settings', 'nav-categories'].forEach(id => {
                const el = document.getElementById(id);
                if (el && !isAdmin) el.style.display = 'none';
            });

            // Show pending actions badge for admin
            if (isAdmin) {
                loadPendingCount();
            }
        }
    } catch (err) {
        console.error('Auth check error:', err);
    }
}

async function loadPendingCount() {
    try {
        const res = await apiGet('/pending-actions/count');
        if (res.ok && res.result.count > 0) {
            const badge = document.getElementById('pending-badge');
            if (badge) {
                badge.textContent = res.result.count;
                badge.style.display = 'inline-flex';
            }
        }
    } catch (e) { /* ignore */ }
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
let currentExpensePeriod = 'month';

async function loadExpenses() {
    try {
        const search = document.getElementById('filter-search')?.value || '';
        const category_id = document.getElementById('filter-category')?.value || '';
        const from_date = document.getElementById('filter-from')?.value || '';
        const to_date = document.getElementById('filter-to')?.value || '';
        const filterUser = document.getElementById('filter-user')?.value || '';
        const offset = (expensesPage - 1) * EXPENSES_PER_PAGE;

        const params = new URLSearchParams({
            limit: EXPENSES_PER_PAGE,
            offset,
            ...(search && { search }),
            ...(category_id && { category_id }),
            ...(from_date && { from_date }),
            ...(to_date && { to_date }),
            ...(filterUser && { zalo_user_id: filterUser }),
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

function setExpensePeriod(period) {
    currentExpensePeriod = period;
    const now = new Date();
    let fromDate = '';
    let toDate = now.toISOString().split('T')[0];

    if (period === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay() + 1); // Monday
        fromDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
        fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
        fromDate = '';
        toDate = '';
    }

    document.getElementById('filter-from').value = fromDate;
    document.getElementById('filter-to').value = toDate;

    // Update button styles
    document.querySelectorAll('#expense-period-btns button').forEach(b => {
        b.className = b.dataset.period === period ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline-secondary';
    });

    expensesPage = 1;
    loadExpenses();
}

async function loadExpenseUsersFilter() {
    if (!currentUser?.is_admin) return;
    try {
        const res = await apiGet('/users');
        if (res.ok) {
            const select = document.getElementById('filter-user');
            if (!select) return;
            select.innerHTML = '<option value="">\uD83D\uDC65 T\u1EA5t c\u1EA3</option>';
            res.result.forEach(u => {
                select.innerHTML += `<option value="${u.zalo_user_id}">${escapeHtml(u.display_name || u.zalo_user_id)}</option>`;
            });
        }
    } catch (err) { /* skip */ }
}

function renderExpensesTable(expenses) {
    const tbody = document.getElementById('expenses-tbody');
    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Không có chi tiêu nào</td></tr>';
        return;
    }

    tbody.innerHTML = expenses.map(e => `
    <tr>
      <td data-label="ID"><strong>#${e.id}</strong></td>
      <td data-label="Mô tả">${escapeHtml(e.description)}</td>
      <td data-label="Danh mục">
        <span class="category-badge" style="background:${e.category_color || '#9E9E9E'}20;color:${e.category_color || '#9E9E9E'}">
          ${e.category_icon || '📦'} ${e.category_name || 'Chưa phân loại'}
        </span>
      </td>
      <td data-label="Số tiền" class="amount">${formatCurrency(e.amount)}</td>
      <td data-label="Ảnh">${e.image_url
            ? `<a href="${e.image_url}" target="_blank" title="Xem ảnh hoá đơn"><img src="${e.image_url}" class="receipt-thumb" style="width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--border);" alt="bill"></a>`
            : '<span style="color:var(--text-muted)">-</span>'}</td>
      <td data-label="Ghi chú">${escapeHtml(e.note || '-')}</td>
      <td data-label="Người">${e.zalo_user_name || e.created_by || '-'}</td>
      <td data-label="Ngày" class="time-text">${formatDate(e.created_at)}</td>
      <td data-label="">
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
    const filterUser = document.getElementById('filter-user');
    if (filterUser) filterUser.value = '';
    expensesPage = 1;
    setExpensePeriod('month');
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
        document.getElementById('expense-modal-title').innerHTML = '<i class="fas fa-edit"></i> Sửa chi tiêu';
        document.getElementById('expense-edit-id').value = id;
        // Show reason field for non-admin
        const reasonGroup = document.getElementById('expense-reason-group');
        if (reasonGroup) {
            reasonGroup.style.display = currentUser?.is_admin ? 'none' : 'block';
            document.getElementById('expense-reason').value = '';
        }
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
    const reason = document.getElementById('expense-reason')?.value?.trim() || '';

    if (!description) return showToast('Vui lòng nhập mô tả', 'error');
    if (!amount || amount < 1000) return showToast('Số tiền tối thiểu là 1.000 ₫', 'error');
    if (!category_id) return showToast('Vui lòng chọn danh mục', 'error');
    if (editId && !currentUser?.is_admin && !reason) return showToast('Vui lòng nhập lý do sửa', 'error');

    const data = { description, amount, category_id: parseInt(category_id), note };

    try {
        if (editId) {
            const res = await apiPost('/pending-actions', {
                action_type: 'edit',
                expense_id: parseInt(editId),
                new_data: data,
                reason,
            });
            if (res.ok) {
                if (res.direct) {
                    showToast('Đã cập nhật chi tiêu', 'success');
                } else {
                    showToast('Đã gửi yêu cầu sửa cho Admin duyệt', 'info');
                }
            } else {
                showToast(res.error || 'Lỗi', 'error');
            }
        } else {
            await apiPost('/expenses', { ...data, created_by: 'dashboard' });
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
    const isAdmin = currentUser?.is_admin;
    let reason = '';
    if (!isAdmin) {
        reason = prompt('Nhập lý do xóa (bắt buộc):');
        if (!reason) return showToast('Vui lòng nhập lý do xóa', 'error');
    } else {
        if (!confirm('Bạn có chắc muốn xóa chi tiêu này?')) return;
        reason = 'Admin xóa trực tiếp';
    }
    try {
        const res = await apiPost('/pending-actions', {
            action_type: 'delete',
            expense_id: id,
            reason,
        });
        if (res.ok) {
            if (res.direct) {
                showToast('Đã xóa chi tiêu', 'success');
            } else {
                showToast('Đã gửi yêu cầu xóa cho Admin duyệt', 'info');
            }
            loadExpenses();
            if (currentPage === 'dashboard') loadDashboard();
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi xóa', 'error');
    }
}

// ============= Pending Actions (Admin) =============
async function loadPendingActions() {
    try {
        const res = await apiGet('/pending-actions');
        if (res.ok) {
            renderPendingActions(res.result);
        }
    } catch (err) { console.error(err); }
}

function renderPendingActions(actions) {
    const container = document.getElementById('pending-actions-list');
    if (!container) return;
    if (!actions || actions.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;color:var(--text-muted);">Không có yêu cầu nào chờ duyệt</div>';
        return;
    }
    container.innerHTML = actions.map(a => {
        const actionIcon = a.action_type === 'delete' ? '🗑️ Xóa' : '✏️ Sửa';
        const oldData = a.old_data ? JSON.parse(a.old_data) : {};
        const newData = a.new_data ? JSON.parse(a.new_data) : {};
        return `
        <div class="pending-item" style="padding:12px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;background:var(--bg-card);">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;flex-wrap:wrap;">
                <div>
                    <span style="font-weight:600;color:${a.action_type === 'delete' ? '#ef4444' : '#f59e0b'};">${actionIcon}</span>
                    <strong>#${a.expense_id}</strong> — ${a.expense_description || oldData.description || '?'}
                    <span style="color:var(--text-muted);font-size:0.85rem;">(${formatCurrency(a.expense_amount || oldData.amount)})</span>
                    <br><span style="font-size:0.8rem;color:var(--text-muted);">👤 ${a.requested_by_name} • ${formatDate(a.created_at)}</span>
                    ${a.action_type === 'edit' && newData ? `<br><span style="font-size:0.8rem;color:#3b82f6;">→ ${newData.description || ''} ${newData.amount ? formatCurrency(newData.amount) : ''}</span>` : ''}
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-primary btn-sm" onclick="approveAction(${a.id})"><i class="fas fa-check"></i> Duyệt</button>
                    <button class="btn btn-danger btn-sm" onclick="rejectAction(${a.id})"><i class="fas fa-times"></i> Từ chối</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function approveAction(id) {
    try {
        const res = await apiPost(`/pending-actions/${id}/approve`);
        if (res.ok) {
            showToast('Đã duyệt', 'success');
            loadPendingActions();
            loadPendingCount();
            loadExpenses();
        } else { showToast(res.error || 'Lỗi', 'error'); }
    } catch (err) { showToast('Lỗi', 'error'); }
}

async function rejectAction(id) {
    try {
        const res = await apiPost(`/pending-actions/${id}/reject`);
        if (res.ok) {
            showToast('Đã từ chối', 'success');
            loadPendingActions();
            loadPendingCount();
        } else { showToast(res.error || 'Lỗi', 'error'); }
    } catch (err) { showToast('Lỗi', 'error'); }
}

function togglePendingPanel() {
    const list = document.getElementById('pending-actions-list');
    if (list) list.style.display = list.style.display === 'none' ? '' : 'none';
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

// (Reports page removed)


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
    const modal = new bootstrap.Modal(document.getElementById(id));
    modal.show();
}

function closeModal(id) {
    const modalEl = document.getElementById(id);
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}




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
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Chưa có người dùng nào</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => `
    <tr>
      <td data-label="ID"><strong>#${u.id}</strong></td>
      <td data-label="Zalo ID"><code style="background:rgba(0,88,42,0.08);padding:2px 8px;border-radius:4px;font-size:0.82rem;">${escapeHtml(u.zalo_user_id)}</code></td>
      <td data-label="Tên">${escapeHtml(u.display_name) || '<span style="color:var(--text-muted)">Chưa có tên</span>'}</td>
      <td data-label="Phòng ban">${escapeHtml(u.department || '') || '<span style="color:var(--text-muted)">-</span>'}</td>
      <td data-label="Vai trò">
        <span class="category-badge" style="background:${u.role === 'admin' ? '#00582a20' : '#3b82f620'};color:${u.role === 'admin' ? '#00582a' : '#3b82f6'}">
          ${u.role === 'admin' ? '🛡️ Admin' : '👤 User'}
        </span>
      </td>
      <td data-label="Trạng thái">
        <span style="color:${u.is_active ? '#22c55e' : '#ef4444'};font-weight:600;">
          ${u.is_active ? '✅ Hoạt động' : '⛔ Bị khóa'}
        </span>
      </td>
      <td data-label="Ngày thêm" class="time-text">${formatDate(u.created_at)}</td>
      <td data-label="">
        <div style="display:flex;gap:4px;">
          <button class="btn-icon" onclick='editUser(${JSON.stringify(u).replace(/'/g, "&#39;")})' title="Sửa">
            <i class="fas fa-edit"></i>
          </button>
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
    document.getElementById('user-modal-title').innerHTML = '<i class="fas fa-user-plus"></i> Thêm người dùng';
    document.getElementById('user-edit-id').value = '';
    document.getElementById('user-zalo-id').value = '';
    document.getElementById('user-zalo-id').disabled = false;
    document.getElementById('user-display-name').value = '';
    document.getElementById('user-department').value = '';
    document.getElementById('user-role').value = 'user';
    openModal('user-modal');
}

function editUser(user) {
    if (currentUser?.role !== 'admin') {
        showToast('Chỉ Admin mới có quyền chỉnh sửa', 'error');
        return;
    }
    document.getElementById('user-modal-title').innerHTML = '<i class="fas fa-user-edit"></i> Chỉnh sửa người dùng';
    document.getElementById('user-edit-id').value = user.id;
    document.getElementById('user-zalo-id').value = user.zalo_user_id;
    document.getElementById('user-zalo-id').disabled = true;
    document.getElementById('user-display-name').value = user.display_name || '';
    document.getElementById('user-department').value = user.department || '';
    document.getElementById('user-role').value = user.role || 'user';
    openModal('user-modal');
}

async function saveUser() {
    const editId = document.getElementById('user-edit-id').value;
    const zalo_user_id = document.getElementById('user-zalo-id').value.trim();
    const display_name = document.getElementById('user-display-name').value.trim();
    const department = document.getElementById('user-department').value.trim();
    const role = document.getElementById('user-role').value;

    if (!editId && !zalo_user_id) return showToast('Vui lòng nhập Zalo User ID', 'error');

    try {
        let res;
        if (editId) {
            // Update existing user
            res = await apiPut(`/users/${editId}`, { display_name, department, role });
        } else {
            // Create new user
            res = await apiPost('/users', { zalo_user_id, display_name, department, role });
        }
        if (res.ok) {
            showToast(editId ? 'Đã cập nhật người dùng' : 'Đã thêm người dùng', 'success');
            closeModal('user-modal');
            loadUsers();
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi lưu người dùng', 'error');
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

// ============= Company Settings =============
async function loadCompanySettings() {
    try {
        const res = await apiGet('/settings');
        if (res.ok) {
            Object.keys(res.result).forEach(key => {
                const el = document.getElementById(`setting-${key}`);
                if (el) el.value = res.result[key] || '';
            });
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

async function saveCompanySettings() {
    const fields = ['company_name', 'company_address', 'company_tax_code', 'company_phone',
        'company_bank_account', 'company_bank_name',
        'approver_name', 'approver_title', 'accountant_name'];
    const data = {};
    fields.forEach(key => {
        const el = document.getElementById(`setting-${key}`);
        if (el) data[key] = el.value.trim();
    });
    try {
        const res = await apiPost('/settings', data);
        if (res.ok) {
            showToast('Đã lưu thông tin công ty', 'success');
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi lưu', 'error');
    }
}

// ============= Admin Data Management =============
async function loadClearDataUserList() {
    if (!currentUser?.is_admin) return;
    try {
        const res = await apiGet('/users');
        if (res.ok) {
            const select = document.getElementById('clear-data-user');
            if (!select) return;
            select.innerHTML = '<option value="">-- Chọn người dùng --</option>';
            res.result.forEach(u => {
                select.innerHTML += `<option value="${u.zalo_user_id}">${escapeHtml(u.display_name || u.zalo_user_id)}</option>`;
            });
        }
    } catch (err) { }
}

async function clearUserData() {
    const userId = document.getElementById('clear-data-user')?.value;
    if (!userId) return showToast('Vui lòng chọn người dùng', 'error');
    const userName = document.getElementById('clear-data-user')?.selectedOptions[0]?.textContent || userId;
    if (!confirm(`⚠️ Xóa TOÀN BỘ dữ liệu của "${userName}"?\n\nBao gồm: chi tiêu, thanh toán, tạm ứng.\nHành động này KHÔNG THỂ hoàn tác!`)) return;
    if (!confirm(`Xác nhận lần 2: Bạn CHẮC CHẮN muốn xóa dữ liệu của "${userName}"?`)) return;
    try {
        const res = await apiPost('/admin/clear-data', { zalo_user_id: userId });
        if (res.ok) {
            showToast(`Đã xóa dữ liệu của ${userName}`, 'success');
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi xóa', 'error');
    }
}

async function clearAllData() {
    if (!confirm('⚠️ CẢNH BÁO: Bạn sắp xóa TOÀN BỘ dữ liệu!\n\nBao gồm: TẤT CẢ chi tiêu, thanh toán, tạm ứng, lịch sử.\nHành động này KHÔNG THỂ hoàn tác!')) return;
    const code = prompt('Nhập "XOA" để xác nhận xóa toàn bộ:');
    if (code !== 'XOA') return showToast('Mã xác nhận không đúng', 'error');
    try {
        const res = await apiPost('/admin/clear-data', {});
        if (res.ok) {
            showToast('Đã xóa toàn bộ dữ liệu!', 'success');
            loadDashboard();
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi xóa', 'error');
    }
}

// ============= Payment Request PDF =============
function generatePaymentRequest() {
    const fromDate = document.getElementById('pr-filter-from')?.value || document.getElementById('filter-from')?.value || '';
    const toDate = document.getElementById('pr-filter-to')?.value || document.getElementById('filter-to')?.value || '';
    const userId = document.getElementById('pr-filter-user')?.value || document.getElementById('filter-user')?.value || '';

    const params = new URLSearchParams();
    if (fromDate) params.append('from_date', fromDate);
    if (toDate) params.append('to_date', toDate);
    if (userId) params.append('zalo_user_id', userId);

    const url = `/payment-request?${params.toString()}`;
    window.open(url, '_blank');
}

// ============= Payment Requests Page =============
let currentPRPeriod = 'week';
let prUsersList = [];

async function loadPaymentRequests() {
    try {
        const from_date = document.getElementById('pr-filter-from')?.value || '';
        const to_date = document.getElementById('pr-filter-to')?.value || '';
        const zalo_user_id = document.getElementById('pr-filter-user')?.value || '';
        const params = new URLSearchParams();
        if (from_date) params.append('from_date', from_date);
        if (to_date) params.append('to_date', to_date);
        if (zalo_user_id) params.append('zalo_user_id', zalo_user_id);
        const res = await apiGet(`/payment-requests?${params}`);
        if (res.ok) renderPaymentRequestsTable(res.result);
        if (currentUser?.is_admin) {
            document.querySelectorAll('#page-payment-requests .admin-only').forEach(el => el.style.display = '');
        } else {
            document.querySelectorAll('#page-payment-requests .admin-only').forEach(el => el.style.display = 'none');
        }
    } catch (err) {
        showToast('Lỗi tải đề nghị thanh toán', 'error');
    }
}

function setPRPeriod(period) {
    currentPRPeriod = period;
    const now = new Date();
    let fromDate = '', toDate = now.toISOString().split('T')[0];
    if (period === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay() + 1);
        fromDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
        fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else { fromDate = ''; toDate = ''; }
    document.getElementById('pr-filter-from').value = fromDate;
    document.getElementById('pr-filter-to').value = toDate;
    document.querySelectorAll('#pr-period-btns button').forEach(b => {
        b.className = b.dataset.period === period ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline-secondary';
    });
    loadPaymentRequests();
    const userId = document.getElementById('pr-filter-user')?.value;
    if (userId) loadUserExpenseHistory(userId);
}

async function loadPRUsersFilter() {
    if (!currentUser?.is_admin) return;
    try {
        const res = await apiGet('/users');
        if (res.ok) {
            prUsersList = res.result;
            const select = document.getElementById('pr-filter-user');
            if (!select) return;
            select.innerHTML = '<option value="">\uD83D\uDC65 T\u1EA5t c\u1EA3</option>';
            res.result.forEach(u => {
                select.innerHTML += `<option value="${u.zalo_user_id}">${escapeHtml(u.display_name || u.zalo_user_id)}</option>`;
            });
        }
    } catch (err) { }
}

function onPRUserChange() {
    const userId = document.getElementById('pr-filter-user')?.value;
    if (userId) {
        loadUserExpenseHistory(userId);
    } else {
        document.getElementById('user-expense-history-card').style.display = 'none';
    }
    loadPaymentRequests();
}

async function loadUserExpenseHistory(userId) {
    try {
        const from_date = document.getElementById('pr-filter-from')?.value || '';
        const to_date = document.getElementById('pr-filter-to')?.value || '';
        const params = new URLSearchParams();
        if (from_date) params.append('from_date', from_date);
        if (to_date) params.append('to_date', to_date);
        const res = await apiGet(`/expenses/user-payment/${userId}?${params}`);
        if (res.ok) {
            renderUserExpenseHistory(res.result);
            const user = prUsersList.find(u => u.zalo_user_id === userId);
            document.getElementById('pr-selected-user-name').textContent = user?.display_name || userId;
            document.getElementById('user-expense-history-card').style.display = 'block';
        }
    } catch (err) { showToast('Lỗi tải lịch sử', 'error'); }
}

function renderUserExpenseHistory(expenses) {
    const tbody = document.getElementById('user-expenses-body');
    if (!expenses.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có chi tiêu</td></tr>';
        return;
    }
    tbody.innerHTML = expenses.map(e => {
        const ps = e.payment_status || 'unpaid';
        const statusBadge = {
            unpaid: '<span class="badge bg-warning text-dark">Chưa TT</span>',
            requested: '<span class="badge bg-info">Đang yêu cầu</span>',
            paid: '<span class="badge bg-success">Đã TT</span>',
        }[ps] || '<span class="badge bg-warning text-dark">Chưa TT</span>';
        const isUnpaid = ps === 'unpaid' || !ps;
        return `<tr>
            <td><input type="checkbox" class="expense-checkbox" value="${e.id}" data-amount="${e.amount}" ${isUnpaid ? '' : 'disabled'} onchange="updateSelectedCount()"></td>
            <td>${escapeHtml(e.description)}</td>
            <td class="fw-bold">${formatCurrency(e.amount)}</td>
            <td>${formatShortDate(e.created_at)}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join('');
    updateSelectedCount();
}

function toggleSelectAllExpenses() {
    const checked = document.getElementById('select-all-expenses').checked;
    document.querySelectorAll('.expense-checkbox:not(:disabled)').forEach(cb => cb.checked = checked);
    updateSelectedCount();
}

function updateSelectedCount() {
    const checked = document.querySelectorAll('.expense-checkbox:checked');
    let total = 0;
    checked.forEach(cb => total += parseFloat(cb.dataset.amount) || 0);
    document.getElementById('selected-expense-count').textContent = checked.length;
    document.getElementById('selected-expense-total').textContent = formatCurrency(total);
}

async function createPaymentFromSelected() {
    const checked = document.querySelectorAll('.expense-checkbox:checked');
    if (!checked.length) return showToast('Chọn ít nhất 1 chi tiêu', 'error');
    const ids = Array.from(checked).map(cb => cb.value);
    const userId = document.getElementById('pr-filter-user')?.value;
    const user = prUsersList.find(u => u.zalo_user_id === userId);
    if (!confirm(`Tạo thanh toán ${checked.length} giao dịch & đánh dấu đã TT?`)) return;
    try {
        const res = await apiPost('/payment-requests', {
            expense_ids: ids.join(','),
            from_date: document.getElementById('pr-filter-from')?.value || '',
            to_date: document.getElementById('pr-filter-to')?.value || '',
            target_user_id: userId,
            target_user_name: user?.display_name || '',
            note: 'Admin tạo thủ công',
        });
        if (res.ok) {
            showToast('Đã tạo & thanh toán!', 'success');
            if (userId) loadUserExpenseHistory(userId);
            loadPaymentRequests();
        } else { showToast(res.error || 'Lỗi', 'error'); }
    } catch (err) { showToast('Lỗi', 'error'); }
}

function adminCreatePaymentForUser() {
    const userId = document.getElementById('pr-filter-user')?.value;
    if (!userId) return showToast('Chọn người dùng trước', 'error');
    document.querySelectorAll('.expense-checkbox:not(:disabled)').forEach(cb => cb.checked = true);
    updateSelectedCount();
    createPaymentFromSelected();
}

function renderPaymentRequestsTable(requests) {
    const tbody = document.getElementById('payment-requests-body');
    if (!requests.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có đề nghị nào</td></tr>';
        return;
    }
    tbody.innerHTML = requests.map(r => {
        const statusBadge = {
            pending: '<span class="badge bg-warning">Chờ duyệt</span>',
            approved: '<span class="badge bg-info">Đã duyệt</span>',
            paid: '<span class="badge bg-success">Đã TT</span>',
            rejected: '<span class="badge bg-danger">Từ chối</span>',
        }[r.status] || r.status;
        let actions = '';
        if (currentUser?.is_admin && r.status === 'pending') {
            actions = `<button class="btn btn-sm btn-outline-success" onclick="approvePaymentRequest(${r.id})"><i class="fas fa-check"></i></button>
                       <button class="btn btn-sm btn-outline-danger" onclick="rejectPaymentRequest(${r.id})"><i class="fas fa-times"></i></button>`;
        } else if (currentUser?.is_admin && r.status === 'approved') {
            actions = `<button class="btn btn-sm btn-success" onclick="markPaymentRequestPaid(${r.id})"><i class="fas fa-money-bill"></i> TT</button>`;
        }
        return `<tr>
            <td>${r.id}</td>
            <td>${escapeHtml(r.requested_by_name || 'N/A')}</td>
            <td>${r.expense_count}</td>
            <td class="fw-bold">${formatCurrency(r.total_amount)}</td>
            <td>${statusBadge}</td>
            <td>${formatDate(r.created_at)}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

async function approvePaymentRequest(id) {
    if (!confirm('Duyệt đề nghị này?')) return;
    try {
        await apiPost(`/payment-requests/${id}/approve`);
        showToast('Đã duyệt', 'success');
        loadPaymentRequests();
    } catch (err) { showToast('Lỗi', 'error'); }
}

async function markPaymentRequestPaid(id) {
    if (!confirm('Xác nhận đã thanh toán?')) return;
    try {
        await apiPost(`/payment-requests/${id}/paid`);
        showToast('Đã đánh dấu TT', 'success');
        loadPaymentRequests();
        const userId = document.getElementById('pr-filter-user')?.value;
        if (userId) loadUserExpenseHistory(userId);
    } catch (err) { showToast('Lỗi', 'error'); }
}

async function rejectPaymentRequest(id) {
    if (!confirm('Từ chối đề nghị?')) return;
    try {
        await apiPost(`/payment-requests/${id}/reject`);
        showToast('Đã từ chối', 'success');
        loadPaymentRequests();
    } catch (err) { showToast('Lỗi', 'error'); }
}

// ============= Advances Page =============
async function loadAdvances() {
    try {
        const res = await apiGet('/advances');
        if (res.ok) renderAdvancesTable(res.result);
    } catch (err) {
        showToast('Lỗi tải danh sách tạm ứng', 'error');
    }
}

function renderAdvancesTable(advances) {
    const tbody = document.getElementById('advances-body');
    if (!advances.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Chưa có yêu cầu tạm ứng nào</td></tr>';
        return;
    }
    tbody.innerHTML = advances.map(a => {
        const statusBadge = {
            pending: '<span class="badge bg-warning">Chờ duyệt</span>',
            approved: '<span class="badge bg-success">Đã duyệt</span>',
            settled: '<span class="badge bg-info">Đã quyết toán</span>',
            rejected: '<span class="badge bg-danger">Từ chối</span>',
        }[a.status] || a.status;

        let actions = '';
        if (currentUser?.is_admin) {
            if (a.status === 'pending') {
                actions = `<button class="btn btn-sm btn-outline-success" onclick="approveAdvance(${a.id})"><i class="fas fa-check"></i></button>
                           <button class="btn btn-sm btn-outline-danger" onclick="rejectAdvance(${a.id})"><i class="fas fa-times"></i></button>`;
            } else if (a.status === 'approved') {
                actions = `<button class="btn btn-sm btn-info text-white" onclick="settleAdvance(${a.id}, ${a.amount})"><i class="fas fa-calculator"></i> Quyết toán</button>`;
            }
        }

        return `<tr>
            <td>${a.id}</td>
            <td>${escapeHtml(a.zalo_user_name || 'N/A')}</td>
            <td class="fw-bold">${formatCurrency(a.amount)}</td>
            <td>${escapeHtml(a.purpose || '')}</td>
            <td>${statusBadge}</td>
            <td>${formatDate(a.created_at)}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

function openCreateAdvance() {
    document.getElementById('advance-amount').value = '';
    document.getElementById('advance-purpose').value = '';
    document.getElementById('advance-note').value = '';
    openModal('advance-modal');
}

async function saveAdvance() {
    const amount = parseFloat(document.getElementById('advance-amount').value);
    const purpose = document.getElementById('advance-purpose').value.trim();
    const note = document.getElementById('advance-note').value.trim();

    if (!amount || amount < 1000) return showToast('Số tiền tối thiểu 1.000 ₫', 'error');
    if (!purpose) return showToast('Vui lòng nhập mục đích', 'error');

    try {
        const res = await apiPost('/advances', { amount, purpose, note });
        if (res.ok) {
            closeModal('advance-modal');
            showToast('Đã gửi yêu cầu tạm ứng', 'success');
            loadAdvances();
        } else {
            showToast(res.error || 'Lỗi', 'error');
        }
    } catch (err) {
        showToast('Lỗi khi gửi yêu cầu', 'error');
    }
}

async function approveAdvance(id) {
    if (!confirm('Duyệt yêu cầu tạm ứng?')) return;
    try {
        await apiPost(`/advances/${id}/approve`);
        showToast('Đã duyệt tạm ứng', 'success');
        loadAdvances();
    } catch (err) { showToast('Lỗi', 'error'); }
}

async function rejectAdvance(id) {
    if (!confirm('Từ chối yêu cầu tạm ứng?')) return;
    try {
        await apiPost(`/advances/${id}/reject`);
        showToast('Đã từ chối', 'success');
        loadAdvances();
    } catch (err) { showToast('Lỗi', 'error'); }
}

async function settleAdvance(id, originalAmount) {
    const settledAmount = prompt(`Số tiền quyết toán (tạm ứng: ${formatCurrency(originalAmount)}):`, originalAmount);
    if (settledAmount === null) return;
    const note = prompt('Ghi chú quyết toán:') || '';
    try {
        await apiPost(`/advances/${id}/settle`, { settled_amount: parseFloat(settledAmount) || 0, note });
        showToast('Đã quyết toán', 'success');
        loadAdvances();
    } catch (err) { showToast('Lỗi', 'error'); }
}

// ============= Deleted Expenses Page =============
async function loadDeletedExpenses() {
    try {
        const res = await apiGet('/expenses/deleted');
        if (res.ok) renderDeletedTable(res.result);
    } catch (err) {
        showToast('Lỗi tải danh sách đã xóa', 'error');
    }
}

function renderDeletedTable(deleted) {
    const tbody = document.getElementById('deleted-body');
    if (!deleted.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Không có mục nào đã xóa</td></tr>';
        return;
    }
    tbody.innerHTML = deleted.map(e => {
        const restoreBtn = currentUser?.is_admin
            ? `<button class="btn btn-sm btn-outline-success" onclick="restoreExpense(${e.id})"><i class="fas fa-undo"></i> Khôi phục</button>`
            : '';
        return `<tr>
            <td>${e.id}</td>
            <td>${escapeHtml(e.description)}</td>
            <td class="fw-bold">${formatCurrency(e.amount)}</td>
            <td>${escapeHtml(e.delete_reason || '')}</td>
            <td>${formatDate(e.deleted_at)}</td>
            <td>${restoreBtn}</td>
        </tr>`;
    }).join('');
}

async function restoreExpense(id) {
    if (!confirm('Khôi phục chi tiêu này?')) return;
    try {
        await apiPost(`/expenses/${id}/restore`);
        showToast('Đã khôi phục', 'success');
        loadDeletedExpenses();
    } catch (err) { showToast('Lỗi', 'error'); }
}
