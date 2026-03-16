// Product Reviews System for X-Sneaker
// Handles product reviews display, posting, and ratings with Firebase integration

import { getFirebaseDatabase } from '../firebase-config.js';
import { ref, get, push, set, update, serverTimestamp, query, orderByChild } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const database = getFirebaseDatabase();
const auth = getAuth();

let currentUser = null;
let currentProductId = null;
let allReviews = [];

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

function showToast(message, type = 'success') {
    // Ensure toast container exists
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed bottom-5 right-5 z-[100] flex flex-col gap-3';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'bg-black text-white px-6 py-4 rounded shadow-2xl flex items-center gap-3 transform transition-all duration-300 translate-x-[400px] opacity-0';
    
    // Icon and color based on type
    let icon = 'check_circle';
    let iconColor = 'text-green-500';
    
    if (type === 'error') {
        icon = 'error';
        iconColor = 'text-red-500';
    } else if (type === 'warning') {
        icon = 'warning';
        iconColor = 'text-amber-500';
    } else if (type === 'info') {
        icon = 'info';
        iconColor = 'text-blue-500';
    }
    
    toast.innerHTML = `
        <span class="material-symbols-outlined ${iconColor}">${icon}</span>
        <span class="font-bold text-sm">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.remove('translate-x-[400px]', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    }, 10);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-[400px]', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

function initAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            console.log('👤 User auth state:', user ? user.email : 'Not logged in');
            resolve(user);
        });
    });
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadReviews(productId) {
    try {
        const reviewsRef = ref(database, `reviews/${productId}`);
        const snapshot = await get(reviewsRef);
        
        if (snapshot.exists()) {
            const reviewsData = snapshot.val();
            allReviews = Object.keys(reviewsData)
                .map(key => ({ id: key, ...reviewsData[key] }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            console.log(`✅ Loaded ${allReviews.length} reviews`);
            return allReviews;
        }
        
        console.log('ℹ️ No reviews yet');
        return [];
    } catch (error) {
        console.error('❌ Error loading reviews:', error);
        return [];
    }
}

// ============================================================================
// RATING CALCULATIONS
// ============================================================================

function calculateRatingStats(reviews) {
    if (reviews.length === 0) {
        return {
            average: 0,
            total: 0,
            breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };
    }
    
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    
    reviews.forEach(review => {
        const rating = Math.round(review.rating || 0);
        if (rating >= 1 && rating <= 5) {
            breakdown[rating]++;
            sum += review.rating;
        }
    });
    
    return {
        average: reviews.length > 0 ? (sum / reviews.length).toFixed(1) : 0,
        total: reviews.length,
        breakdown
    };
}

// ============================================================================
// REVIEW POSTING
// ============================================================================

async function postReview(productId, reviewData) {
    if (!currentUser) {
        showToast('Vui lòng đăng nhập để đánh giá sản phẩm', 'warning');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
        return false;
    }
    
    if (!reviewData.rating || reviewData.rating < 1 || reviewData.rating > 5) {
        showToast('Vui lòng chọn số sao đánh giá', 'warning');
        return false;
    }
    
    if (!reviewData.comment || reviewData.comment.trim().length < 10) {
        showToast('Nội dung đánh giá phải có ít nhất 10 ký tự', 'warning');
        return false;
    }
    
    try {
        const reviewsRef = ref(database, `reviews/${productId}`);
        const newReviewRef = push(reviewsRef);
        
        const review = {
            productId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: reviewData.userName || currentUser.displayName || currentUser.email.split('@')[0],
            userAvatar: currentUser.photoURL || null,
            rating: parseFloat(reviewData.rating),
            comment: reviewData.comment.trim(),
            title: reviewData.title?.trim() || '',
            images: reviewData.images || [],
            verified: reviewData.verified || false,
            helpful: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        await set(newReviewRef, review);
        
        console.log('✅ Review posted successfully');
        return true;
    } catch (error) {
        console.error('❌ Error posting review:', error);
        showToast('Có lỗi xảy ra khi đăng đánh giá. Vui lòng thử lại.', 'error');
        return false;
    }
}

async function markReviewHelpful(productId, reviewId) {
    if (!currentUser) {
        showToast('Vui lòng đăng nhập để đánh dấu hữu ích', 'warning');
        return false;
    }
    
    try {
        const reviewRef = ref(database, `reviews/${productId}/${reviewId}`);
        const snapshot = await get(reviewRef);
        
        if (snapshot.exists()) {
            const review = snapshot.val();
            const currentHelpful = review.helpful || 0;
            
            await update(reviewRef, {
                helpful: currentHelpful + 1
            });
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error marking review helpful:', error);
        return false;
    }
}

// ============================================================================
// RENDERING - RATING SUMMARY
// ============================================================================

function renderRatingSummary(reviews) {
    const stats = calculateRatingStats(reviews);
    
    // Render average rating
    const avgRatingEl = document.getElementById('average-rating');
    if (avgRatingEl) {
        avgRatingEl.textContent = stats.average;
    }
    
    // Render stars
    const avgStarsEl = document.getElementById('average-stars');
    if (avgStarsEl) {
        avgStarsEl.innerHTML = renderStars(parseFloat(stats.average), 'text-xl');
    }
    
    // Render total count
    const totalReviewsEl = document.getElementById('total-reviews');
    if (totalReviewsEl) {
        totalReviewsEl.textContent = `${stats.total} đánh giá`;
    }
    
    // Render breakdown
    const breakdownEl = document.getElementById('rating-breakdown');
    if (breakdownEl) {
        const breakdownHTML = [5, 4, 3, 2, 1].map(star => {
            const count = stats.breakdown[star] || 0;
            const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
            
            return `
                <div class="flex items-center gap-3">
                    <span class="text-sm font-medium w-12">${star} sao</span>
                    <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div class="h-full bg-primary rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
                    </div>
                    <span class="text-sm font-medium w-8 text-right text-gray-500">${count}</span>
                </div>
            `;
        }).join('');
        
        breakdownEl.innerHTML = breakdownHTML;
    }
}

// ============================================================================
// RENDERING - REVIEWS LIST
// ============================================================================

async function renderReviews(reviews, sortBy = 'recent') {
    const container = document.getElementById('reviews-list');
    if (!container) return;
    
    // Sort reviews
    let sortedReviews = [...reviews];
    switch (sortBy) {
        case 'helpful':
            sortedReviews.sort((a, b) => (b.helpful || 0) - (a.helpful || 0));
            break;
        case 'rating-high':
            sortedReviews.sort((a, b) => b.rating - a.rating);
            break;
        case 'rating-low':
            sortedReviews.sort((a, b) => a.rating - b.rating);
            break;
        case 'recent':
        default:
            sortedReviews.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    
    if (sortedReviews.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <span class="material-symbols-outlined text-6xl text-gray-300 mb-4">rate_review</span>
                <h4 class="text-xl font-bold text-gray-500 mb-2">Chưa có đánh giá nào</h4>
                <p class="text-gray-400 mb-6">Hãy là người đầu tiên đánh giá sản phẩm này!</p>
                <button onclick="document.getElementById('write-review-btn').click()" class="inline-block bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors">
                    Viết Đánh Giá Ngay
                </button>
            </div>
        `;
        return;
    }
    
    const reviewsHTML = sortedReviews.map(review => renderReview(review)).join('');
    container.innerHTML = reviewsHTML;
    
    // Setup helpful buttons
    setupHelpfulButtons();
}

function renderReview(review) {
    const timeAgo = formatTimestamp(review.createdAt);
    const stars = renderStars(review.rating, 'text-base');
    
    return `
        <div class="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
            <!-- User Info & Rating -->
            <div class="flex items-start gap-4 mb-4">
                <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${review.userAvatar ? `
                        <img src="${review.userAvatar}" alt="${review.userName}" class="w-full h-full object-cover"/>
                    ` : `
                        <span class="text-primary font-bold text-lg">${review.userName.charAt(0).toUpperCase()}</span>
                    `}
                </div>
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-bold text-base">${escapeHtml(review.userName)}</h4>
                        ${review.verified ? `
                            <span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                Đã mua hàng
                            </span>
                        ` : ''}
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="flex items-center gap-1">${stars}</div>
                        <span class="text-xs text-gray-400">•</span>
                        <span class="text-xs text-gray-500">${timeAgo}</span>
                    </div>
                </div>
            </div>
            
            <!-- Review Title -->
            ${review.title ? `
                <h5 class="font-bold text-lg mb-2">${escapeHtml(review.title)}</h5>
            ` : ''}
            
            <!-- Review Comment -->
            <p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">${escapeHtml(review.comment)}</p>
            
            <!-- Review Images -->
            ${review.images && review.images.length > 0 ? `
                <div class="grid grid-cols-4 gap-2 mb-4">
                    ${review.images.slice(0, 4).map(img => `
                        <div class="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <img src="${img}" alt="Review image" class="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"/>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <!-- Actions -->
            <div class="flex items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button class="helpful-btn flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary transition-colors" data-product-id="${review.productId}" data-review-id="${review.id}">
                    <span class="material-symbols-outlined text-base">thumb_up</span>
                    <span>Hữu ích (${review.helpful || 0})</span>
                </button>
            </div>
        </div>
    `;
}

// ============================================================================
// RENDERING - REVIEW FORM
// ============================================================================

function renderReviewForm() {
    const container = document.getElementById('review-form-container');
    if (!container) return;
    
    if (!currentUser) {
        container.innerHTML = `
            <div class="text-center py-8">
                <span class="material-symbols-outlined text-5xl text-gray-300 mb-3">account_circle</span>
                <p class="text-gray-600 dark:text-gray-400 mb-4">Bạn cần đăng nhập để viết đánh giá</p>
                <a href="login.html" class="inline-block bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors">
                    Đăng Nhập
                </a>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <form id="review-form" class="space-y-6">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    ${currentUser.photoURL ? `
                        <img src="${currentUser.photoURL}" alt="${currentUser.displayName}" class="w-full h-full object-cover"/>
                    ` : `
                        <span class="text-primary font-bold text-lg">${(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}</span>
                    `}
                </div>
                <div>
                    <p class="font-bold">${currentUser.displayName || currentUser.email.split('@')[0]}</p>
                    <p class="text-xs text-gray-500">${currentUser.email}</p>
                </div>
            </div>
            
            <!-- Star Rating -->
            <div>
                <label class="block text-sm font-bold mb-3">Đánh giá của bạn *</label>
                <div class="flex items-center gap-2" id="star-rating-input">
                    ${[1, 2, 3, 4, 5].map(star => `
                        <button type="button" class="star-btn hover:scale-110 transition-transform" data-rating="${star}">
                            <span class="material-symbols-outlined text-3xl text-gray-300">star</span>
                        </button>
                    `).join('')}
                </div>
                <input type="hidden" id="rating-value" name="rating" value="0" required />
            </div>
            
            <!-- Review Title -->
            <div>
                <label for="review-title" class="block text-sm font-bold mb-2">Tiêu đề (Tùy chọn)</label>
                <input 
                    type="text" 
                    id="review-title" 
                    name="title" 
                    class="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-black focus:ring-primary focus:border-primary"
                    placeholder="Tóm tắt trải nghiệm của bạn..."
                    maxlength="100"
                />
            </div>
            
            <!-- Review Comment -->
            <div>
                <label for="review-comment" class="block text-sm font-bold mb-2">Nội dung đánh giá *</label>
                <textarea 
                    id="review-comment" 
                    name="comment" 
                    rows="5" 
                    class="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-black focus:ring-primary focus:border-primary resize-none"
                    placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm này... (Tối thiểu 10 ký tự)"
                    required
                    minlength="10"
                ></textarea>
                <p class="text-xs text-gray-500 mt-1">
                    <span id="comment-count">0</span>/500 ký tự
                </p>
            </div>
            
            <!-- Submit Buttons -->
            <div class="flex gap-3">
                <button 
                    type="submit" 
                    id="submit-review-btn"
                    class="flex-1 bg-primary text-white py-3 rounded-lg font-bold hover:bg-red-700 transition-colors">
                    Đăng Đánh Giá
                </button>
                <button 
                    type="button" 
                    id="cancel-review-btn"
                    class="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg font-bold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    Hủy
                </button>
            </div>
        </form>
    `;
    
    // Setup star rating
    setupStarRating();
    
    // Setup character counter
    const commentTextarea = document.getElementById('review-comment');
    const commentCount = document.getElementById('comment-count');
    if (commentTextarea && commentCount) {
        commentTextarea.addEventListener('input', () => {
            commentCount.textContent = commentTextarea.value.length;
        });
    }
    
    // Setup form submission
    const form = document.getElementById('review-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleReviewSubmit(e);
        });
    }
    
    // Setup cancel button
    const cancelBtn = document.getElementById('cancel-review-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            container.classList.add('hidden');
            document.getElementById('write-review-btn').classList.remove('hidden');
        });
    }
}

function setupStarRating() {
    const starButtons = document.querySelectorAll('.star-btn');
    const ratingInput = document.getElementById('rating-value');
    
    starButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            const rating = index + 1;
            ratingInput.value = rating;
            
            // Update star display
            starButtons.forEach((starBtn, starIndex) => {
                const icon = starBtn.querySelector('.material-symbols-outlined');
                if (starIndex < rating) {
                    icon.classList.remove('text-gray-300');
                    icon.classList.add('text-amber-500');
                    icon.style.fontVariationSettings = "'FILL' 1";
                } else {
                    icon.classList.add('text-gray-300');
                    icon.classList.remove('text-amber-500');
                    icon.style.fontVariationSettings = "'FILL' 0";
                }
            });
        });
        
        // Hover effect
        btn.addEventListener('mouseenter', () => {
            const rating = index + 1;
            starButtons.forEach((starBtn, starIndex) => {
                const icon = starBtn.querySelector('.material-symbols-outlined');
                if (starIndex < rating) {
                    icon.classList.add('text-amber-500');
                }
            });
        });
        
        btn.addEventListener('mouseleave', () => {
            const currentRating = parseInt(ratingInput.value) || 0;
            starButtons.forEach((starBtn, starIndex) => {
                const icon = starBtn.querySelector('.material-symbols-outlined');
                if (starIndex >= currentRating) {
                    icon.classList.remove('text-amber-500');
                    icon.classList.add('text-gray-300');
                }
            });
        });
    });
}

async function handleReviewSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-review-btn');
    const formData = new FormData(e.target);
    
    const reviewData = {
        rating: parseFloat(formData.get('rating')),
        title: formData.get('title'),
        comment: formData.get('comment'),
        userName: currentUser.displayName || currentUser.email.split('@')[0],
        verified: false, // Can be set based on purchase history
        images: [] // Can be extended with image upload
    };
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang đăng...';
    
    const success = await postReview(currentProductId, reviewData);
    
    if (success) {
        // Hide form
        document.getElementById('review-form-container').classList.add('hidden');
        document.getElementById('write-review-btn').classList.remove('hidden');
        
        // Reload reviews
        await refreshReviews();
        
        // Show success toast notification
        showToast('Cảm ơn bạn đã đánh giá sản phẩm!', 'success');
        
        // Reset form
        e.target.reset();
        document.getElementById('rating-value').value = '0';
        
        // Reset stars
        const starButtons = document.querySelectorAll('.star-btn');
        starButtons.forEach(btn => {
            const icon = btn.querySelector('.material-symbols-outlined');
            icon.classList.add('text-gray-300');
            icon.classList.remove('text-amber-500');
            icon.style.fontVariationSettings = "'FILL' 0";
        });
    }
    
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Đăng Đánh Giá';
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners() {
    // Write review button
    const writeReviewBtn = document.getElementById('write-review-btn');
    if (writeReviewBtn) {
        writeReviewBtn.addEventListener('click', () => {
            const formContainer = document.getElementById('review-form-container');
            if (formContainer) {
                formContainer.classList.remove('hidden');
                writeReviewBtn.classList.add('hidden');
                renderReviewForm();
            }
        });
    }
    
    // Sort select
    const sortSelect = document.getElementById('review-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            renderReviews(allReviews, e.target.value);
        });
    }
}

function setupHelpfulButtons() {
    const helpfulButtons = document.querySelectorAll('.helpful-btn');
    
    helpfulButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const productId = btn.getAttribute('data-product-id');
            const reviewId = btn.getAttribute('data-review-id');
            
            const success = await markReviewHelpful(productId, reviewId);
            
            if (success) {
                await refreshReviews();
            }
        });
    });
}

async function refreshReviews() {
    if (currentProductId) {
        const reviews = await loadReviews(currentProductId);
        renderRatingSummary(reviews);
        renderReviews(reviews, document.getElementById('review-sort')?.value || 'recent');
    }
}

// ============================================================================
// UTILITY
// ============================================================================

function renderStars(rating, sizeClass = 'text-sm') {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let html = '';
    
    // Full stars
    for (let i = 0; i < fullStars; i++) {
        html += `<span class="material-symbols-outlined ${sizeClass} text-amber-500" style="font-variation-settings: 'FILL' 1">star</span>`;
    }
    
    // Half star
    if (hasHalfStar) {
        html += `<span class="material-symbols-outlined ${sizeClass} text-amber-500" style="font-variation-settings: 'FILL' 1">star_half</span>`;
    }
    
    // Empty stars
    for (let i = 0; i < emptyStars; i++) {
        html += `<span class="material-symbols-outlined ${sizeClass} text-gray-300">star</span>`;
    }
    
    return html;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Vừa xong';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffDays === 0) return 'Hôm nay';
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
    
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initProductReviews(productId) {
    console.log('🚀 Initializing product reviews...');
    
    currentProductId = productId;
    
    await initAuth();
    
    const reviews = await loadReviews(productId);
    
    renderRatingSummary(reviews);
    renderReviews(reviews);
    setupEventListeners();
    
    console.log('✅ Product reviews initialized');
}

// Export functions
export { initProductReviews, refreshReviews };

console.log('✅ Product reviews module loaded');
