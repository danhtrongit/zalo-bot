const express = require('express');
const router = express.Router();
const { dao } = require('./database');

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
        let filteredExpenses = expenses.data;
        if (zalo_user_id) {
            filteredExpenses = expenses.data.filter(e => e.zalo_user_id === zalo_user_id);
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

module.exports = router;
