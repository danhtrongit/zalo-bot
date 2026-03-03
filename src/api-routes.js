const express = require('express');
const router = express.Router();
const { dao } = require('./database');
const zaloApi = require('./zalo-api');

const ADMIN_ZALO_ID = process.env.ADMIN_ZALO_ID;

// Admin-only middleware
function adminOnly(req, res, next) {
    if (req.user?.role !== 'admin' && req.user?.zalo_user_id !== ADMIN_ZALO_ID) {
        return res.status(403).json({ ok: false, error: 'Admin only' });
    }
    next();
}

// ============= Current User =============
router.get('/me', (req, res) => {
    const isAdmin = req.user?.role === 'admin' || req.user?.zalo_user_id === ADMIN_ZALO_ID;
    res.json({
        ok: true,
        result: {
            zalo_user_id: req.user.zalo_user_id,
            display_name: req.user.display_name,
            role: isAdmin ? 'admin' : 'user',
            is_admin: isAdmin,
        }
    });
});

// ============= Dashboard Stats =============
router.get('/stats', (req, res) => {
    try {
        const stats = dao.getDashboardStats();
        res.json({ ok: true, result: stats });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Categories =============
router.get('/categories', (req, res) => {
    try {
        const categories = dao.getAllCategories();
        res.json({ ok: true, result: categories });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/categories', (req, res) => {
    try {
        const { name, icon, color } = req.body;
        if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });
        const id = dao.createCategory(name, icon, color);
        res.json({ ok: true, result: { id } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.put('/categories/:id', (req, res) => {
    try {
        dao.updateCategory(req.params.id, req.body);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.delete('/categories/:id', (req, res) => {
    try {
        dao.deleteCategory(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Expenses =============
router.get('/expenses', (req, res) => {
    try {
        const { limit, offset, category_id, from_date, to_date, search } = req.query;
        const result = dao.getExpenses({
            limit: parseInt(limit) || 50,
            offset: parseInt(offset) || 0,
            category_id: category_id ? parseInt(category_id) : undefined,
            from_date, to_date, search
        });
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/expenses', (req, res) => {
    try {
        const id = dao.addExpense(req.body);
        res.json({ ok: true, result: { id } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.put('/expenses/:id', (req, res) => {
    try {
        dao.updateExpense(req.params.id, req.body);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.delete('/expenses/:id', (req, res) => {
    try {
        dao.deleteExpense(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Reports =============
router.get('/reports/summary', (req, res) => {
    try {
        const { from_date, to_date, zalo_user_id } = req.query;
        const summary = dao.getExpenseSummary({ from_date, to_date, zalo_user_id });
        res.json({ ok: true, result: summary });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/reports/monthly-trend', (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const { zalo_user_id } = req.query;
        const trend = dao.getMonthlyTrend(months, zalo_user_id);
        res.json({ ok: true, result: trend });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/reports/daily-trend', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const { zalo_user_id } = req.query;
        const trend = dao.getDailyTrend(days, zalo_user_id);
        res.json({ ok: true, result: trend });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/reports/top-expenses', (req, res) => {
    try {
        const { limit, from_date, to_date, zalo_user_id } = req.query;
        const top = dao.getTopExpenses(parseInt(limit) || 10, from_date, to_date, zalo_user_id);
        res.json({ ok: true, result: top });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Settings =============
router.get('/settings', (req, res) => {
    try {
        const keys = ['company_name', 'company_address', 'company_tax_code', 'company_phone',
            'company_bank_account', 'company_bank_name',
            'approver_name', 'approver_title', 'accountant_name'];
        const settings = {};
        keys.forEach(k => { settings[k] = dao.getSetting(k) || ''; });
        res.json({ ok: true, result: settings });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/settings', (req, res) => {
    try {
        const data = req.body;
        Object.keys(data).forEach(key => {
            dao.setSetting(key, data[key]);
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Payment Request Form =============
router.get('/reports/payment-request', (req, res) => {
    try {
        const { from_date, to_date, zalo_user_id } = req.query;
        // Get expenses for the form
        const expenses = dao.getExpenses({
            limit: 1000,
            from_date,
            to_date,
            ...(zalo_user_id ? { search: '', category_id: undefined } : {}),
        });

        // Filter by zalo_user_id if needed
        let filteredExpenses = expenses.rows;
        if (zalo_user_id) {
            filteredExpenses = expenses.rows.filter(e => e.zalo_user_id === zalo_user_id);
        }

        // Get company settings
        const settings = {};
        ['company_name', 'company_address', 'company_tax_code', 'company_phone',
            'company_bank_account', 'company_bank_name',
            'approver_name', 'approver_title', 'accountant_name'].forEach(k => {
                settings[k] = dao.getSetting(k) || '';
            });

        // Get requester name
        let requesterName = 'Tất cả nhân viên';
        if (zalo_user_id) {
            const user = filteredExpenses.find(e => e.zalo_user_id === zalo_user_id);
            requesterName = user?.zalo_user_name || zalo_user_id;
        }

        res.json({
            ok: true,
            result: {
                settings,
                requester_name: requesterName,
                from_date: from_date || '',
                to_date: to_date || '',
                expenses: filteredExpenses,
                total: filteredExpenses.reduce((s, e) => s + e.amount, 0),
                count: filteredExpenses.length,
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
// ============= Pending Actions =============
router.post('/pending-actions', (req, res) => {
    try {
        const { action_type, expense_id, new_data } = req.body;
        if (!action_type || !expense_id) return res.status(400).json({ ok: false, error: 'Missing fields' });

        const expense = dao.getExpenseById(expense_id);
        if (!expense) return res.status(404).json({ ok: false, error: 'Expense not found' });

        // Admin can edit/delete directly
        const isAdmin = req.user?.role === 'admin' || req.user?.zalo_user_id === ADMIN_ZALO_ID;
        if (isAdmin) {
            if (action_type === 'delete') {
                dao.deleteExpense(expense_id);
                return res.json({ ok: true, direct: true, message: 'Deleted' });
            } else if (action_type === 'edit' && new_data) {
                const sets = [];
                const vals = [];
                if (new_data.description !== undefined) { sets.push('description = ?'); vals.push(new_data.description); }
                if (new_data.amount !== undefined) { sets.push('amount = ?'); vals.push(new_data.amount); }
                if (new_data.category_id !== undefined) { sets.push('category_id = ?'); vals.push(new_data.category_id); }
                if (new_data.note !== undefined) { sets.push('note = ?'); vals.push(new_data.note); }
                if (sets.length > 0) {
                    dao.updateExpense(expense_id, new_data);
                }
                return res.json({ ok: true, direct: true, message: 'Updated' });
            }
        }

        // Regular user: create pending action
        const id = dao.createPendingAction({
            action_type,
            expense_id,
            requested_by: req.user.zalo_user_id,
            requested_by_name: req.user.display_name,
            old_data: expense,
            new_data: new_data || null,
        });

        // Notify admin via Zalo
        if (ADMIN_ZALO_ID) {
            const actionLabel = action_type === 'delete' ? 'XÓA' : 'SỬA';
            const msg = `🔔 YÊU CẦU ${actionLabel} CHI TIÊU\n\n` +
                `👤 ${req.user.display_name}\n` +
                `📝 #${expense_id}: ${expense.description}\n` +
                `💰 ${expense.amount?.toLocaleString('vi-VN')} ₫\n` +
                (action_type === 'edit' && new_data ? `✏️ Sửa thành: ${new_data.description || expense.description} - ${(new_data.amount || expense.amount)?.toLocaleString('vi-VN')} ₫\n` : '') +
                `\nVào Dashboard để duyệt.`;
            zaloApi.sendMessage(ADMIN_ZALO_ID, msg).catch(e => console.error('[Notify] Error:', e.message));
        }

        res.json({ ok: true, result: { id }, message: 'Đã gửi yêu cầu cho Admin duyệt' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/pending-actions', adminOnly, (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const actions = dao.getPendingActions(status);
        const count = dao.countPendingActions();
        res.json({ ok: true, result: actions, pending_count: count });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/pending-actions/count', (req, res) => {
    try {
        const count = dao.countPendingActions();
        res.json({ ok: true, result: { count } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/pending-actions/:id/approve', adminOnly, (req, res) => {
    try {
        const action = dao.approvePendingAction(req.params.id, req.user.zalo_user_id);
        if (!action) return res.status(404).json({ ok: false, error: 'Not found or already processed' });

        // Notify requester
        const actionLabel = action.action_type === 'delete' ? 'xóa' : 'sửa';
        zaloApi.sendMessage(action.requested_by,
            `✅ Yêu cầu ${actionLabel} chi tiêu #${action.expense_id} đã được duyệt.`
        ).catch(e => console.error('[Notify] Error:', e.message));

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/pending-actions/:id/reject', adminOnly, (req, res) => {
    try {
        const action = dao.getPendingActionById(req.params.id);
        if (!action) return res.status(404).json({ ok: false, error: 'Not found' });
        dao.rejectPendingAction(req.params.id, req.user.zalo_user_id);

        // Notify requester
        const actionLabel = action.action_type === 'delete' ? 'xóa' : 'sửa';
        zaloApi.sendMessage(action.requested_by,
            `❌ Yêu cầu ${actionLabel} chi tiêu #${action.expense_id} đã bị từ chối.`
        ).catch(e => console.error('[Notify] Error:', e.message));

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// User's own expenses
router.get('/my-expenses', (req, res) => {
    try {
        const { limit, offset, from_date, to_date } = req.query;
        const expenses = dao.getExpenses({
            limit: parseInt(limit) || 50,
            offset: parseInt(offset) || 0,
            from_date, to_date
        });
        // Filter to user's own
        const myExpenses = expenses.rows.filter(e => e.zalo_user_id === req.user.zalo_user_id);
        res.json({ ok: true, result: { rows: myExpenses, total: myExpenses.length } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
