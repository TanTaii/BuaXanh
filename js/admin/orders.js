import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const db = getFirebaseFirestore();

// Utility: Format Currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Utility: Format Date
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(date);
}

let allOrders = [];
let filteredOrders = [];
let currentFilter = 'all';
let currentSort = 'newest';
let currentPage = 1;
const itemsPerPage = 5;

/**
 * Initialize Orders Module
 */
function init() {
    console.log('Orders Module Initialized');
    reload();
}

/**
 * Reload Orders Data
 */
async function reload() {
    const tableBody = document.getElementById('orders-table-body');
    const loadingState = document.getElementById('orders-loading');

    if (loadingState) loadingState.style.display = 'flex';
    if (tableBody) tableBody.innerHTML = '';

    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
        const snapshot = await getDocs(collection(db, 'orders'));
        allOrders = snapshot.docs.map(d => ({ key: d.id, ...d.data() }));
        applyFilterAndSort();
        renderStats();
    } catch (error) {
        console.error("Error loading orders:", error);
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-red-500">Lỗi tải dữ liệu</td></tr>';
    } finally {
        if (loadingState) loadingState.style.display = 'none';
    }
}

/**
 * Apply Filters and Sort
 */
function applyFilterAndSort() {
    // 1. Filter
    if (currentFilter === 'all') {
        filteredOrders = [...allOrders];
    } else {
        filteredOrders = allOrders.filter(o => (o.status || '').toLowerCase() === currentFilter.toLowerCase());
    }

    // 2. Sort
    filteredOrders.sort((a, b) => {
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        const totalA = parseInt(a.total || 0);
        const totalB = parseInt(b.total || 0);

        switch (currentSort) {
            case 'newest': return timeB - timeA;
            case 'oldest': return timeA - timeB;
            case 'highest_total': return totalB - totalA;
            default: return timeB - timeA;
        }
    });

    // Reset to page 1 when filter/sort changes
    // renderTable will handle slicing
    renderTable();
    renderPagination();
    updateFilterUI();
}

/**
 * Set Filter (Called from UI)
 */
function setFilter(status) {
    currentFilter = status;
    currentPage = 1;
    applyFilterAndSort();
}

/**
 * Set Sort (Called from UI)
 */
function setSort(sortType) {
    currentSort = sortType;
    applyFilterAndSort();
}

/**
 * Change Page
 */
function setPage(page) {
    if (page < 1 || page > Math.ceil(filteredOrders.length / itemsPerPage)) return;
    currentPage = page;
    renderTable();
    renderPagination();
}

/**
 * Export CSV
 */
function exportCSV() {
    if (!filteredOrders.length) {
        if (window.showToast) {
            window.showToast('Không có dữ liệu để xuất!', 'warning');
        }
        return;
    }
    
    const headers = ["Order ID", "Date", "Customer", "Phone", "Total", "Status"];
    const rows = filteredOrders.map(o => [
        o.orderId || o.key,
        new Date(o.createdAt).toLocaleString('vi-VN'),
        o.customerName,
        o.customerPhone,
        o.total,
        o.status
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
    csvContent += headers.join(",") + "\n";
    rows.forEach(row => {
        csvContent += row.map(e => `"${e}"`).join(",") + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "orders_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}



/**
 * Update Filter Buttons UI
 */
function updateFilterUI() {
    const filters = ['all', 'pending', 'shipped', 'delivered'];
    filters.forEach(f => {
        const btn = document.getElementById(`filter-btn-${f}`);
        if(btn) {
            if (f === currentFilter) {
                btn.className = "px-4 py-2 bg-white dark:bg-card-dark text-slate-900 dark:text-white text-sm font-bold rounded-lg shadow-sm transition-all";
            } else {
                btn.className = "px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-medium rounded-lg transition-all";
            }
        }
    });
}

/**
 * Render Statistics
 */
function renderStats() {
    const pending = allOrders.filter(o => o.status === 'pending').length;
    const shipped = allOrders.filter(o => o.status === 'shipped').length;
    const delivered = allOrders.filter(o => o.status === 'delivered').length;
    const cancelled = allOrders.filter(o => o.status === 'cancelled').length;

    const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setStat('stat-orders-pending', pending);
    setStat('stat-orders-shipped', shipped);
    setStat('stat-orders-delivered', delivered);
    setStat('stat-orders-cancelled', cancelled);
}

/**
 * Render Orders Table (with Pagination)
 */
function renderTable() {
    const tableBody = document.getElementById('orders-table-body');
    if (!tableBody) return;

    if (filteredOrders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-slate-500">
                    <span class="material-symbols-rounded text-4xl opacity-20 block mb-2">inbox</span>
                    Không có đơn hàng nào
                </td>
            </tr>
        `;
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const items = filteredOrders.slice(start, end);

    tableBody.innerHTML = items.map((order, index) => {
        const statusConfig = getStatusConfig(order.status);
        // Determine if dropdown should open upwards (if it's one of the last 2 items)
        const isLastRows = index >= items.length - 2;
        const dropdownPositionClass = isLastRows ? 'bottom-full mb-1' : 'top-full mt-1';
        
        return `
            <tr class="group hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-slate-800">
                <td class="px-6 py-4">
                    <span class="text-primary font-bold hover:underline cursor-pointer" onclick="window.ordersModule.showDetails('${order.key}')">
                        #${order.orderId || order.key.substring(0, 8)}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            ${formatDate(order.createdAt).split(',')[0]}
                        </span>
                        <span class="text-xs text-slate-400">
                            ${formatDate(order.createdAt).split(',')[1]}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200 dark:border-slate-700">
                            ${getInitials(order.customerName || 'Guest')}
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-slate-900 dark:text-white">${order.customerName || 'Khách vãng lai'}</p>
                            <p class="text-xs text-slate-500">${order.customerPhone || ''}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span class="material-symbols-rounded text-[18px]">credit_card</span>
                        ${order.paymentMethod || 'COD'}
                    </div>
                </td>
                <td class="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">
                    ${formatCurrency(order.total || 0)}
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.class}">
                        <span class="w-1.5 h-1.5 rounded-full ${statusConfig.dotClass} animate-pulse"></span>
                        ${statusConfig.label}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="p-2 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all" 
                            title="Xem chi tiết" onclick="window.ordersModule.showDetails('${order.key}')">
                            <span class="material-symbols-rounded text-[20px]">visibility</span>
                        </button>
                        <div class="relative">
                            <button class="edit-status-btn p-2 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all" 
                                title="Cập nhật trạng thái" 
                                data-order-id="${order.key}">
                                <span class="material-symbols-rounded text-[20px]">edit_square</span>
                            </button>
                            <!-- Dropdown Menu for Status -->
                            <div class="status-dropdown absolute right-0 ${dropdownPositionClass} w-40 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-slate-100 dark:border-border-dark hidden z-10 overflow-hidden">
                                <div class="py-1">
                                    <button onclick="window.ordersModule.updateStatus('${order.key}', 'pending'); window.ordersModule.closeAllDropdowns();" class="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5 text-orange-600">Chờ xử lý</button>
                                    <button onclick="window.ordersModule.updateStatus('${order.key}', 'shipped'); window.ordersModule.closeAllDropdowns();" class="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5 text-blue-600">Đang giao</button>
                                    <button onclick="window.ordersModule.updateStatus('${order.key}', 'delivered'); window.ordersModule.closeAllDropdowns();" class="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5 text-emerald-600">Đã giao</button>
                                    <button onclick="window.ordersModule.updateStatus('${order.key}', 'cancelled'); window.ordersModule.closeAllDropdowns();" class="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5 text-rose-600">Đã hủy</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    renderPagination();
    
    // Setup dropdown event delegation after rendering
    setupDropdownEvents();
}
function renderPagination() {
    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
    const paginationContainer = document.getElementById('orders-pagination');
    
    if (!paginationContainer) return;

    const totalItems = filteredOrders.length;
    if (totalItems > 0) {
       const start = (currentPage - 1) * itemsPerPage + 1;
       const end = Math.min(currentPage * itemsPerPage, totalItems);
       
       document.getElementById('orders-showing-text').innerHTML = `Hiển thị <span class="text-slate-900 dark:text-white font-bold">${start}-${end}</span> trong <span class="text-slate-900 dark:text-white font-bold">${totalItems}</span> đơn hàng`;
    } else {
        document.getElementById('orders-showing-text').innerHTML = 'Chưa có đơn hàng';
    }


    let html = `
        <button onclick="window.ordersModule.setPage(${currentPage - 1})" class="p-2 rounded-lg border border-slate-200 dark:border-border-dark text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-all" ${currentPage === 1 ? 'disabled' : ''}>
            <span class="material-symbols-rounded text-[18px]">chevron_left</span>
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        // Show limited pages logic can be added here, for now simpler
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
             if (i === currentPage) {
                 html += `<button class="w-9 h-9 rounded-lg bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">${i}</button>`;
             } else {
                 html += `<button onclick="window.ordersModule.setPage(${i})" class="w-9 h-9 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 text-sm font-medium transition-all">${i}</button>`;
             }
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="text-slate-400 px-1">...</span>`;
        }
    }

    html += `
        <button onclick="window.ordersModule.setPage(${currentPage + 1})" class="p-2 rounded-lg border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-primary transition-all" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}>
            <span class="material-symbols-rounded text-[18px]">chevron_right</span>
        </button>
    `;

    document.getElementById('orders-pagination-controls').innerHTML = html;
}

/**
 * Get Status Styling Config
 */
function getStatusConfig(status) {
    status = (status || '').toLowerCase();
    switch (status) {
        case 'pending':
            return { label: 'Chờ xử lý', class: 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-500 border border-orange-200 dark:border-orange-500/20', dotClass: 'bg-orange-500' };
        case 'shipped':
            return { label: 'Đang giao', class: 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 border border-blue-200 dark:border-blue-500/20', dotClass: 'bg-blue-500' };
        case 'delivered':
            return { label: 'Đã giao', class: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20', dotClass: 'bg-emerald-500' };
        case 'cancelled':
            return { label: 'Đã hủy', class: 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20', dotClass: 'bg-rose-500' };
        default:
            return { label: 'Không rõ', class: 'bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-500/20', dotClass: 'bg-slate-500' };
    }
}

function getInitials(name) {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

/**
 * Update Order Status
 */
async function updateStatus(orderId, newStatus) {
    const confirmed = await window.showConfirm(
        `Bạn có chắc muốn chuyển trạng thái đơn hàng thành "${newStatus}"?`,
        {
            title: 'Xác nhận cập nhật',
            type: 'info',
            confirmText: 'Cập nhật',
            cancelText: 'Hủy'
        }
    );
    
    if (!confirmed) return;

    try {
        const orderRef = doc(db, `orders/${orderId}`);
        await updateDoc(orderRef, {
            status: newStatus,
            updatedAt: Date.now()
        });
        
        // Cập nhật state local ngay để giao diện thấy phản hồi nhanh
        const orderIndex = allOrders.findIndex(o => o.key === orderId);
        if (orderIndex !== -1) {
            allOrders[orderIndex].status = newStatus;
            allOrders[orderIndex].updatedAt = Date.now();
        }
        applyFilterAndSort();
        renderStats();
        
        if (window.showToast) {
            window.showToast('Cập nhật trạng thái thành công!', 'success');
        }
    } catch (error) {
        console.error('Lỗi cập nhật:', error);
        if (window.showToast) {
            window.showToast('Không thể cập nhật trạng thái', 'error');
        }
    }
}

/**
 * Show Order Details
 */
function showDetails(orderId) {
    const order = allOrders.find(o => o.key === orderId);
    if (!order) return;

    const modal = document.getElementById('order-details-modal');
    if (!modal) return;

    // Populate Info
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || 'N/A';
    };

    setText('modal-order-id', `#${order.orderId || order.key.substring(0, 8)}`);
    setText('modal-order-date', formatDate(order.createdAt));
    setText('modal-customer', order.customerName);
    setText('modal-phone', order.customerPhone);
    setText('modal-address', order.shippingAddress);
    setText('modal-payment', order.paymentMethod);
    setText('modal-total', formatCurrency(order.total || 0));

    // Status Badge
    const statusConfig = getStatusConfig(order.status);
    const statusBadge = document.getElementById('modal-status');
    if (statusBadge) {
        statusBadge.className = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.class}`;
        statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}"></span> ${statusConfig.label}`;
    }

    // Render Items
    const itemsContainer = document.getElementById('modal-items');
    if (itemsContainer) {
        if (order.items && Array.isArray(order.items)) {
            itemsContainer.innerHTML = order.items.map(item => `
                <div class="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div class="flex items-center gap-3">
                        <div class="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                             ${item.image ? `<img src="${item.image}" class="w-full h-full object-cover">` : '<span class="material-symbols-rounded text-slate-400">image</span>'}
                        </div>
                        <div>
                            <p class="text-sm font-medium text-slate-900 dark:text-white">${item.name || 'Sản phẩm'}</p>
                            <p class="text-xs text-slate-500">
                                ${item.size ? `Size: ${item.size}` : ''} 
                                ${item.color ? `| Color: ${item.color}` : ''}
                                <span class="mx-1">•</span> x${item.quantity || 1}
                            </p>
                        </div>
                    </div>
                    <span class="text-sm font-semibold text-slate-900 dark:text-white">
                        ${formatCurrency((item.price || 0) * (item.quantity || 1))}
                    </span>
                </div>
            `).join('');
        } else {
            itemsContainer.innerHTML = '<p class="text-center text-slate-500 py-4">Không có thông tin chi tiết sản phẩm</p>';
        }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Close Order Details
 */
function closeDetails() {
    const modal = document.getElementById('order-details-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Close all status dropdowns
 */
function closeAllDropdowns() {
    document.querySelectorAll('.status-dropdown').forEach(dropdown => {
        dropdown.classList.add('hidden');
    });
}

/**
 * Setup event delegation for dropdown toggles
 */
function setupDropdownEvents() {
    const tableBody = document.getElementById('orders-table-body');
    if (!tableBody) return;

    // Remove old listener if exists
    tableBody.removeEventListener('click', handleDropdownClick);
    
    // Add new listener
    tableBody.addEventListener('click', handleDropdownClick);
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.edit-status-btn') && !e.target.closest('.status-dropdown')) {
            closeAllDropdowns();
        }
    });
}

function handleDropdownClick(e) {
    const btn = e.target.closest('.edit-status-btn');
    if (!btn) return;
    
    e.stopPropagation();
    
    // Close all other dropdowns first
    closeAllDropdowns();
    
    // Toggle this dropdown
    const dropdown = btn.nextElementSibling;
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// Export module
// Product Handling Variables
let allProducts = {}; // Cache products
let selectedItems = []; // Items in current new order

/**
 * Open Create Order Modal
 */
function createOrder() {
    const modal = document.getElementById('create-order-modal');
    if (!modal) return;
    
    // Reset form
    const form = document.getElementById('create-order-form');
    if (form) form.reset();
    selectedItems = [];
    
    // Load products for search (cached)
    // In a real app we might want to fetch fresh, but rely on caching for now or fetch if empty
    import('../firebase-config.js').then(async ({ getFirebaseFirestore }) => {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
        const fsDb = getFirebaseFirestore();
        if (Object.keys(allProducts).length === 0) {
             const snapshot = await getDocs(collection(fsDb, 'products'));
             snapshot.docs.forEach(d => { allProducts[d.id] = { id: d.id, ...d.data() }; });
        }
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Render empty state
    renderSelectedItems();
    
    // Setup Search Listener
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = handleProductSearch;
    }
}

function closeCreateModal() {
    const modal = document.getElementById('create-order-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    
    // Reset form
    const form = document.getElementById('create-order-form');
    if (form) form.reset();
    
    // Clear selected items
    selectedItems = [];
    renderSelectedItems();
    
    // Clear search
    const searchInput = document.getElementById('product-search');
    if (searchInput) searchInput.value = '';
    
    const searchResults = document.getElementById('product-search-results');
    if (searchResults) searchResults.classList.add('hidden');
}

/**
 * Handle Product Search
 */
function handleProductSearch(e) {
    const term = e.target.value.toLowerCase();
    const resultsContainer = document.getElementById('product-search-results');
    
    if (!term || term.length < 1) {
        resultsContainer.classList.add('hidden');
        return;
    }

    const matches = Object.entries(allProducts).filter(([id, p]) => 
        (p.name && p.name.toLowerCase().includes(term)) || 
        (p.brand && p.brand.toLowerCase().includes(term))
    ).slice(0, 5); // Limit 5

    if (matches.length > 0) {
        resultsContainer.innerHTML = matches.map(([id, p]) => {
            // Get product image safely
            let imgSrc = '';
            if (p.images && p.images.length > 0) {
                imgSrc = p.images[0];
            } else if (p.image) {
                imgSrc = p.image;
            } else if (p.colorImages) {
                const firstColor = Object.keys(p.colorImages)[0];
                if (firstColor && p.colorImages[firstColor].length > 0) {
                    imgSrc = p.colorImages[firstColor][0];
                }
            }
            
            return `
                <div class="p-3 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0"
                     onclick="window.ordersModule.addProductToOrder('${id}')">
                    <div class="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden flex items-center justify-center">
                        ${imgSrc ? `<img src="${imgSrc}" class="w-full h-full object-cover" alt="${p.name || ''}">` : 
                        `<span class="material-symbols-rounded text-slate-400 text-[20px]">image</span>`}
                    </div>
                    <div class="flex-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">${p.name || 'Sản phẩm'}</p>
                        <p class="text-xs text-slate-500">${formatCurrency(p.price || 0)}</p>
                    </div>
                    <button class="text-primary text-sm font-bold">Thêm</button>
                </div>
            `;
        }).join('');
        resultsContainer.classList.remove('hidden');
    } else {
        resultsContainer.innerHTML = '<div class="p-3 text-sm text-slate-500 text-center">Không tìm thấy sản phẩm</div>';
        resultsContainer.classList.remove('hidden');
    }
}

/**
 * Add Product To New Order
 */
function addProductToOrder(productId) {
    const product = allProducts[productId];
    if (!product) return;

    const existing = selectedItems.find(i => i.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        // Get the first image from images array or colorImages, fallback to empty string
        let productImage = '';
        if (product.images && product.images.length > 0) {
            productImage = product.images[0];
        } else if (product.image) {
            productImage = product.image;
        } else if (product.colorImages) {
            const firstColor = Object.keys(product.colorImages)[0];
            if (firstColor && product.colorImages[firstColor].length > 0) {
                productImage = product.colorImages[firstColor][0];
            }
        }
        
        selectedItems.push({
            id: productId,
            name: product.name || 'Sản phẩm',
            price: product.price || 0,
            image: productImage,
            quantity: 1,
            color: product.colors && product.colors.length > 0 ? product.colors[0] : '',
            size: product.sizes && product.sizes.length > 0 ? product.sizes[0].toString() : ''
        });
    }

    document.getElementById('product-search').value = '';
    document.getElementById('product-search-results').classList.add('hidden');
    renderSelectedItems();
}

/**
 * Remove Product From New Order
 */
function removeProductFromOrder(index) {
    selectedItems.splice(index, 1);
    renderSelectedItems();
}

/**
 * Update Quantity
 */
function updateItemQuantity(index, change) {
    const item = selectedItems[index];
    const newQty = item.quantity + change;
    if (newQty > 0) {
        item.quantity = newQty;
        renderSelectedItems();
    }
}

/**
 * Render Selected Items List
 */
function renderSelectedItems() {
    const container = document.getElementById('selected-products-list');
    const emptyState = document.getElementById('empty-products-state');
    const subtotalEl = document.getElementById('new-order-subtotal');
    const taxEl = document.getElementById('new-order-tax');
    const totalEl = document.getElementById('new-order-total');
    const itemsCountEl = document.getElementById('new-order-items-count');
    
    if (selectedItems.length === 0) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        container.querySelectorAll('.product-item').forEach(el => el.remove());
        
        if (subtotalEl) subtotalEl.textContent = '0đ';
        if (taxEl) taxEl.textContent = '0đ';
        if (totalEl) totalEl.textContent = '0đ';
        if (itemsCountEl) itemsCountEl.textContent = '0';
        return;
    }

    // Hide empty state
    if (emptyState) {
        emptyState.style.display = 'none';
    }

    // Calculate totals
    let subtotal = 0;
    const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // Render items
    const itemsHTML = selectedItems.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        return `
            <div class="product-item p-4 flex items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                <div class="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                    ${item.image ? `<img src="${item.image}" class="w-full h-full object-cover" alt="${item.name}">` : 
                    `<div class="w-full h-full flex items-center justify-center text-slate-400">
                        <span class="material-symbols-rounded">image</span>
                    </div>`}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${item.name}</p>
                    <p class="text-xs text-slate-500 mt-0.5">${formatCurrency(item.price)} × ${item.quantity}</p>
                    ${item.color ? `<p class="text-xs text-slate-400 mt-0.5">Màu: ${item.color}</p>` : ''}
                    ${item.size ? `<p class="text-xs text-slate-400">Size: ${item.size}</p>` : ''}
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="window.ordersModule.updateItemQuantity(${index}, -1)" 
                        class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all active:scale-95">
                        <span class="material-symbols-rounded text-[16px]">remove</span>
                    </button>
                    <span class="text-sm font-bold w-8 text-center text-slate-900 dark:text-white">${item.quantity}</span>
                    <button onclick="window.ordersModule.updateItemQuantity(${index}, 1)" 
                        class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all active:scale-95">
                        <span class="material-symbols-rounded text-[16px]">add</span>
                    </button>
                </div>
                <div class="text-right flex-shrink-0 w-24">
                    <p class="text-sm font-bold text-primary">${formatCurrency(itemTotal)}</p>
                    <button onclick="window.ordersModule.removeProductFromOrder(${index})" 
                        class="text-xs text-rose-500 hover:text-rose-600 hover:underline mt-1 transition-colors">
                        Xóa
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Remove old items and insert new ones
    container.querySelectorAll('.product-item').forEach(el => el.remove());
    container.insertAdjacentHTML('beforeend', itemsHTML);

    // Calculate tax and total
    const tax = Math.round(subtotal * 0.08); // 8% tax
    const total = subtotal + tax;

    // Update summary
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (taxEl) taxEl.textContent = formatCurrency(tax);
    if (totalEl) totalEl.textContent = formatCurrency(total);
    if (itemsCountEl) itemsCountEl.textContent = totalItems;
}

/**
 * Save New Order
 */
async function saveOrder() {
    // Get all form values with new IDs
    const fullname = document.getElementById('new-order-fullname')?.value.trim();
    const email = document.getElementById('new-order-email')?.value.trim();
    const phone = document.getElementById('new-order-phone')?.value.trim();
    const address = document.getElementById('new-order-address')?.value.trim();
    const city = document.getElementById('new-order-city')?.value.trim();
    const payment = document.getElementById('new-order-payment')?.value;
    const status = document.getElementById('new-order-status')?.value || 'pending';

    // Validation
    if (!fullname || !email || !phone || !address || !city) {
        if (window.showToast) {
            window.showToast('Vui lòng điền đầy đủ thông tin khách hàng!', 'warning');
        }
        return;
    }

    if (selectedItems.length === 0) {
        if (window.showToast) {
            window.showToast('Vui lòng chọn ít nhất một sản phẩm!', 'warning');
        }
        return;
    }
    
    // addDoc and collection are already imported at top of file
    // Get current user ID
    const { getFirebaseAuth } = await import('../firebase-config.js');
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;

    // Calculate totals
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.round(subtotal * 0.08); // 8% tax
    const total = subtotal + tax;
    
    // Clean items data - ensure no undefined values
    const cleanedItems = selectedItems.map(item => ({
        id: item.id || '',
        name: item.name || 'Sản phẩm',
        price: item.price || 0,
        quantity: item.quantity || 1,
        image: item.image || '',
        color: item.color || '',
        size: item.size || ''
    }));
    
    const newOrder = {
        customerInfo: {
            fullname: fullname,
            email: email,
            phone: phone,
            address: address,
            city: city
        },
        paymentMethod: payment,
        status: status,
        items: cleanedItems,
        subtotal: subtotal,
        tax: tax,
        total: total,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        orderId: 'ORD-' + Date.now(),
        userEmail: email,
        userId: currentUser ? currentUser.uid : '' // Add userId for Firebase rules
    };

    try {
        await addDoc(collection(db, 'orders'), newOrder);
        if (window.showToast) {
            window.showToast('Tạo đơn hàng thành công!', 'success');
        }
        closeCreateModal();
        reload(); // Refresh table
    } catch (error) {
        console.error('Lỗi tạo đơn:', error);
        if (window.showToast) {
            window.showToast('Lỗi tạo đơn hàng: ' + error.message, 'error');
        }
    }
}

// Export module
window.ordersModule = {
    init,
    reload,
    updateStatus,
    showDetails,
    closeDetails,
    closeAllDropdowns,
    setFilter,
    setSort,
    setPage,
    exportCSV,
    createOrder,
    closeCreateModal,
    addProductToOrder,
    removeProductFromOrder,
    updateItemQuantity,
    saveOrder
};

init();
