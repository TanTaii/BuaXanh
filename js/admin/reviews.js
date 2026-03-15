/**
 * X-Sneaker Admin - Reviews Management Module
 * Manages product reviews, ratings, and moderation
 */

import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, doc, getDocs, updateDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const database = getFirebaseFirestore();

// Module state
const state = {
    reviews: [],
    filteredReviews: [],
    products: {},
    users: {},
    currentFilter: 'all',
    searchQuery: ''
};

/**
 * Initialize reviews module
 */
export async function init() {
    console.log('Initializing Reviews Management Module...');
    
    setupRealtimeListeners();
    setupEventListeners();
    
    await Promise.all([
        fetchReviews(),
        fetchProducts(),
        fetchUsers()
    ]);
    
    updateStats();
    renderReviewsTable();
}

/**
 * Setup Firebase realtime listeners
 */
function setupRealtimeListeners() {
    onSnapshot(collection(database, 'reviews'), (snapshot) => {
        state.reviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters();
        updateStats();
        renderReviewsTable();
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('search-reviews');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            applyFilters();
            renderReviewsTable();
        });
    }
}

/**
 * Fetch all reviews from Firebase
 */
async function fetchReviews() {
    try {
        const snapshot = await getDocs(collection(database, 'reviews'));
        state.reviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters();
    } catch (error) {
        console.error('Error fetching reviews:', error);
    }
}

/**
 * Fetch products for reference
 */
async function fetchProducts() {
    try {
        const snapshot = await getDocs(collection(database, 'products'));
        state.products = {};
        snapshot.docs.forEach(d => { state.products[d.id] = d.data(); });
    } catch (error) {
        console.error('Error fetching products:', error);
    }
}

/**
 * Fetch users for reference
 */
async function fetchUsers() {
    try {
        const snapshot = await getDocs(collection(database, 'users'));
        state.users = {};
        snapshot.docs.forEach(d => { state.users[d.id] = d.data(); });
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

/**
 * Apply filters
 */
function applyFilters() {
    state.filteredReviews = state.reviews.filter(review => {
        const matchesFilter = state.currentFilter === 'all' || review.status === state.currentFilter;
        
        const matchesSearch = !state.searchQuery || 
            review.comment?.toLowerCase().includes(state.searchQuery) ||
            review.userName?.toLowerCase().includes(state.searchQuery) ||
            state.products[review.productId]?.name?.toLowerCase().includes(state.searchQuery);
        
        return matchesFilter && matchesSearch;
    });
}

/**
 * Set filter
 */
function setFilter(filter) {
    state.currentFilter = filter;
    applyFilters();
    renderReviewsTable();
    
    // Update filter buttons UI
    const filters = ['all', 'pending', 'approved', 'rejected'];
    filters.forEach(f => {
        const btn = document.getElementById(`filter-btn-${f}-reviews`);
        if (btn) {
            if (f === filter) {
                btn.className = 'px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-lg shadow-sm transition-all';
            } else {
                btn.className = 'px-4 py-2 text-slate-600 hover:text-slate-900 text-sm font-medium rounded-lg transition-all';
            }
        }
    });
}

/**
 * Update statistics
 */
function updateStats() {
    const total = state.reviews.length;
    const pending = state.reviews.filter(r => r.status === 'pending' || !r.status).length;
    const approved = state.reviews.filter(r => r.status === 'approved').length;
    
    // Calculate average rating
    const totalRating = state.reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const average = total > 0 ? (totalRating / total).toFixed(1) : 0;
    
    // Safely update stats - check if elements exist first
    const totalEl = document.getElementById('stat-reviews-total');
    const averageEl = document.getElementById('stat-reviews-average');
    const pendingEl = document.getElementById('stat-reviews-pending');
    const approvedEl = document.getElementById('stat-reviews-approved');
    
    if (totalEl) totalEl.textContent = total;
    if (averageEl) averageEl.textContent = average;
    if (pendingEl) pendingEl.textContent = pending;
    if (approvedEl) approvedEl.textContent = approved;
}

/**
 * Render reviews table
 */
function renderReviewsTable() {
    const tbody = document.getElementById('reviews-table-body');
    if (!tbody) return;
    
    if (state.filteredReviews.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-slate-500">
                    <span class="material-symbols-rounded text-6xl text-slate-300 mb-2">star</span>
                    <p class="font-medium">Không tìm thấy đánh giá nào</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.filteredReviews.map(review => {
        const product = state.products[review.productId] || {};
        const status = review.status || 'pending';
        
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                            <img src="${product.images?.[0] || product.image || 'image/coming_soon.png'}" alt="${product.name}" class="w-full h-full object-cover">
                        </div>
                        <div>
                            <div class="font-semibold text-sm text-slate-900">${product.name || 'Sản phẩm'}</div>
                            <div class="text-xs text-slate-500">${review.productId}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="font-medium text-sm text-slate-900">${review.userName || 'Ẩn danh'}</div>
                    <div class="text-xs text-slate-500">${review.userEmail || ''}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-1">
                        ${Array.from({length: 5}, (_, i) => `
                            <span class="material-symbols-rounded text-[16px] ${i < (review.rating || 0) ? 'text-yellow-500' : 'text-gray-300'}">
                                ${i < (review.rating || 0) ? 'star' : 'star_border'}
                            </span>
                        `).join('')}
                    </div>
                    <div class="text-xs text-slate-600 mt-1 font-bold">${review.rating || 0}/5</div>
                </td>
                <td class="px-6 py-4 max-w-xs">
                    <div class="text-sm text-slate-600 line-clamp-2">${review.comment || 'Không có nhận xét'}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${
                        status === 'approved' ? 'bg-green-100 text-green-700' :
                        status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                    }">
                        ${status === 'approved' ? 'Đã duyệt' : status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                    </span>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">
                    ${formatDate(review.timestamp)}
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="window.reviewsModule.viewReview('${review.productId}', '${review.id}')" class="p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Xem chi tiết">
                            <span class="material-symbols-rounded text-[20px] text-blue-600">visibility</span>
                        </button>
                        <button onclick="window.reviewsModule.deleteReview('${review.productId}', '${review.id}')" class="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                            <span class="material-symbols-rounded text-[20px] text-red-600">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Approve review
 */
async function approveReview(productId, reviewId) {
    try {
        await updateDoc(doc(database, 'reviews', reviewId), {
            status: 'approved', moderatedAt: Date.now()
        });
        showNotification('Đã duyệt đánh giá', 'success');
    } catch (error) {
        console.error('Error approving review:', error);
        showNotification('Lỗi khi duyệt đánh giá', 'error');
    }
}

/**
 * Reject review
 */
async function rejectReview(productId, reviewId) {
    try {
        await updateDoc(doc(database, 'reviews', reviewId), {
            status: 'rejected', moderatedAt: Date.now()
        });
        showNotification('Đã từ chối đánh giá', 'success');
    } catch (error) {
        console.error('Error rejecting review:', error);
        showNotification('Lỗi khi từ chối đánh giá', 'error');
    }
}

/**
 * Delete review
 */
async function deleteReview(productId, reviewId) {
    const confirmed = await window.showConfirm(
        'Bạn có chắc chắn muốn xóa đánh giá này?',
        {
            title: 'Xác nhận xóa',
            confirmText: 'Xóa',
            type: 'danger'
        }
    );
    
    if (!confirmed) return;
    
    try {
        await deleteDoc(doc(database, 'reviews', reviewId));
        showNotification('Đã xóa đánh giá', 'success');
    } catch (error) {
        console.error('Error deleting review:', error);
        showNotification('Lỗi khi xóa đánh giá', 'error');
    }
}

/**
 * View review details
 */
function viewReview(productId, reviewId) {
    const review = state.reviews.find(r => r.productId === productId && r.id === reviewId);
    if (!review) {
        showNotification('Không tìm thấy đánh giá', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-200">
                <div class="flex items-center justify-between">
                    <h3 class="text-xl font-semibold text-gray-900">Chi tiết đánh giá</h3>
                    <button onclick="this.closest('.fixed').remove()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <span class="material-symbols-rounded text-gray-500">close</span>
                    </button>
                </div>
            </div>
            
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Sản phẩm</label>
                    <p class="text-gray-900">${review.productName || 'N/A'}</p>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Người đánh giá</label>
                        <p class="text-gray-900">${review.userName || 'N/A'}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <p class="text-gray-900">${review.userEmail || 'N/A'}</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Đánh giá</label>
                        <div class="flex items-center gap-1">
                            ${[...Array(5)].map((_, i) => `
                                <span class="material-symbols-rounded text-[20px] ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'}">star</span>
                            `).join('')}
                            <span class="ml-2 text-gray-900">${review.rating}/5</span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                        <span class="inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            review.status === 'approved' ? 'bg-green-100 text-green-800' :
                            review.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                        }">
                            ${review.status === 'approved' ? 'Đã duyệt' :
                              review.status === 'rejected' ? 'Đã từ chối' :
                              'Chờ duyệt'}
                        </span>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nhận xét</label>
                    <p class="text-gray-900 whitespace-pre-wrap">${review.comment || 'Không có nhận xét'}</p>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Thời gian</label>
                    <p class="text-gray-900">${formatDate(review.timestamp)}</p>
                </div>
                
                ${review.moderatedAt ? `
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Thời gian kiểm duyệt</label>
                        <p class="text-gray-900">${formatDate(review.moderatedAt)}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Đóng
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Format date
 */
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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
window.reviewsModule = {
    init,
    setFilter,
    viewReview,
    deleteReview
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
