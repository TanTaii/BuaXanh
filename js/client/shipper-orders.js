import { getFirebaseAuth, getFirebaseFirestore } from '../firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const auth = getFirebaseAuth();
const db = getFirebaseFirestore();

let assignedOrders = [];
let activeFilter = 'all';
let knownOrderIds = new Set();
let hasLoadedInitialSnapshot = false;

function normalizeStatus(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'shipped') return 'shipping';
    if (value === 'processing' || value === 'confirmed') return 'preparing';
    return value || 'pending';
}

function getStatusLabel(status) {
    const value = normalizeStatus(status);
    const map = {
        pending: 'Chờ xác nhận',
        preparing: 'Đang chuẩn bị',
        shipping: 'Đang giao',
        delivered: 'Đã giao',
        cancelled: 'Đã hủy'
    };
    return map[value] || 'Không xác định';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

function formatDate(ts) {
    if (!ts) return '-';
    const value = typeof ts?.toMillis === 'function' ? ts.toMillis() : ts;
    return new Date(value).toLocaleString('vi-VN');
}

function getGenderText(value) {
    const map = {
        male: 'Nam',
        female: 'Nữ',
        other: 'Khác',
        unisex: 'Khác'
    };
    return map[value] || value || '-';
}

async function enrichOrder(order) {
    const customerName = order.customerName || order.customerInfo?.fullname || order.shippingInfo?.name || 'Khách hàng';
    const customerPhone = order.customerPhone || order.customerInfo?.phone || order.phone || '';
    const customerAddress = order.shippingAddress || [order.customerInfo?.address, order.customerInfo?.city].filter(Boolean).join(', ') || '-';

    let customerGender = order.customerGender || order.customerInfo?.gender || '';
    if (!customerGender && order.userId) {
        try {
            const userSnap = await getDoc(doc(db, 'users', order.userId));
            if (userSnap.exists()) {
                customerGender = userSnap.data()?.gender || '';
            }
        } catch (error) {
            console.warn('Cannot load customer gender:', error?.message || error);
        }
    }

    return {
        ...order,
        customerName,
        customerPhone,
        customerAddress,
        customerGender: getGenderText(customerGender)
    };
}

function applyFilter() {
    if (activeFilter === 'all') return assignedOrders;
    return assignedOrders.filter(o => normalizeStatus(o.status) === activeFilter);
}

function renderStats() {
    const shipping = assignedOrders.filter(o => normalizeStatus(o.status) === 'shipping').length;
    const delivered = assignedOrders.filter(o => normalizeStatus(o.status) === 'delivered').length;
    const total = assignedOrders.length;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setText('shipper-stat-total', total);
    setText('shipper-stat-shipping', shipping);
    setText('shipper-stat-delivered', delivered);
}

function renderOrders() {
    const tbody = document.getElementById('shipper-orders-body');
    const mobileContainer = document.getElementById('delivery-orders-mobile');
    if (!tbody) return;

    const orders = applyFilter();
    if (!orders.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-10 text-center text-slate-500">Chưa có đơn được chỉ định</td>
            </tr>
        `;
        if (mobileContainer) {
            mobileContainer.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                    Chưa có đơn được chỉ định
                </div>
            `;
        }
        return;
    }

    tbody.innerHTML = orders.map(order => {
        const status = normalizeStatus(order.status);
        const isDelivered = status === 'delivered';
        const canMarkDelivered = status === 'shipping';
        const callAction = order.customerPhone
            ? (isDelivered
                ? `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold mr-2 cursor-not-allowed" title="Đơn đã giao, không thể gọi"><span class="material-symbols-rounded text-sm">call</span></span>`
                : `<a href="tel:${order.customerPhone}" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 mr-2" title="Gọi điện"><span class="material-symbols-rounded text-sm">call</span></a>`)
            : '';
        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="px-6 py-4 text-xs font-mono text-slate-500">#${order.orderId || order.id.slice(0, 8)}</td>
                <td class="px-6 py-4">
                    <p class="text-sm font-bold text-slate-900">${order.customerName}</p>
                    <p class="text-xs text-slate-500">Giới tính: ${order.customerGender}</p>
                </td>
                <td class="px-6 py-4 text-sm">
                    ${order.customerPhone ? `<a href="tel:${order.customerPhone}" class="text-primary hover:underline font-semibold">${order.customerPhone}</a>` : '-'}
                </td>
                <td class="px-6 py-4 text-sm text-slate-600 max-w-[260px]">${order.customerAddress}</td>
                <td class="px-6 py-4 text-sm font-bold text-slate-900">${formatCurrency(order.total)}</td>
                <td class="px-6 py-4 text-sm text-slate-600">${getStatusLabel(order.status)}</td>
                <td class="px-6 py-4 text-xs text-slate-500">${formatDate(order.updatedAt || order.createdAt)}</td>
                <td class="px-6 py-4 text-right">
                    ${callAction}
                    <button onclick="${canMarkDelivered && !isDelivered ? `window.shipperOrdersModule.markDelivered('${order.id}')` : 'return false;'}" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${canMarkDelivered && !isDelivered ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}" title="${canMarkDelivered && !isDelivered ? 'Xác nhận đã giao' : isDelivered ? 'Đơn đã giao' : 'Đơn chưa ở trạng thái Đang giao'}">
                        Đã giao
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (mobileContainer) {
        mobileContainer.innerHTML = orders.map(order => {
            const status = normalizeStatus(order.status);
            const isDelivered = status === 'delivered';
            const canMarkDelivered = status === 'shipping';
            const statusClass = status === 'delivered'
                ? 'bg-emerald-100 text-emerald-700'
                : status === 'shipping'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-700';
            const mobileCallAction = order.customerPhone
                ? (isDelivered
                    ? `<span class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold cursor-not-allowed" title="Đơn đã giao, không thể gọi"><span class="material-symbols-rounded text-[16px]">call</span></span>`
                    : `<a href="tel:${order.customerPhone}" class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold" title="Gọi điện"><span class="material-symbols-rounded text-[16px]">call</span></a>`)
                : '';
            return `
                <article class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div>
                            <p class="text-xs font-mono text-slate-500">#${order.orderId || order.id.slice(0, 8)}</p>
                            <p class="text-sm font-bold text-slate-900 mt-1">${order.customerName}</p>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-xs font-bold ${statusClass}">${getStatusLabel(order.status)}</span>
                    </div>
                    <div class="space-y-1.5 text-sm">
                        <p class="text-slate-600">${order.customerAddress}</p>
                        <p class="text-slate-500">${formatDate(order.updatedAt || order.createdAt)}</p>
                        <p class="text-slate-900 font-bold">${formatCurrency(order.total)}</p>
                    </div>
                    <div class="flex items-center gap-2 mt-4">
                        ${mobileCallAction}
                        <button onclick="${canMarkDelivered && !isDelivered ? `window.shipperOrdersModule.markDelivered('${order.id}')` : 'return false;'}" class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold ${canMarkDelivered && !isDelivered ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}" title="${canMarkDelivered && !isDelivered ? 'Xác nhận đã giao' : isDelivered ? 'Đơn đã giao' : 'Đơn chưa ở trạng thái Đang giao'}">
                            Đã giao
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }
}

async function notifyAdminDelivered(orderId, orderData) {
    try {
        await addDoc(collection(db, 'notifications'), {
            type: 'order-delivered',
            recipientRole: 'admin',
            orderId,
            orderCode: orderData.orderId || orderId,
            shipperId: auth.currentUser?.uid || null,
            shipperName: document.getElementById('shipper-name')?.textContent || auth.currentUser?.email || 'Nhân viên giao hàng',
            title: 'Đơn hàng đã giao thành công',
            message: `Đơn #${orderData.orderId || orderId} đã được xác nhận giao thành công.`,
            createdAt: Date.now(),
            read: false
        });
    } catch (error) {
        console.warn('Cannot create admin notification:', error?.message || error);
    }
}

function notifyBrowserAboutOrder(order) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification('Bạn có đơn giao mới', {
            body: `Đơn #${order.orderId || order.id?.slice(0, 8) || ''} đã được giao cho bạn.`,
            icon: 'image/Logo.png'
        });
        return;
    }
    if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                new Notification('Bạn có đơn giao mới', {
                    body: `Đơn #${order.orderId || order.id?.slice(0, 8) || ''} đã được giao cho bạn.`,
                    icon: 'image/Logo.png'
                });
            }
        }).catch(() => {});
    }
}

async function markDelivered(orderId) {
    try {
        const orderData = assignedOrders.find(o => o.id === orderId) || {};
        const status = normalizeStatus(orderData.status);
        if (status !== 'shipping') {
            if (window.showToast) {
                window.showToast('Chỉ xác nhận được đơn ở trạng thái Đang giao.', 'warning');
            }
            return;
        }

        await updateDoc(doc(db, 'orders', orderId), {
            status: 'delivered',
            deliveredAt: Date.now(),
            updatedAt: Date.now()
        });
        await notifyAdminDelivered(orderId, orderData);
        if (window.showToast) {
            window.showToast('Đã cập nhật trạng thái giao hàng. Admin đã nhận thông báo.', 'success');
        }
    } catch (error) {
        console.error('Error updating delivery status:', error);
        if (window.showToast) {
            window.showToast('Không thể cập nhật trạng thái đơn hàng', 'error');
        }
    }
}

function bindFilters() {
    document.querySelectorAll('[data-shipper-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            activeFilter = btn.dataset.shipperFilter;
            document.querySelectorAll('[data-shipper-filter]').forEach(b => {
                b.className = 'px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100';
            });
            btn.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white';
            renderOrders();
        });
    });
}

function setupRealtime(uid) {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('shipperId', '==', uid));

    onSnapshot(q, async (snapshot) => {
        const rawOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const currentIds = new Set(rawOrders.map(order => order.id));
        const newlyAssigned = rawOrders.filter(order => !knownOrderIds.has(order.id));

        assignedOrders = await Promise.all(rawOrders.map(enrichOrder));
        assignedOrders.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        renderStats();
        renderOrders();

        // Không bắn thông báo ở snapshot đầu tiên để tránh spam mỗi lần load trang.
        if (hasLoadedInitialSnapshot) {
            newlyAssigned.forEach((order) => {
                if (window.showToast) {
                    window.showToast(`Bạn vừa nhận đơn #${order.orderId || order.id.slice(0, 8)}`, 'info');
                }
                notifyBrowserAboutOrder(order);
            });
        }

        knownOrderIds = currentIds;
        hasLoadedInitialSnapshot = true;
    }, (error) => {
        console.error('Cannot load shipper orders:', error);
        if (window.showToast) {
            window.showToast('Không thể tải danh sách đơn hàng', 'error');
        }
    });
}

function init() {
    bindFilters();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const userData = userSnap.exists() ? userSnap.data() : null;

        if (!userData || userData.role !== 'shipper') {
            if (window.showToast) {
                window.showToast('Bạn không có quyền truy cập trang shipper', 'error');
            }
            setTimeout(() => {
                window.location.href = 'Account.html';
            }, 700);
            return;
        }

        const shipperName = document.getElementById('shipper-name');
        if (shipperName) {
            shipperName.textContent = userData.displayName || user.email;
        }

        setupRealtime(user.uid);
    });
}

window.shipperOrdersModule = {
    init,
    markDelivered
};

init();
