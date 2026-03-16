/**
 * Bua Xanh Admin - Users Management Module
 * Manages user data, roles, and permissions
 */

import { getFirebaseFirestore, getFirebaseAuth } from '../firebase-config.js';
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const database = getFirebaseFirestore();
const auth = getFirebaseAuth();

// Module state
const state = {
    users: [],
    filteredUsers: [],
    orders: [],
    currentFilter: 'all',
    currentSort: 'newest',
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 10
};

/**
 * Initialize users module
 */
export async function init() {
    console.log('Initializing Users Management Module...');
    
    // Set up listeners
    setupRealtimeListeners();
    setupEventListeners();
    
    // Initial data load
    await Promise.all([
        fetchUsers(),
        fetchOrders()
    ]);
    
    // Initial render
    updateStats();
    renderUsersTable();
}

/**
 * Setup Firebase realtime listeners
 */
function setupRealtimeListeners() {
    // Listen to users changes
    onSnapshot(collection(database, 'users'), (snapshot) => {
        state.users = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
        applyFiltersAndSort();
        updateStats();
        renderUsersTable();
    });

    // Listen to orders changes
    onSnapshot(collection(database, 'orders'), (snapshot) => {
        state.orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        updateStats();
    });
}

/**
 * Fetch all users from Firebase
 */
async function fetchUsers() {
    try {
        const snapshot = await getDocs(collection(database, 'users'));
        state.users = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
        applyFiltersAndSort();
    } catch (error) {
        console.error('Error fetching users:', error);
        showNotification('Lỗi khi tải danh sách người dùng', 'error');
    }
}

/**
 * Fetch all orders
 */
async function fetchOrders() {
    try {
        const snapshot = await getDocs(collection(database, 'orders'));
        state.orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error('Error fetching orders:', error);
    }
}

/**
 * Get user statistics (orders, spending, etc.)
 */
function getUserStats(userId) {
    const userOrders = state.orders.filter(order => order.userId === userId);
    const totalOrders = userOrders.length;
    const totalSpent = userOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const completedOrders = userOrders.filter(order => order.status === 'delivered').length;
    
    return {
        totalOrders,
        totalSpent,
        completedOrders
    };
}

/**
 * Update statistics cards
 */
function updateStats() {
    const totalUsers = state.users.length;
    const adminUsers = state.users.filter(u => u.role === 'admin' || u.isAdmin).length;
    const customerUsers = state.users.filter(u => (u.role || 'customer') === 'customer').length;
    
    // New users in last 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const newUsers = state.users.filter(u => u.createdAt && u.createdAt >= sevenDaysAgo).length;
    
    // Safely update DOM - check if elements exist first
    const totalEl = document.getElementById('stat-users-total');
    const adminEl = document.getElementById('stat-users-admin');
    const customerEl = document.getElementById('stat-users-customer');
    const newEl = document.getElementById('stat-users-new');
    
    if (totalEl) totalEl.textContent = totalUsers;
    if (adminEl) adminEl.textContent = adminUsers;
    if (customerEl) customerEl.textContent = customerUsers;
    if (newEl) newEl.textContent = newUsers;
}

/**
 * Apply filters and sorting
 */
function applyFiltersAndSort() {
    let filtered = [...state.users];
    
    // Apply search
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(user => 
            user.displayName?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query) ||
            user.uid?.toLowerCase().includes(query)
        );
    }
    
    // Apply role filter
    if (state.currentFilter !== 'all') {
        if (state.currentFilter === 'admin') {
            filtered = filtered.filter(u => u.role === 'admin' || u.isAdmin);
        } else if (state.currentFilter === 'customer') {
            filtered = filtered.filter(u => (u.role || 'customer') === 'customer');
        } else if (state.currentFilter === 'shipper') {
            filtered = filtered.filter(u => u.role === 'shipper');
        } else if (state.currentFilter === 'verified') {
            filtered = filtered.filter(u => u.emailVerified === true);
        }
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
        switch (state.currentSort) {
            case 'newest':
                return (b.createdAt || 0) - (a.createdAt || 0);
            case 'oldest':
                return (a.createdAt || 0) - (b.createdAt || 0);
            case 'name_asc':
                return (a.displayName || '').localeCompare(b.displayName || '');
            case 'name_desc':
                return (b.displayName || '').localeCompare(a.displayName || '');
            case 'last_login':
                return (b.lastLogin || 0) - (a.lastLogin || 0);
            default:
                return 0;
        }
    });
    
    state.filteredUsers = filtered;
}

/**
 * Render users table
 */
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    
    // Pagination
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    const paginatedUsers = state.filteredUsers.slice(start, end);
    
    if (paginatedUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                    <span class="material-symbols-rounded text-5xl opacity-20 block mb-3">person_off</span>
                    <p class="text-sm font-medium">Không tìm thấy người dùng nào</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = paginatedUsers.map(user => {
        const stats = getUserStats(user.uid);
        const role = user.role || (user.isAdmin ? 'admin' : 'customer');
        const canSetEmployee = role !== 'admin' && role !== 'shipper';
        let roleBadge = '<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Khách hàng</span>';
        if (role === 'admin') {
            roleBadge = '<span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Admin</span>';
        } else if (role === 'shipper') {
            roleBadge = '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Nhân viên</span>';
        }
        
        const verifiedBadge = user.emailVerified
            ? '<span class="material-symbols-rounded text-emerald-500 text-[16px]" title="Email đã xác thực">verified</span>'
            : '<span class="material-symbols-rounded text-slate-300 text-[16px]" title="Email chưa xác thực">cancel</span>';
        
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                            <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User') + '&background=e71823&color=fff'}" 
                                 alt="${user.displayName || 'User'}" 
                                 class="h-full w-full object-cover">
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-slate-900 truncate flex items-center gap-1">
                                ${user.displayName || 'N/A'}
                                ${verifiedBadge}
                            </p>
                            <p class="text-xs text-slate-500 truncate">${user.email || 'N/A'}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    ${roleBadge}
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm">
                        <p class="font-semibold text-slate-900">${stats.totalOrders} đơn</p>
                        <p class="text-xs text-slate-500">${formatCurrency(stats.totalSpent)}</p>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm text-slate-600">${user.createdAt ? formatDate(user.createdAt) : 'N/A'}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm text-slate-600">${user.lastLogin ? formatDate(user.lastLogin) : 'Chưa đăng nhập'}</p>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-1">
                        <span class="h-2 w-2 rounded-full ${user.lastLogin && (Date.now() - user.lastLogin < 30 * 60 * 1000) ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                        <span class="text-xs font-medium ${user.lastLogin && (Date.now() - user.lastLogin < 30 * 60 * 1000) ? 'text-emerald-600' : 'text-slate-500'}">
                            ${user.lastLogin && (Date.now() - user.lastLogin < 30 * 60 * 1000) ? 'Trực tuyến' : 'Ngoại tuyến'}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center justify-end gap-2">
                        <div class="group relative inline-block">
                            <button onclick="window.usersModule.viewDetails('${user.uid}')" 
                                    class="p-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                                    title="Xem thông tin">
                                <span class="material-symbols-rounded text-[18px]">visibility</span>
                            </button>
                            <div class="pointer-events-none absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap z-10">
                                Xem thông tin
                            </div>
                        </div>
                        <div class="group relative inline-block">
                            <button onclick="window.usersModule.setAsEmployee('${user.uid}')" 
                                    ${canSetEmployee ? '' : 'disabled'}
                                    class="p-2.5 rounded-lg transition-all ${canSetEmployee ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}"
                                    title="Đặt làm nhân viên">
                                <span class="material-symbols-rounded text-[18px]">badge</span>
                            </button>
                            <div class="pointer-events-none absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap z-10">
                                ${canSetEmployee ? 'Đặt làm nhân viên' : 'Đã là nhân viên/Admin'}
                            </div>
                        </div>
                        <div class="group relative inline-block">
                            <button onclick="window.usersModule.deleteUser('${user.uid}', '${user.displayName || 'User'}')" 
                                    class="p-2.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-all" 
                                    title="Xóa tài khoản">
                                <span class="material-symbols-rounded text-[18px]">delete</span>
                            </button>
                            <div class="pointer-events-none absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap z-10">
                                Xóa tài khoản
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    renderPagination();
}

/**
 * Render pagination controls
 */
function renderPagination() {
    const totalPages = Math.ceil(state.filteredUsers.length / state.itemsPerPage);
    const paginationControls = document.getElementById('users-pagination-controls');
    const showingText = document.getElementById('users-showing-text');
    
    if (!paginationControls || !showingText) return;
    
    const start = (state.currentPage - 1) * state.itemsPerPage + 1;
    const end = Math.min(state.currentPage * state.itemsPerPage, state.filteredUsers.length);
    
    showingText.innerHTML = `Hiển thị <span class="text-slate-900 font-bold">${start}-${end}</span> trong tổng số <span class="text-slate-900 font-bold">${state.filteredUsers.length}</span> người dùng`;
    
    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }
    
    let paginationHTML = `
        <button onclick="window.usersModule.setPage(${state.currentPage - 1})" 
                ${state.currentPage === 1 ? 'disabled' : ''}
                class="px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="material-symbols-rounded text-[18px] md:text-[20px]">chevron_left</span>
        </button>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            paginationHTML += `
                <button onclick="window.usersModule.setPage(${i})" 
                        class="px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${i === state.currentPage ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}">
                    ${i}
                </button>
            `;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            paginationHTML += `<span class="px-1 md:px-2 text-slate-400 text-xs md:text-sm">...</span>`;
        }
    }
    
    paginationHTML += `
        <button onclick="window.usersModule.setPage(${state.currentPage + 1})" 
                ${state.currentPage === totalPages ? 'disabled' : ''}
                class="px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="material-symbols-rounded text-[18px] md:text-[20px]">chevron_right</span>
        </button>
    `;
    
    paginationControls.innerHTML = paginationHTML;
}

/**
 * View user details modal
 */
export async function viewDetails(userId) {
    const user = state.users.find(u => u.uid === userId);
    if (!user) return;
    
    const stats = getUserStats(userId);
    const userOrders = state.orders.filter(order => order.userId === userId);
    
    // Populate modal
    document.getElementById('modal-user-avatar').src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User');
    document.getElementById('modal-user-name').textContent = user.displayName || 'N/A';
    document.getElementById('modal-user-email').textContent = user.email || 'N/A';
    document.getElementById('modal-user-uid').textContent = user.uid;
    if (user.role === 'admin' || user.isAdmin) {
        document.getElementById('modal-user-role').innerHTML = '<span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Admin</span>';
    } else if (user.role === 'shipper') {
        document.getElementById('modal-user-role').innerHTML = '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Nhân viên</span>';
    } else {
        document.getElementById('modal-user-role').innerHTML = '<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Khách hàng</span>';
    }
    
    document.getElementById('modal-user-phone').textContent = user.phone || 'Chưa cập nhật';
    document.getElementById('modal-user-gender').textContent = user.gender === 'male' ? 'Nam' : user.gender === 'female' ? 'Nữ' : 'Chưa cập nhật';
    document.getElementById('modal-user-created').textContent = user.createdAt ? formatDate(user.createdAt) : 'N/A';
    document.getElementById('modal-user-last-login').textContent = user.lastLogin ? formatDate(user.lastLogin) : 'Chưa đăng nhập';
    document.getElementById('modal-user-verified').innerHTML = user.emailVerified 
        ? '<span class="text-emerald-600 font-semibold">✓ Đã xác thực</span>'
        : '<span class="text-amber-600 font-semibold">✗ Chưa xác thực</span>';
    
    // Address
    if (user.address) {
        const addr = user.address;
        document.getElementById('modal-user-address').textContent = 
            `${addr.street || ''}, ${addr.ward || ''}, ${addr.district || ''}, ${addr.city || ''}`.replace(/^[,\s]+|[,\s]+$/g, '') || 'Chưa cập nhật';
    } else {
        document.getElementById('modal-user-address').textContent = 'Chưa cập nhật';
    }
    
    // Stats
    document.getElementById('modal-user-orders').textContent = stats.totalOrders;
    document.getElementById('modal-user-spent').textContent = formatCurrency(stats.totalSpent);
    document.getElementById('modal-user-loyalty').textContent = user.loyaltyPoints || 0;
    document.getElementById('modal-user-tier').textContent = user.membershipTier || 'Member';
    
    // Recent orders
    const recentOrders = userOrders.slice(0, 5);
    const ordersHTML = recentOrders.length > 0 
        ? recentOrders.map(order => `
            <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100">
                <div>
                    <p class="text-sm font-bold text-slate-900">${order.orderId}</p>
                    <p class="text-xs text-slate-500">${formatDate(order.createdAt)}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold text-primary">${formatCurrency(order.total)}</p>
                    <p class="text-xs text-slate-500">${getStatusText(order.status)}</p>
                </div>
            </div>
        `).join('')
        : '<p class="text-sm text-slate-400 text-center py-4">Chưa có đơn hàng nào</p>';
    
    document.getElementById('modal-user-recent-orders').innerHTML = ordersHTML;
    
    // Show modal
    const modal = document.getElementById('user-details-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Close user details modal
 */
export function closeDetails() {
    const modal = document.getElementById('user-details-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/**
 * Edit user
 */
export function editUser(userId) {
    const user = state.users.find(u => u.uid === userId);
    if (!user) return;
    
    // Populate edit form
    document.getElementById('edit-user-id').value = user.uid;
    document.getElementById('edit-user-name').value = user.displayName || '';
    document.getElementById('edit-user-email').value = user.email || '';
    document.getElementById('edit-user-phone').value = user.phone || '';
    document.getElementById('edit-user-gender').value = user.gender || 'unisex';
    document.getElementById('edit-user-role').value = user.role || 'customer';
    document.getElementById('edit-user-loyalty').value = user.loyaltyPoints || 0;
    
    // Address fields
    if (user.address) {
        document.getElementById('edit-user-street').value = user.address.street || '';
        document.getElementById('edit-user-ward').value = user.address.ward || '';
        document.getElementById('edit-user-district').value = user.address.district || '';
        document.getElementById('edit-user-city').value = user.address.city || '';
    }
    
    // Show modal
    const modal = document.getElementById('edit-user-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Close edit modal
 */
export function closeEditModal() {
    const modal = document.getElementById('edit-user-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/**
 * Save user changes
 */
export async function saveUser() {
    const userId = document.getElementById('edit-user-id').value;
    const selectedRole = document.getElementById('edit-user-role').value;
    const userData = {
        displayName: document.getElementById('edit-user-name').value,
        phone: document.getElementById('edit-user-phone').value,
        gender: document.getElementById('edit-user-gender').value,
        role: selectedRole,
        isAdmin: selectedRole === 'admin',
        isShipper: selectedRole === 'shipper',
        loyaltyPoints: parseInt(document.getElementById('edit-user-loyalty').value) || 0,
        address: {
            street: document.getElementById('edit-user-street').value,
            ward: document.getElementById('edit-user-ward').value,
            district: document.getElementById('edit-user-district').value,
            city: document.getElementById('edit-user-city').value
        }
    };
    
    try {
        await updateDoc(doc(database, 'users', userId), userData);
        showNotification('Cập nhật thông tin người dùng thành công!', 'success');
        closeEditModal();
    } catch (error) {
        console.error('Error updating user:', error);
        showNotification('Lỗi khi cập nhật thông tin người dùng', 'error');
    }
}

/**
 * Delete user account
 */
export async function deleteUser(userId, userName) {
    const confirmed = await showConfirm(
        `Bạn có chắc chắn muốn xóa tài khoản của "${userName}"?`,
        {
            title: 'Xác nhận xóa tài khoản',
            submessage: 'Thao tác này không thể hoàn tác!',
            type: 'danger',
            confirmText: 'Xóa',
            cancelText: 'Hủy'
        }
    );
    
    if (!confirmed) return;
    
    try {
        // Check if user has orders
        const userOrders = state.orders.filter(order => order.userId === userId);
        
        if (userOrders.length > 0) {
            const confirmWithOrders = await showConfirm(
                `Người dùng này có ${userOrders.length} đơn hàng.`,
                {
                    title: 'Cảnh báo',
                    submessage: 'Bạn vẫn muốn tiếp tục xóa?',
                    type: 'warning',
                    confirmText: 'Tiếp tục',
                    cancelText: 'Hủy'
                }
            );
            if (!confirmWithOrders) return;
        }
        
        // Delete user data from Firestore
        await deleteDoc(doc(database, 'users', userId));
        // Also delete cart and wishlist
        await Promise.all([
            deleteDoc(doc(database, 'cart', userId)).catch(() => {}),
            deleteDoc(doc(database, 'wishlist', userId)).catch(() => {})
        ]);
        showNotification('Đã xóa tài khoản thành công', 'success');
        
        await fetchUsers();
        renderUsersTable();
        updateStats();
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('Lỗi khi xóa tài khoản: ' + error.message, 'error');
    }
}

/**
 * Set user role to employee (shipper)
 */
export async function setAsEmployee(userId) {
    const user = state.users.find(u => u.uid === userId);
    if (!user) return;

    if (user.role === 'admin' || user.isAdmin) {
        showNotification('Không thể đổi tài khoản Admin thành nhân viên.', 'warning');
        return;
    }

    if (user.role === 'shipper') {
        showNotification('Người dùng này đã là nhân viên.', 'info');
        return;
    }

    const confirmed = await showConfirm(
        `Đặt "${user.displayName || user.email || 'người dùng này'}" thành nhân viên giao hàng?`,
        {
            title: 'Xác nhận cập nhật vai trò',
            submessage: 'Người dùng sẽ truy cập trang Delivery.',
            type: 'warning',
            confirmText: 'Xác nhận',
            cancelText: 'Hủy'
        }
    );

    if (!confirmed) return;

    try {
        await updateDoc(doc(database, 'users', userId), {
            role: 'shipper',
            isShipper: true,
            isAdmin: false
        });
        showNotification('Đã cập nhật người dùng thành nhân viên.', 'success');
    } catch (error) {
        console.error('Error setting employee role:', error);
        showNotification('Lỗi khi cập nhật vai trò nhân viên.', 'error');
    }
}

/**
 * Toggle admin role
 */
export async function toggleAdmin(userId, makeAdmin) {
    const user = state.users.find(u => u.uid === userId);
    if (!user) return;
    
    const confirmMessage = makeAdmin 
        ? `Bạn có chắc muốn cấp quyền Admin cho "${user.displayName}"?`
        : `Bạn có chắc muốn gỡ quyền Admin của "${user.displayName}"?`;
    
    const confirmed = await window.showConfirm(
        confirmMessage,
        {
            title: makeAdmin ? 'Cấp quyền Admin' : 'Gỡ quyền Admin',
            type: 'warning',
            confirmText: 'Đồng ý',
            cancelText: 'Hủy'
        }
    );
    
    if (!confirmed) return;
    
    try {
        await updateDoc(doc(database, 'users', userId), {
            role: makeAdmin ? 'admin' : 'customer',
            isAdmin: makeAdmin
        });
        
        showNotification(
            makeAdmin ? 'Đã cấp quyền Admin thành công!' : 'Đã gỡ quyền Admin thành công!',
            'success'
        );
    } catch (error) {
        console.error('Error toggling admin:', error);
        showNotification('Lỗi khi thay đổi quyền', 'error');
    }
}

/**
 * Set filter
 */
export function setFilter(filter) {
    state.currentFilter = filter;
    state.currentPage = 1;
    
    // Update UI
    document.querySelectorAll('[id^="filter-btn-"]').forEach(btn => {
        btn.className = 'px-3 md:px-4 py-2 text-slate-600 hover:text-slate-900 text-xs md:text-sm font-medium rounded-lg transition-all whitespace-nowrap';
    });
    document.getElementById(`filter-btn-${filter}`).className = 'px-3 md:px-4 py-2 bg-white text-slate-900 text-xs md:text-sm font-bold rounded-lg shadow-sm transition-all whitespace-nowrap';
    
    applyFiltersAndSort();
    renderUsersTable();
}

/**
 * Set sort
 */
export function setSort(sort) {
    state.currentSort = sort;
    applyFiltersAndSort();
    renderUsersTable();
}

/**
 * Search users
 */
export function search(query) {
    state.searchQuery = query;
    state.currentPage = 1;
    applyFiltersAndSort();
    renderUsersTable();
}

/**
 * Set page
 */
export function setPage(page) {
    const totalPages = Math.ceil(state.filteredUsers.length / state.itemsPerPage);
    if (page < 1 || page > totalPages) return;
    
    state.currentPage = page;
    renderUsersTable();
}

/**
 * Reload data
 */
export async function reload() {
    await Promise.all([
        fetchUsers(),
        fetchOrders()
    ]);
    showNotification('Đã tải lại dữ liệu', 'success');
}

/**
 * Export users to CSV
 */
export function exportCSV() {
    const headers = ['UID', 'Tên', 'Email', 'Vai trò', 'Điện thoại', 'Ngày tham gia', 'Đăng nhập cuối', 'Số đơn hàng', 'Tổng chi tiêu'];
    const rows = state.filteredUsers.map(user => {
        const stats = getUserStats(user.uid);
        return [
            user.uid,
            user.displayName || '',
            user.email || '',
            user.role || 'customer',
            user.phone || '',
            user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '',
            user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('vi-VN') : '',
            stats.totalOrders,
            stats.totalSpent
        ];
    });
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showNotification('Đã xuất danh sách người dùng', 'success');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('users-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            search(e.target.value);
        });
    }
}

/**
 * Utility functions
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Chờ xử lý',
        'processing': 'Đang xử lý',
        'confirmed': 'Đã xác nhận',
        'preparing': 'Đang chuẩn bị',
        'shipped': 'Đang giao',
        'shipping': 'Đang giao',
        'delivered': 'Đã giao',
        'cancelled': 'Đã hủy'
    };
    return statusMap[status] || status;
}

function showNotification(message, type = 'info') {
    // Use global notification system
    if (window.showNotification) {
        window.showNotification(message, type);
    } else if (window.showToast) {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Export module functions
window.usersModule = {
    init,
    viewDetails,
    closeDetails,
    setAsEmployee,
    editUser,
    closeEditModal,
    saveUser,
    deleteUser,
    setFilter,
    setSort,
    search,
    setPage,
    reload,
    exportCSV
};