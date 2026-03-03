const express = require('express');
const router = express.Router();
const { dao } = require('./database');
const zaloApi = require('./zalo-api');

const ADMIN_ZALO_ID = process.env.ADMIN_ZALO_ID;

function adminOnly(req, res, next) {
    if (!isAdmin(req)) {
        return res.status(403).json({ ok: false, error: 'Admin only' });
    }
    next();
}

function isAdmin(req) {
    return req.user?.role === 'admin' || req.user?.zalo_user_id === ADMIN_ZALO_ID;
}

function getUserId(req) {
    return isAdmin(req) ? null : req.user?.zalo_user_id;
}

// ============= Current User =============
router.get('/me', (req, res) => {
    res.json({
        ok: true,
        result: {
            zalo_user_id: req.user.zalo_user_id,
            display_name: req.user.display_name,
            role: isAdmin(req) ? 'admin' : 'user',
            is_admin: isAdmin(req),
        }
    });
});

// ============= Dashboard Stats =============
router.get('/stats', (req, res) => {
    try {
        // Non-admin: force own data
        const userId = isAdmin(req) ? getUserId(req) : req.user.zalo_user_id;
        const stats = dao.getDashboardStats(userId);
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
        const { limit, offset, category_id, from_date, to_date, search, zalo_user_id } = req.query;
        // Admin can filter by user; non-admin forced to own
        const userId = isAdmin(req) ? (zalo_user_id || null) : req.user.zalo_user_id;
        const result = dao.getExpenses({
            limit: parseInt(limit) || 50,
            offset: parseInt(offset) || 0,
            category_id: category_id ? parseInt(category_id) : undefined,
            from_date, to_date, search,
            user_id: userId,
        });
        res.json({ ok: true, result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/expenses', (req, res) => {
    try {
        if (req.body.amount !== undefined && req.body.amount < 1000) {
            return res.status(400).json({ ok: false, error: 'Số tiền tối thiểu là 1.000 ₫' });
        }
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
        // Non-admin can only see own reports
        const effectiveUserId = isAdmin(req) ? (zalo_user_id || getUserId(req)) : req.user.zalo_user_id;
        const summary = dao.getExpenseSummary({ from_date, to_date, zalo_user_id: effectiveUserId });
        res.json({ ok: true, result: summary });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/reports/monthly-trend', (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const { zalo_user_id } = req.query;
        const effectiveUserId = isAdmin(req) ? (zalo_user_id || getUserId(req)) : req.user.zalo_user_id;
        const trend = dao.getMonthlyTrend(months, effectiveUserId);
        res.json({ ok: true, result: trend });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/reports/daily-trend', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const { zalo_user_id } = req.query;
        const effectiveUserId = isAdmin(req) ? (zalo_user_id || getUserId(req)) : req.user.zalo_user_id;
        const trend = dao.getDailyTrend(days, effectiveUserId);
        res.json({ ok: true, result: trend });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/reports/top-expenses', (req, res) => {
    try {
        const { limit, from_date, to_date, zalo_user_id } = req.query;
        const effectiveUserId = isAdmin(req) ? (zalo_user_id || getUserId(req)) : req.user.zalo_user_id;
        const top = dao.getTopExpenses(parseInt(limit) || 10, from_date, to_date, effectiveUserId);
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
        const { action_type, expense_id, new_data, reason } = req.body;
        if (!action_type || !expense_id) return res.status(400).json({ ok: false, error: 'Missing fields' });

        // Validate min amount
        if (new_data && new_data.amount !== undefined && new_data.amount < 1000) {
            return res.status(400).json({ ok: false, error: 'Số tiền tối thiểu là 1.000 ₫' });
        }

        const expense = dao.getExpenseById(expense_id);
        if (!expense) return res.status(404).json({ ok: false, error: 'Expense not found' });

        if (!isAdmin(req) && expense.zalo_user_id !== req.user.zalo_user_id) {
            return res.status(403).json({ ok: false, error: 'Bạn chỉ có thể sửa/xóa chi tiêu của chính mình' });
        }

        // Require reason for non-admin
        if (!isAdmin(req) && !reason) {
            return res.status(400).json({ ok: false, error: 'Vui lòng nhập lý do sửa/xóa' });
        }

        // Admin can edit/delete directly (with edit history)
        if (isAdmin(req)) {
            if (action_type === 'delete') {
                dao.softDeleteExpense(expense_id, req.user.zalo_user_id, reason || 'Admin deleted');
                return res.json({ ok: true, direct: true, message: 'Đã xóa (soft delete)' });
            } else if (action_type === 'edit' && new_data) {
                // Record edit history
                for (const [key, val] of Object.entries(new_data)) {
                    if (val !== undefined && expense[key] !== val && ['description', 'amount', 'category_id', 'note'].includes(key)) {
                        dao.addEditHistory(expense_id, key, expense[key], val, req.user.zalo_user_id, req.user.display_name, reason || '');
                    }
                }
                dao.updateExpense(expense_id, new_data);
                return res.json({ ok: true, direct: true, message: 'Đã cập nhật' });
            }
        }

        // Regular user: create pending action with reason
        const id = dao.createPendingAction({
            action_type,
            expense_id,
            requested_by: req.user.zalo_user_id,
            requested_by_name: req.user.display_name,
            old_data: expense,
            new_data: new_data || null,
            reason: reason || '',
        });

        // Notify admin via Zalo
        if (ADMIN_ZALO_ID) {
            const actionLabel = action_type === 'delete' ? 'XÓA' : 'SỬA';
            const msg = `🔔 YÊU CẦU ${actionLabel} CHI TIÊU\n\n` +
                `👤 ${req.user.display_name}\n` +
                `📝 #${expense_id}: ${expense.description}\n` +
                `💰 ${expense.amount?.toLocaleString('vi-VN')} ₫\n` +
                (reason ? `📌 Lý do: ${reason}\n` : '') +
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
        const actionLabel = action.action_type === 'delete' ? 'xóa' : 'sửa';
        zaloApi.sendMessage(action.requested_by,
            `❌ Yêu cầu ${actionLabel} chi tiêu #${action.expense_id} đã bị từ chối.`
        ).catch(e => console.error('[Notify] Error:', e.message));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Deleted Expenses =============
router.get('/expenses/deleted', (req, res) => {
    try {
        const userId = isAdmin(req) ? null : req.user.zalo_user_id;
        const deleted = dao.getDeletedExpenses(userId);
        res.json({ ok: true, result: deleted });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/expenses/:id/restore', adminOnly, (req, res) => {
    try {
        dao.restoreExpense(req.params.id);
        res.json({ ok: true, message: 'Đã khôi phục' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Edit History =============
router.get('/expenses/:id/history', (req, res) => {
    try {
        const history = dao.getEditHistory(req.params.id);
        res.json({ ok: true, result: history });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Payment Requests (Đề nghị thanh toán) =============
router.post('/payment-requests', (req, res) => {
    try {
        const { from_date, to_date, expense_ids, note, target_user_id } = req.body;
        if (!expense_ids) return res.status(400).json({ ok: false, error: 'Chưa chọn chi tiêu' });

        const idList = expense_ids.split(',').map(Number).filter(n => n > 0);
        let total = 0;
        for (const eid of idList) {
            const exp = dao.getExpenseById(eid);
            if (exp) total += exp.amount;
        }

        // If admin creates, use target_user_id or own
        const requestedBy = target_user_id || req.user.zalo_user_id;
        const requestedByName = target_user_id ? (req.body.target_user_name || 'N/A') : req.user.display_name;

        const id = dao.createPaymentRequest({
            requested_by: requestedBy,
            requested_by_name: requestedByName,
            from_date, to_date,
            total_amount: total,
            expense_count: idList.length,
            expense_ids,
            note,
        });

        // Admin creates = auto mark as paid
        if (isAdmin(req)) {
            dao.approvePaymentRequest(id, req.user.zalo_user_id);
            dao.markPaymentRequestPaid(id);
        } else {
            // Notify admin
            if (ADMIN_ZALO_ID) {
                zaloApi.sendMessage(ADMIN_ZALO_ID,
                    `💳 ĐỀ NGHỊ THANH TOÁN MỚI\n\n👤 ${req.user.display_name}\n💰 ${total.toLocaleString('vi-VN')} ₫\n📋 ${idList.length} giao dịch\n\nVào Dashboard để xem & duyệt.`
                ).catch(e => console.error('[Notify] Error:', e.message));
            }
        }

        res.json({ ok: true, result: { id } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/payment-requests', (req, res) => {
    try {
        const { from_date, to_date, zalo_user_id } = req.query;
        const userId = isAdmin(req) ? (zalo_user_id || null) : req.user.zalo_user_id;
        const requests = dao.getPaymentRequests({ userId, from_date, to_date });
        res.json({ ok: true, result: requests });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get expenses for a specific user with payment_status
router.get('/expenses/user-payment/:userId', (req, res) => {
    try {
        if (!isAdmin(req) && req.params.userId !== req.user.zalo_user_id) {
            return res.status(403).json({ ok: false, error: 'Kh\u00F4ng c\u00F3 quy\u1EC1n' });
        }
        const { from_date, to_date } = req.query;
        const result = dao.getExpenses({
            limit: 500,
            offset: 0,
            from_date, to_date,
            user_id: req.params.userId,
        });
        res.json({ ok: true, result: result.rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/payment-requests/:id', (req, res) => {
    try {
        const pr = dao.getPaymentRequestById(req.params.id);
        if (!pr) return res.status(404).json({ ok: false, error: 'Not found' });

        // Get expense details
        let expenses = [];
        if (pr.expense_ids) {
            const ids = pr.expense_ids.split(',').map(Number).filter(n => n > 0);
            for (const eid of ids) {
                const exp = dao.getExpenseById(eid);
                if (exp) expenses.push(exp);
            }
        }
        res.json({ ok: true, result: { ...pr, expenses } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/payment-requests/:id/approve', adminOnly, (req, res) => {
    try {
        dao.approvePaymentRequest(req.params.id, req.user.zalo_user_id);
        const pr = dao.getPaymentRequestById(req.params.id);
        if (pr) {
            zaloApi.sendMessage(pr.requested_by,
                `✅ Đề nghị thanh toán #${pr.id} đã được duyệt (${pr.total_amount.toLocaleString('vi-VN')} ₫)`
            ).catch(e => console.error('[Notify] Error:', e.message));
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/payment-requests/:id/paid', adminOnly, (req, res) => {
    try {
        dao.markPaymentRequestPaid(req.params.id);
        const pr = dao.getPaymentRequestById(req.params.id);
        if (pr) {
            zaloApi.sendMessage(pr.requested_by,
                `💰 Đề nghị thanh toán #${pr.id} đã được thanh toán! (${pr.total_amount.toLocaleString('vi-VN')} ₫)`
            ).catch(e => console.error('[Notify] Error:', e.message));
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/payment-requests/:id/reject', adminOnly, (req, res) => {
    try {
        dao.rejectPaymentRequest(req.params.id);
        const pr = dao.getPaymentRequestById(req.params.id);
        if (pr) {
            zaloApi.sendMessage(pr.requested_by,
                `❌ Đề nghị thanh toán #${pr.id} đã bị từ chối.`
            ).catch(e => console.error('[Notify] Error:', e.message));
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============= Advances (Tạm ứng) =============
router.post('/advances', (req, res) => {
    try {
        const { amount, purpose, note } = req.body;
        if (!amount || amount < 1000) return res.status(400).json({ ok: false, error: 'Số tiền tối thiểu 1.000 ₫' });

        const id = dao.createAdvance({
            zalo_user_id: req.user.zalo_user_id,
            zalo_user_name: req.user.display_name,
            amount, purpose, note,
        });

        if (ADMIN_ZALO_ID && !isAdmin(req)) {
            zaloApi.sendMessage(ADMIN_ZALO_ID,
                `💸 YÊU CẦU TẠM ỨNG MỚI\n\n👤 ${req.user.display_name}\n💰 ${amount.toLocaleString('vi-VN')} ₫\n📝 ${purpose || 'Không ghi chú'}\n\nVào Dashboard để duyệt.`
            ).catch(e => console.error('[Notify] Error:', e.message));
        }

        res.json({ ok: true, result: { id } });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/advances', (req, res) => {
    try {
        const { zalo_user_id } = req.query;
        const userId = isAdmin(req) ? (zalo_user_id || null) : req.user.zalo_user_id;
        const advances = dao.getAdvances(userId);
        res.json({ ok: true, result: advances });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/advances/:id/approve', adminOnly, (req, res) => {
    try {
        dao.approveAdvance(req.params.id, req.user.zalo_user_id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/advances/:id/reject', adminOnly, (req, res) => {
    try {
        dao.rejectAdvance(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/advances/:id/settle', adminOnly, (req, res) => {
    try {
        const { settled_amount, note } = req.body;
        dao.settleAdvance(req.params.id, settled_amount || 0, note || '');
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
            from_date, to_date,
            user_id: req.user.zalo_user_id,
        });
        res.json({ ok: true, result: expenses });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
// ============= Admin Data Management =============
router.post('/admin/clear-data', adminOnly, (req, res) => {
    try {
        const { zalo_user_id } = req.body;
        if (zalo_user_id) {
            const result = dao.clearUserData(zalo_user_id);
            res.json({ ok: true, message: `Đã xóa dữ liệu user ${zalo_user_id}`, result });
        } else {
            dao.clearAllData();
            res.json({ ok: true, message: 'Đã xóa toàn bộ dữ liệu' });
        }
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
