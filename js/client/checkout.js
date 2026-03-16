/**
 * Checkout Logic
 * Handles cart summary display and order placement (COD & QR Transfer)
 */

import { initAuthStateObserver, getUserData } from '../auth.js';
import { getFirebaseAuth, getFirebaseFirestore } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, increment, getDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { showQRPaymentModal } from './qr-payment.js';

const auth = getFirebaseAuth();
const database = getFirebaseFirestore();

document.addEventListener('DOMContentLoaded', () => {
    const checkoutItemsContainer = document.getElementById('checkout-items');
    const subtotalEl = document.getElementById('checkout-subtotal');
    const discountEl = document.getElementById('checkout-discount');
    const discountRowEl = document.getElementById('checkout-discount-row');
    const taxEl = document.getElementById('checkout-tax');
    const totalEl = document.getElementById('checkout-total');
    const checkoutForm = document.getElementById('checkout-form');

    // Auto-fill User Data
    // Auto-fill User Data
    initAuthStateObserver(async (user) => {
        if (user) {
            const userData = await getUserData(user.uid);
            if (userData) {
                if (document.getElementById('fullname')) document.getElementById('fullname').value = userData.displayName || '';
                
                // Fix: Key name is 'phone', not 'phoneNumber'
                if (document.getElementById('phone')) document.getElementById('phone').value = userData.phone || userData.phoneNumber || '';
                
                if (document.getElementById('email')) document.getElementById('email').value = userData.email || '';

                // Fix: Address is an object {street, ward, district, city}, not array or string
                const addr = userData.address;
                if (addr && typeof addr === 'object') {
                    // Fill City
                    if (document.getElementById('city')) document.getElementById('city').value = addr.city || '';
                    
                    // Fill Address (Street + Ward + District)
                    if (document.getElementById('address')) {
                        const addressParts = [addr.street, addr.ward, addr.district].filter(Boolean);
                        document.getElementById('address').value = addressParts.join(', ');
                    }
                } else if (userData.addresses && userData.addresses.length > 0) {
                     // Fallback for legacy array format if exists
                     if (document.getElementById('address')) document.getElementById('address').value = userData.addresses[0].fullAddress || '';
                } 
            }
        }
    });

    const TAX_RATE = 0.08;
    let _currentTotal = 0; // Biến lưu tổng tiền để dùng cho thanh toán
    let _appliedCoupon = null; // Lưu thông tin mã giảm giá

    // --- 1. Load Cart Summary ---
    function loadOrderSummary() {
        const cart = window.getCart ? window.getCart() : [];
        
        if (!cart || cart.length === 0) {
             window.location.href = 'Cart.html';
             return;
        }

        if (checkoutItemsContainer) {
            checkoutItemsContainer.innerHTML = '';
            
            cart.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'flex items-center justify-between text-sm';
                itemEl.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <img src="${item.image}" class="w-12 h-12 rounded bg-gray-100 object-cover">
                            <span class="absolute -top-2 -right-2 bg-gray-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">${item.quantity}</span>
                        </div>
                        <div>
                            <p class="font-bold text-[#1b0e0f] dark:text-white line-clamp-1">${item.name}</p>
                            <p class="text-xs text-[#974e52] dark:text-[#c48e91]">${item.size}</p>
                        </div>
                    </div>
                    <span class="font-bold text-[#1b0e0f] dark:text-white">${window.formatPrice(item.price * item.quantity)}</span>
                `;
                checkoutItemsContainer.appendChild(itemEl);
            });
        }

        // Calculate Totals
        let subtotal = 0;
        cart.forEach(item => subtotal += item.price * item.quantity);
        
        // Load applied coupon from localStorage
        let discount = 0;
        const savedCoupon = localStorage.getItem('appliedCoupon');
        if (savedCoupon) {
            try {
                _appliedCoupon = JSON.parse(savedCoupon);
                discount = calculateDiscount(subtotal, _appliedCoupon);
                
                // Show discount row
                if (discountRowEl) discountRowEl.classList.remove('hidden');
                if (discountEl) discountEl.textContent = '-' + window.formatPrice(discount);
            } catch (e) {
                console.error('Error parsing coupon:', e);
                localStorage.removeItem('appliedCoupon');
            }
        } else {
            // Hide discount row if no coupon
            if (discountRowEl) discountRowEl.classList.add('hidden');
        }
        
        const afterDiscount = subtotal - discount;
        const tax = afterDiscount * TAX_RATE;
        _currentTotal = afterDiscount + tax;

        if (subtotalEl) subtotalEl.textContent = window.formatPrice(subtotal);
        if (taxEl) taxEl.textContent = window.formatPrice(tax);
        if (totalEl) totalEl.textContent = window.formatPrice(_currentTotal);
    }

    function getProductAvailableStock(product, item) {
        const inventory = product.inventory || {};
        if (item.color && item.size && inventory[item.color] && inventory[item.color][item.size] != null) {
            return parseInt(inventory[item.color][item.size]) || 0;
        }

        if (inventory && Object.keys(inventory).length > 0) {
            return Object.values(inventory).reduce((colorTotal, sizeMap) => {
                if (!sizeMap || typeof sizeMap !== 'object') return colorTotal;
                return colorTotal + Object.values(sizeMap).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
            }, 0);
        }

        const stock = parseInt(product.stock);
        if (!Number.isNaN(stock)) return stock;
        return parseInt(product.quantity) || 0;
    }

    async function validateCartStockBeforeCheckout() {
        const cart = window.getCart ? window.getCart() : [];
        const adjustedCart = [];
        const issues = [];
        let cartChanged = false;

        for (const item of cart) {
            if (!item.id) {
                adjustedCart.push(item);
                continue;
            }

            const productSnap = await getDoc(doc(database, 'products', item.id));
            if (!productSnap.exists()) {
                cartChanged = true;
                issues.push(`${item.name}: sản phẩm không còn tồn tại.`);
                continue;
            }

            const product = productSnap.data();
            const availableStock = getProductAvailableStock(product, item);

            if (availableStock <= 0) {
                cartChanged = true;
                issues.push(`${item.name}: đã hết hàng.`);
                continue;
            }

            const nextQuantity = Math.min(item.quantity, availableStock);
            if (nextQuantity !== item.quantity) {
                cartChanged = true;
                issues.push(`${item.name}: chỉ còn ${availableStock} sản phẩm phù hợp.`);
            }

            adjustedCart.push({
                ...item,
                quantity: nextQuantity,
                maxStock: availableStock
            });
        }

        if (cartChanged) {
            window.saveCart(adjustedCart);
            loadOrderSummary();
        }

        return {
            isValid: issues.length === 0,
            issues
        };
    }
    
    /**
     * Calculate discount amount based on coupon
     */
    function calculateDiscount(subtotal, coupon) {
        let discount = 0;
        
        if (coupon.type === 'percentage') {
            discount = subtotal * (coupon.value / 100);
            // Apply max discount limit if exists
            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
            }
        } else if (coupon.type === 'fixed') {
            discount = coupon.value;
        }
        
        // Discount cannot exceed subtotal
        return Math.min(discount, subtotal);
    }
    
    /**
     * Update promotion usage count in Firebase
     */
    async function updatePromotionUsage(couponId) {
        if (!couponId) return;
        try {
            await updateDoc(doc(database, 'promotions', couponId), {
                usageCount: increment(1)
            });
            console.log('✅ Đã cập nhật usageCount cho mã:', couponId);
        } catch (error) {
            console.error('❌ Lỗi cập nhật promotion usage:', error);
        }
    }

    // --- 2. Handle Order Submission ---
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate inputs
            const fullname = document.getElementById('fullname').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const address = document.getElementById('address').value;
            const city = document.getElementById('city').value;
            
            // Get selected payment method
            const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

            if (!fullname || !email || !phone || !address || !city) {
                window.showToast('Vui lòng điền đầy đủ thông tin bắt buộc!', 'error');
                return;
            }

            const stockValidation = await validateCartStockBeforeCheckout();
            if (!stockValidation.isValid) {
                window.showToast(stockValidation.issues[0] || 'Giỏ hàng đã được cập nhật theo tồn kho mới nhất.', 'warning');
                return;
            }

            // UI Loading State
            const submitBtn = checkoutForm.querySelector('button[type="submit"]');
            const originalBtnContent = submitBtn.innerHTML;
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">progress_activity</span> Đang xử lý...`;

            try {
                const cart = window.getCart ? window.getCart() : [];
                const user = auth.currentUser;
                
                // Calculate subtotal and discount
                let subtotal = 0;
                cart.forEach(item => subtotal += item.price * item.quantity);
                
                let discount = 0;
                if (_appliedCoupon) {
                    discount = calculateDiscount(subtotal, _appliedCoupon);
                }
                
                const afterDiscount = subtotal - discount;
                const tax = afterDiscount * TAX_RATE;
                
                // Tạo order data
                const orderData = {
                    userId: user ? user.uid : 'guest',
                    userEmail: user ? user.email : email,
                    orderId: 'ORD-' + Date.now(),
                    customerInfo: {
                        fullname,
                        email,
                        phone,
                        address,
                        city
                    },
                    customerName: fullname,
                    customerPhone: phone,
                    items: cart.map(item => ({
                        id: item.id || '',
                        name: item.name || 'Sản phẩm',
                        price: item.price || 0,
                        quantity: item.quantity || 1,
                        size: item.size || '',
                        color: item.color || '',
                        image: item.image || ''
                    })),
                    subtotal: subtotal,
                    discount: discount,
                    tax: tax,
                    total: _currentTotal,
                    coupon: _appliedCoupon ? {
                        code: _appliedCoupon.code,
                        type: _appliedCoupon.type,
                        value: _appliedCoupon.value
                    } : null,
                    paymentMethod: paymentMethod === 'qr-transfer' ? 'QR Transfer' : 'COD',
                    status: 'pending', // Tất cả đơn mới đều là 'pending'
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                // XỬ LÝ THEO PHƯƠNG THỨC THANH TOÁN
                if (paymentMethod === 'qr-transfer') {
                    // ===== THANH TOÁN QR CODE =====
                    submitBtn.innerHTML = originalBtnContent;
                    submitBtn.disabled = false;

                    // Hiển thị QR Modal
                    showQRPaymentModal(
                        orderData.orderId,
                        Math.round(_currentTotal),
                        async () => {
                            // Callback khi thanh toán thành công
                            submitBtn.disabled = true;
                            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">progress_activity</span> Đang lưu đơn hàng...`;

                            try {
                                // Lưu đơn hàng vào Firestore
                                await addDoc(collection(database, 'orders'), orderData);
                                console.log('✅ Đơn hàng QR đã được lưu:', orderData.orderId);

                                // Update promotion usage count if coupon was used
                                if (_appliedCoupon && _appliedCoupon.id) {
                                    await updatePromotionUsage(_appliedCoupon.id);
                                }

                                // Clear Cart and Coupon
                                localStorage.removeItem('cart');
                                localStorage.removeItem('appliedCoupon');
                                
                                // Show Success
                                submitBtn.innerHTML = `<span class="material-symbols-outlined">check</span> Thành công!`;
                                window.showToast('Thanh toán thành công! Đơn hàng đang chờ xử lý.');

                                // Redirect
                                setTimeout(() => {
                                    window.location.href = 'Account.html?tab=orders&orderSuccess=true';
                                }, 1500);
                            } catch (saveError) {
                                console.error('❌ Lỗi lưu đơn hàng:', saveError);
                                window.showToast('Thanh toán thành công nhưng không thể lưu đơn hàng. Vui lòng liên hệ CSKH.', 'error');
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = originalBtnContent;
                            }
                        },
                        () => {
                            // Callback khi hủy thanh toán
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalBtnContent;
                            window.showToast('Đã hủy thanh toán QR', 'error');
                        }
                    );

                } else {
                    // ===== THANH TOÁN COD (Mặc định) =====
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Fake delay

                    // Lưu đơn hàng vào Firebase
                    try {
                        const docRef = await addDoc(collection(database, 'orders'), orderData);
                        console.log('✅ Đơn hàng COD đã được lưu:', orderData.orderId);
                        
                        // Update promotion usage count if coupon was used
                        if (_appliedCoupon && _appliedCoupon.id) {
                            await updatePromotionUsage(_appliedCoupon.id);
                        }
                    } catch (saveError) {
                        console.error('❌ Lỗi lưu đơn hàng:', saveError);
                        // Vẫn cho phép tiếp tục nếu lưu Firebase thất bại
                    }

                    // Clear Cart and Coupon
                    localStorage.removeItem('cart');
                    localStorage.removeItem('appliedCoupon');
                    
                    // Show Success
                    submitBtn.innerHTML = `<span class="material-symbols-outlined">check</span> Thành công!`;
                    window.showToast('Đặt hàng thành công! Cảm ơn bạn đã mua sắm.');

                    // Redirect
                    setTimeout(() => {
                        window.location.href = 'Account.html?tab=orders&orderSuccess=true';
                    }, 1500);
                }

            } catch (error) {
                console.error('Checkout error:', error);
                window.showToast('Có lỗi xảy ra. Vui lòng thử lại.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
        });
    }

    // Initialize
    loadOrderSummary();
});

