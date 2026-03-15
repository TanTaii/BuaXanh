/**
 * X-Sneaker Admin - Promotions Management Module
 * Manages promotional codes, discounts, and campaigns
 */

import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const database = getFirebaseFirestore();
const promotionsCol = collection(database, 'promotions');

// Module state
const state = {
    promotions: [],
    filteredPromotions: [],
    searchQuery: '',
    statusFilter: 'all'
};

/**
 * Initialize promotions module
 */
export async function init() {
    console.log('Initializing Promotions Management Module...');
    
    setupRealtimeListeners();
    setupEventListeners();
    
    await fetchPromotions();
    updateStats();
    renderPromotionsTable();
}

/**
 * Setup Firebase realtime listeners
 */
function setupRealtimeListeners() {
    onSnapshot(promotionsCol, (snapshot) => {
        state.promotions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters();
        updateStats();
        renderPromotionsTable();
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('search-promotions');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            applyFilters();
            renderPromotionsTable();
        });
    }
}

/**
 * Fetch all promotions from Firebase
 */
async function fetchPromotions() {
    try {
        const snapshot = await getDocs(promotionsCol);
        state.promotions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters();
    } catch (error) {
        console.error('Error fetching promotions:', error);
        showNotification('Lỗi khi tải danh sách khuyến mãi', 'error');
    }
}

/**
 * Apply search filters
 */
function applyFilters() {
    const now = Date.now();
    
    state.filteredPromotions = state.promotions.filter(promo => {
        const matchesSearch = !state.searchQuery || 
            promo.code?.toLowerCase().includes(state.searchQuery) ||
            promo.name?.toLowerCase().includes(state.searchQuery) ||
            promo.description?.toLowerCase().includes(state.searchQuery);
        
        let matchesStatus = true;
        if (state.statusFilter === 'active') {
            matchesStatus = promo.active && 
                (!promo.endDate || promo.endDate > now) && 
                (!promo.usageLimit || promo.usageCount < promo.usageLimit);
        } else if (state.statusFilter === 'expired') {
            matchesStatus = promo.endDate && promo.endDate < now;
        } else if (state.statusFilter === 'inactive') {
            matchesStatus = !promo.active;
        }
        
        return matchesSearch && matchesStatus;
    });
}

/**
 * Update statistics
 */
function updateStats() {
    const now = Date.now();
    const total = state.promotions.length;
    const active = state.promotions.filter(p => 
        p.active && (!p.endDate || p.endDate > now) && p.usageCount < (p.maxUses || Infinity)
    ).length;
    const expired = state.promotions.filter(p => p.endDate && p.endDate < now).length;
    const used = state.promotions.reduce((sum, p) => sum + (p.usageCount || 0), 0);
    
    // Safely update stats - check if elements exist first
    const totalEl = document.getElementById('stat-promotions-total');
    const activeEl = document.getElementById('stat-promotions-active');
    const expiredEl = document.getElementById('stat-promotions-expired');
    const usedEl = document.getElementById('stat-promotions-used');
    
    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (expiredEl) expiredEl.textContent = expired;
    if (usedEl) usedEl.textContent = used;
}

/**
 * Render promotions table
 */
function renderPromotionsTable() {
    const tbody = document.getElementById('promotions-table-body');
    if (!tbody) return;
    
    if (state.filteredPromotions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-12 text-center text-slate-500">
                    <span class="material-symbols-rounded text-6xl text-slate-300 mb-2">local_offer</span>
                    <p class="font-medium">Chưa có mã khuyến mãi nào</p>
                    <button onclick="window.promotionsModule.openModal()" class="mt-4 text-primary hover:underline text-sm font-bold">
                        Tạo mã khuyến mãi đầu tiên
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.filteredPromotions.map(promo => {
        const now = Date.now();
        const isExpired = promo.endDate && promo.endDate < now;
        const isMaxedOut = promo.usageLimit && promo.usageCount >= promo.usageLimit;
        const isActive = promo.active && !isExpired && !isMaxedOut;
        
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="font-bold text-sm text-slate-900">${promo.code || 'N/A'}</div>
                    <div class="text-xs text-slate-500">${promo.name || ''}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-md text-xs font-bold ${
                        promo.type === 'percentage' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }">
                        ${promo.type === 'percentage' ? 'Phần trăm' : 'Cố định'}
                    </span>
                </td>
                <td class="px-6 py-4 font-semibold text-sm">
                    ${promo.type === 'percentage' ? `${promo.value}%` : formatPrice(promo.value)}
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">
                    ${promo.usageLimit || '∞'}
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-slate-900">${promo.usageCount || 0}</span>
                        ${promo.usageLimit ? `
                            <div class="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden max-w-[60px]">
                                <div class="h-full bg-primary rounded-full" style="width: ${Math.min(100, (promo.usageCount || 0) / promo.usageLimit * 100)}%"></div>
                            </div>
                        ` : ''}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${
                        isActive ? 'bg-green-100 text-green-700' : 
                        isExpired ? 'bg-red-100 text-red-700' : 
                        isMaxedOut ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                    }">
                        ${isActive ? 'Hoạt động' : isExpired ? 'Hết hạn' : isMaxedOut ? 'Hết lượt' : 'Tắt'}
                    </span>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">
                    ${promo.endDate ? formatDate(promo.endDate) : 'Vô thời hạn'}
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="window.promotionsModule.openModal('${promo.id}')" class="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Chỉnh sửa">
                            <span class="material-symbols-rounded text-[20px] text-slate-600">edit</span>
                        </button>
                        <button onclick="window.promotionsModule.toggleActive('${promo.id}')" class="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="${isActive ? 'Tắt' : 'Bật'}">
                            <span class="material-symbols-rounded text-[20px] ${isActive ? 'text-green-600' : 'text-gray-400'}">
                                ${isActive ? 'toggle_on' : 'toggle_off'}
                            </span>
                        </button>
                        <button onclick="window.promotionsModule.duplicatePromotion('${promo.id}')" class="p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Nhân bản">
                            <span class="material-symbols-rounded text-[20px] text-blue-600">content_copy</span>
                        </button>
                        <button onclick="window.promotionsModule.deletePromotion('${promo.id}')" class="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                            <span class="material-symbols-rounded text-[20px] text-red-600">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Open modal to create/edit promotion
 */
function openModal(promoId = null) {
    const isEdit = !!promoId;
    const promo = isEdit ? state.promotions.find(p => p.id === promoId) : null;
    
    const modalHTML = `
        <div id="promotion-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                        <h3 class="text-xl font-extrabold text-slate-900">${isEdit ? 'Chỉnh sửa mã khuyến mãi' : 'Tạo mã khuyến mãi mới'}</h3>
                        <p class="text-sm text-slate-500 mt-1">Điền thông tin chi tiết cho mã khuyến mãi</p>
                    </div>
                    <button onclick="window.promotionsModule.closeModal()" class="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <span class="material-symbols-rounded text-slate-600">close</span>
                    </button>
                </div>

                <!-- Form -->
                <form id="promotion-form" class="p-6 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Promotion Code -->
                        <div class="md:col-span-2">
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Mã khuyến mãi <span class="text-red-500">*</span>
                            </label>
                            <input type="text" id="promo-code" value="${promo?.code || ''}" 
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary font-mono text-sm uppercase" 
                                placeholder="VD: SALE2026" required>
                            <p class="mt-1 text-xs text-slate-500">Mã duy nhất, chữ in hoa, không có khoảng trắng</p>
                        </div>

                        <!-- Promotion Name -->
                        <div class="md:col-span-2">
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Tên khuyến mãi <span class="text-red-500">*</span>
                            </label>
                            <input type="text" id="promo-name" value="${promo?.name || ''}"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                                placeholder="VD: Sale mừng năm mới 2026" required>
                        </div>

                        <!-- Description -->
                        <div class="md:col-span-2">
                            <label class="block text-sm font-bold text-slate-700 mb-2">Mô tả</label>
                            <textarea id="promo-description" rows="3" 
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="Mô tả chi tiết về khuyến mãi...">${promo?.description || ''}</textarea>
                        </div>

                        <!-- Discount Type -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Loại giảm giá <span class="text-red-500">*</span>
                            </label>
                            <select id="promo-type" 
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                                <option value="percentage" ${promo?.type === 'percentage' ? 'selected' : ''}>Phần trăm (%)</option>
                                <option value="fixed" ${promo?.type === 'fixed' ? 'selected' : ''}>Số tiền cố định (đ)</option>
                            </select>
                        </div>

                        <!-- Discount Value -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Giá trị giảm <span class="text-red-500">*</span>
                            </label>
                            <input type="number" id="promo-value" value="${promo?.value || ''}" min="0"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="VD: 20 hoặc 100000" required>
                            <p class="mt-1 text-xs text-slate-500" id="value-hint">
                                ${promo?.type === 'percentage' ? 'Nhập giá trị từ 1-100' : 'Nhập số tiền giảm'}
                            </p>
                        </div>

                        <!-- Min Order -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Đơn hàng tối thiểu (đ)
                            </label>
                            <input type="number" id="promo-min-order" value="${promo?.minOrder || ''}" min="0"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="VD: 500000">
                            <p class="mt-1 text-xs text-slate-500">Giá trị đơn hàng tối thiểu để áp dụng</p>
                        </div>

                        <!-- Max Discount -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Giảm tối đa (đ)
                            </label>
                            <input type="number" id="promo-max-discount" value="${promo?.maxDiscount || ''}" min="0"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="VD: 500000">
                            <p class="mt-1 text-xs text-slate-500">Số tiền giảm tối đa (dành cho % giảm)</p>
                        </div>

                        <!-- Usage Limit -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Số lượng mã
                            </label>
                            <input type="number" id="promo-usage-limit" value="${promo?.usageLimit || ''}" min="0"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="VD: 1000 (để trống = không giới hạn)">
                            <p class="mt-1 text-xs text-slate-500">Tổng số lần sử dụng tối đa</p>
                        </div>

                        <!-- Start Date -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Ngày bắt đầu <span class="text-red-500">*</span>
                            </label>
                            <input type="datetime-local" id="promo-start-date" 
                                value="${promo?.startDate ? formatDateTimeLocal(promo.startDate) : ''}"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                                required>
                        </div>

                        <!-- End Date -->
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Ngày kết thúc
                            </label>
                            <input type="datetime-local" id="promo-end-date"
                                value="${promo?.endDate ? formatDateTimeLocal(promo.endDate) : ''}"
                                class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary">
                            <p class="mt-1 text-xs text-slate-500">Để trống = vô thời hạn</p>
                        </div>

                        <!-- Active Status -->
                        <div class="md:col-span-2">
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" id="promo-active" ${promo?.active !== false ? 'checked' : ''}
                                    class="w-5 h-5 text-primary border-slate-300 rounded focus:ring-2 focus:ring-primary/50">
                                <span class="text-sm font-bold text-slate-700">Kích hoạt mã khuyến mãi ngay</span>
                            </label>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
                        <button type="button" onclick="window.promotionsModule.closeModal()" 
                            class="px-6 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-bold transition-colors">
                            Hủy
                        </button>
                        <button type="submit" 
                            class="px-6 py-2.5 bg-primary hover:bg-primary-600 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg active:scale-95 transition-all">
                            <span class="flex items-center gap-2">
                                <span class="material-symbols-rounded text-[20px]">${isEdit ? 'edit' : 'add'}</span>
                                ${isEdit ? 'Cập nhật' : 'Tạo mã'}
                            </span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Add modal to body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    // Add event listeners
    setupModalEventListeners(promoId);
}

/**
 * Setup modal event listeners
 */
function setupModalEventListeners(promoId) {
    const form = document.getElementById('promotion-form');
    const typeSelect = document.getElementById('promo-type');
    const codeInput = document.getElementById('promo-code');

    // Type change handler
    typeSelect.addEventListener('change', (e) => {
        const hint = document.getElementById('value-hint');
        if (e.target.value === 'percentage') {
            hint.textContent = 'Nhập giá trị từ 1-100';
        } else {
            hint.textContent = 'Nhập số tiền giảm';
        }
    });

    // Auto uppercase code
    codeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/\s/g, '');
    });

    // Form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await savePromotion(promoId);
    });

    // Close on backdrop click
    const modal = document.getElementById('promotion-modal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

/**
 * Close modal
 */
function closeModal() {
    const modal = document.getElementById('promotion-modal');
    if (modal) {
        modal.parentElement.remove();
    }
}

/**
 * Save promotion
 */
async function savePromotion(promoId) {
    try {
        const code = document.getElementById('promo-code').value.trim().toUpperCase();
        const name = document.getElementById('promo-name').value.trim();
        const description = document.getElementById('promo-description').value.trim();
        const type = document.getElementById('promo-type').value;
        const value = parseFloat(document.getElementById('promo-value').value);
        const minOrder = parseFloat(document.getElementById('promo-min-order').value) || 0;
        const maxDiscount = parseFloat(document.getElementById('promo-max-discount').value) || 0;
        const usageLimit = parseInt(document.getElementById('promo-usage-limit').value) || null;
        const startDate = new Date(document.getElementById('promo-start-date').value).getTime();
        const endDate = document.getElementById('promo-end-date').value 
            ? new Date(document.getElementById('promo-end-date').value).getTime() 
            : null;
        const active = document.getElementById('promo-active').checked;

        // Validation
        if (!code || !name || !value || !startDate) {
            showNotification('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
            return;
        }

        if (type === 'percentage' && (value < 1 || value > 100)) {
            showNotification('Giá trị phần trăm phải từ 1-100', 'error');
            return;
        }

        if (type === 'fixed' && value < 1000) {
            showNotification('Giá trị giảm cố định phải ít nhất 1,000đ', 'error');
            return;
        }

        // Check duplicate code
        const existingPromo = state.promotions.find(p => 
            p.code === code && (!promoId || p.id !== promoId)
        );
        if (existingPromo) {
            showNotification('Mã khuyến mãi đã tồn tại', 'error');
            return;
        }

        const promotionData = {
            code,
            name,
            description,
            type,
            value,
            minOrder,
            maxDiscount,
            usageLimit,
            startDate,
            endDate,
            active,
            usageCount: promoId ? state.promotions.find(p => p.id === promoId)?.usageCount || 0 : 0
        };

        if (promoId) {
            await updateDoc(doc(promotionsCol, promoId), promotionData);
            showNotification('Đã cập nhật mã khuyến mãi', 'success');
        } else {
            await addDoc(promotionsCol, promotionData);
            showNotification('Đã tạo mã khuyến mãi mới', 'success');
        }

        closeModal();
    } catch (error) {
        console.error('Error saving promotion:', error);
        showNotification('Lỗi khi lưu mã khuyến mãi', 'error');
    }
}

/**
 * Format datetime for input
 */
function formatDateTimeLocal(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Toggle promotion active status
 */
async function toggleActive(promoId) {
    try {
        const promo = state.promotions.find(p => p.id === promoId);
        if (!promo) return;
        await updateDoc(doc(promotionsCol, promoId), { active: !promo.active });
        showNotification(`Đã ${!promo.active ? 'bật' : 'tắt'} mã khuyến mãi`, 'success');
    } catch (error) {
        console.error('Error toggling promotion:', error);
        showNotification('Lỗi khi cập nhật trạng thái', 'error');
    }
}

/**
 * Delete promotion
 */
async function deletePromotion(promoId) {
    const confirmed = await window.showConfirm(
        'Bạn có chắc chắn muốn xóa mã khuyến mãi này?',
        {
            title: 'Xác nhận xóa',
            confirmText: 'Xóa',
            type: 'danger'
        }
    );
    
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(promotionsCol, promoId));
        showNotification('Đã xóa mã khuyến mãi', 'success');
    } catch (error) {
        console.error('Error deleting promotion:', error);
        showNotification('Lỗi khi xóa mã khuyến mãi', 'error');
    }
}

/**
 * Duplicate promotion
 */
async function duplicatePromotion(promoId) {
    try {
        const promo = state.promotions.find(p => p.id === promoId);
        if (!promo) return;

        const newCode = generateUniqueCode(promo.code);
        const promotionData = {
            ...promo,
            code: newCode,
            name: `${promo.name} (Copy)`,
            usageCount: 0,
            active: false
        };

        delete promotionData.id;
        await addDoc(promotionsCol, promotionData);
        showNotification('Đã nhân bản mã khuyến mãi', 'success');
    } catch (error) {
        console.error('Error duplicating promotion:', error);
        showNotification('Lỗi khi nhân bản mã khuyến mãi', 'error');
    }
}

/**
 * Generate unique code
 */
function generateUniqueCode(baseCode) {
    let counter = 1;
    let newCode = `${baseCode}_COPY`;
    
    while (state.promotions.some(p => p.code === newCode)) {
        counter++;
        newCode = `${baseCode}_COPY${counter}`;
    }
    
    return newCode;
}

/**
 * Set status filter
 */
function setFilter(filter) {
    state.statusFilter = filter;
    applyFilters();
    renderPromotionsTable();
    updateFilterButtons();
}

/**
 * Update filter buttons UI
 */
function updateFilterButtons() {
    const buttons = {
        'all': 'filter-btn-all-promotions',
        'active': 'filter-btn-active-promotions',
        'expired': 'filter-btn-expired-promotions',
        'inactive': 'filter-btn-inactive-promotions'
    };

    Object.entries(buttons).forEach(([filter, btnId]) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        
        if (filter === state.statusFilter) {
            btn.classList.add('bg-white', 'text-slate-900', 'shadow-sm', 'font-bold');
            btn.classList.remove('text-slate-600', 'font-medium');
        } else {
            btn.classList.remove('bg-white', 'text-slate-900', 'shadow-sm', 'font-bold');
            btn.classList.add('text-slate-600', 'font-medium');
        }
    });
}

/**
 * Export promotions to CSV
 */
function exportPromotions() {
    try {
        const headers = ['Mã', 'Tên', 'Mô tả', 'Loại', 'Giá trị', 'Đơn tối thiểu', 'Giảm tối đa', 'Số lượng', 'Đã dùng', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc'];
        const rows = state.filteredPromotions.map(promo => {
            const now = Date.now();
            const isExpired = promo.endDate && promo.endDate < now;
            const isMaxedOut = promo.usageLimit && promo.usageCount >= promo.usageLimit;
            const isActive = promo.active && !isExpired && !isMaxedOut;
            
            return [
                promo.code || '',
                promo.name || '',
                promo.description || '',
                promo.type === 'percentage' ? 'Phần trăm' : 'Cố định',
                promo.type === 'percentage' ? `${promo.value}%` : promo.value,
                promo.minOrder || 0,
                promo.maxDiscount || 0,
                promo.usageLimit || 'Không giới hạn',
                promo.usageCount || 0,
                isActive ? 'Hoạt động' : isExpired ? 'Hết hạn' : isMaxedOut ? 'Hết lượt' : 'Đã tắt',
                promo.startDate ? formatDate(promo.startDate) : '',
                promo.endDate ? formatDate(promo.endDate) : 'Vô thời hạn'
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `promotions_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Đã xuất dữ liệu thành công', 'success');
    } catch (error) {
        console.error('Error exporting promotions:', error);
        showNotification('Lỗi khi xuất dữ liệu', 'error');
    }
}

/**
 * Format price
 */
function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(price);
}

/**
 * Format date
 */
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    if (window.showToast) {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Make module functions available globally
window.promotionsModule = {
    init,
    openModal,
    closeModal,
    toggleActive,
    deletePromotion,
    duplicatePromotion,
    setFilter,
    exportPromotions
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
