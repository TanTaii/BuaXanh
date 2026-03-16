import { getFirebaseFirestore } from '../firebase-config.js';
import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const db = getFirebaseFirestore();
const contactsCol = collection(db, 'contact-submissions');

let allContacts = [];
let filteredContacts = [];
let currentStatus = 'all';
let unsubscribeContacts = null;
let isInitialized = false;

function formatDate(ts) {
    if (!ts) return '-';
    const date = new Date(ts);
    return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function getStatusBadge(status) {
    const val = (status || 'pending').toLowerCase();
    if (val === 'resolved' || val === 'replied') {
        return '<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Đã xử lý</span>';
    }
    if (val === 'in_progress') {
        return '<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">Đang xử lý</span>';
    }
    return '<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Mới</span>';
}

function applyFilter() {
    if (currentStatus === 'all') {
        filteredContacts = [...allContacts];
        return;
    }
    filteredContacts = allContacts.filter(c => {
        const status = (c.status || 'pending').toLowerCase();
        if (currentStatus === 'pending') return status === 'pending';
        if (currentStatus === 'in_progress') return status === 'in_progress';
        if (currentStatus === 'resolved') return status === 'resolved' || status === 'replied';
        return true;
    });
}

function renderStats() {
    const total = allContacts.length;
    const pending = allContacts.filter(c => (c.status || 'pending') === 'pending').length;
    const inProgress = allContacts.filter(c => (c.status || '') === 'in_progress').length;
    const resolved = allContacts.filter(c => ['resolved', 'replied'].includes((c.status || '').toLowerCase())).length;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setText('stat-contacts-total', total);
    setText('stat-contacts-new', pending);
    setText('stat-contacts-progress', inProgress);
    setText('stat-contacts-resolved', resolved);
}

function renderTable() {
    const tbody = document.getElementById('contacts-table-body');
    if (!tbody) return;

    if (!filteredContacts.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-12 text-center text-slate-400">
                    <span class="material-symbols-rounded text-5xl opacity-20 block mb-3">mail</span>
                    Chưa có liên hệ nào
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredContacts.map(contact => {
        const message = String(contact.message || '');
        const shortMessage = message.length > 90 ? `${message.slice(0, 90)}...` : message;
        const customerGender = contact.gender || contact.customerGender || '-';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="px-6 py-4 text-xs font-mono text-slate-500">${contact.id.slice(0, 8)}...</td>
                <td class="px-6 py-4">
                    <p class="text-sm font-bold text-slate-900">${contact.name || '-'}</p>
                    <p class="text-xs text-slate-500">Giới tính: ${customerGender}</p>
                </td>
                <td class="px-6 py-4 text-sm text-slate-700">${contact.email || '-'}</td>
                <td class="px-6 py-4 text-sm">
                    ${contact.phone ? `<a href="tel:${contact.phone}" class="text-primary font-semibold hover:underline">${contact.phone}</a>` : '-'}
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">${contact.subject || 'Liên hệ chung'}</td>
                <td class="px-6 py-4 text-sm text-slate-600 max-w-[260px] truncate" title="${message.replace(/"/g, '&quot;')}">${shortMessage || '-'}</td>
                <td class="px-6 py-4">${getStatusBadge(contact.status)}</td>
                <td class="px-6 py-4 text-right">
                    <div class="inline-flex items-center gap-2">
                        <button class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100" onclick="window.contactsModule.updateStatus('${contact.id}', 'in_progress')">Đang xử lý</button>
                        <button class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onclick="window.contactsModule.updateStatus('${contact.id}', 'resolved')">Hoàn tất</button>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-1">${formatDate(contact.submittedAt)}</p>
                </td>
            </tr>
        `;
    }).join('');
}

function bindEvents() {
    const statusFilter = document.getElementById('contacts-status-filter');
    if (statusFilter) {
        statusFilter.onchange = (e) => {
            currentStatus = e.target.value;
            applyFilter();
            renderTable();
        };
    }

    const btnReload = document.getElementById('btn-reload-contacts');
    if (btnReload) {
        btnReload.onclick = () => reload();
    }
}

function setupRealtime() {
    const q = query(contactsCol, orderBy('submittedAt', 'desc'));
    if (unsubscribeContacts) unsubscribeContacts();
    unsubscribeContacts = onSnapshot(q, (snapshot) => {
        allContacts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilter();
        renderStats();
        renderTable();
    }, (error) => {
        console.error('Error loading contacts:', error);
        if (window.showToast) {
            window.showToast('Không thể tải dữ liệu liên hệ', 'error');
        }
    });
}

async function reload() {
    const snapshot = await getDocs(query(contactsCol, orderBy('submittedAt', 'desc')));
    allContacts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilter();
    renderStats();
    renderTable();
}

async function updateStatus(id, status) {
    try {
        await updateDoc(doc(db, 'contact-submissions', id), {
            status,
            replied: status === 'resolved',
            updatedAt: Date.now()
        });
        if (window.showToast) {
            window.showToast('Cập nhật trạng thái liên hệ thành công', 'success');
        }
    } catch (error) {
        console.error('Error updating contact status:', error);
        if (window.showToast) {
            window.showToast('Không thể cập nhật trạng thái', 'error');
        }
    }
}

function init() {
    if (isInitialized) {
        reload();
        return;
    }
    bindEvents();
    setupRealtime();
    isInitialized = true;
}

window.contactsModule = {
    init,
    reload,
    updateStatus
};
