/**
 * CÁC HÀM TIỆN ÍCH DÙNG CHUNG (UTILS)
 * - Quản lý Giỏ hàng (localStorage)
 * - Quản lý Wishlist (localStorage)
 * - Định dạng tiền tệ
 * - Hiển thị thông báo (Toast)
 */

// Fix ReferenceError: timer is not defined (from external/cached scripts)
window.timer = null;

// --- 1. Quản lý Giỏ hàng ---

// Lấy giỏ hàng từ LocalStorage
window.getCart = function() {
  return JSON.parse(localStorage.getItem('cart')) || [];
}

// Lưu giỏ hàng xuống LocalStorage & cập nhật badge
window.saveCart = function(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  window.updateCartCount && window.updateCartCount();
}

// Cập nhật số lượng trên icon giỏ hàng
window.updateCartCount = function() {
  const cart = window.getCart();
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const badgeElement = document.querySelector('a[href="Cart.html"] span.absolute') || document.querySelector('.shopping_cart_badge');
  if (badgeElement) {
    badgeElement.textContent = totalCount;
    badgeElement.style.display = totalCount > 0 ? 'flex' : 'none';
    badgeElement.classList.add('shopping_cart_badge'); // Đảm bảo class tồn tại
  }
}

// Thêm sản phẩm vào giỏ
window.addToCart = function(product) {
  let cart = window.getCart();
  const maxStock = Number(product.maxStock ?? product.stock ?? 0);

  if (maxStock <= 0) {
    window.showToast('Sản phẩm này hiện đã hết hàng', 'warning');
    return false;
  }

  const existingItem = cart.find(item => {
    const sameId = item.id && product.id ? item.id === product.id : item.name === product.name;
    return sameId && item.size === product.size && (item.color || '') === (product.color || '');
  });

  if (existingItem) {
    const nextQuantity = existingItem.quantity + 1;
    const allowedStock = Number(product.maxStock ?? existingItem.maxStock ?? maxStock);

    if (nextQuantity > allowedStock) {
      existingItem.maxStock = allowedStock;
      window.saveCart(cart);
      window.showToast(`Chi còn ${allowedStock} san pham co san cho lua chon nay`, 'warning');
      return false;
    }

    existingItem.quantity = nextQuantity;
    existingItem.maxStock = allowedStock;
  } else {
    cart.push({ ...product, quantity: 1, maxStock });
  }

  window.saveCart(cart);
  window.showToast(`Đã thêm <b>${product.name}</b> vào giỏ!`);
  return true;
}

// --- 2. Định dạng & Xử lý số liệu ---

// Định dạng giá tiền (VND)
window.formatPrice = function(price) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
}

// Chuyển chuỗi tiền tệ về số nguyên
window.parsePrice = function(priceString) {
  if (typeof priceString === 'number') return priceString;
  return parseInt(priceString.replace(/\D/g, '')) || 0;
}

// --- 3. Quản lý Yêu thích (Wishlist) ---

// Lấy danh sách yêu thích
window.getWishlist = function() {
  return JSON.parse(localStorage.getItem('wishlist')) || [];
}

// Lưu danh sách yêu thích
window.saveWishlist = function(wishlist) {
  localStorage.setItem('wishlist', JSON.stringify(wishlist));
}

// Thêm/Xóa khỏi danh sách yêu thích
window.addToWishlist = function(product) {
  let wishlist = window.getWishlist();
  const existingIndex = wishlist.findIndex(item => item.id === product.id);

  if (existingIndex >= 0) {
    wishlist.splice(existingIndex, 1);
    window.saveWishlist(wishlist);
    window.showToast(`Đã xóa <b>${product.name}</b> khỏi danh sách yêu thích`);
    return false; // Đã xóa
  } else {
    wishlist.push(product);
    window.saveWishlist(wishlist);
    window.showToast(`Đã thêm <b>${product.name}</b> vào danh sách yêu thích`);
    return true; // Đã thêm
  }
}

// Kiểm tra sản phẩm có trong wishlist chưa
window.isInWishlist = function(productId) {
  const wishlist = window.getWishlist();
  return wishlist.some(item => item.id === productId);
}

// --- 4. Thông báo (Toast Notification) ---

window.showToast = function(message, type = 'success') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed bottom-5 right-5 z-[100] flex flex-col gap-3';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'bg-black text-white px-6 py-4 rounded shadow-2xl flex items-center gap-3 transform translate-y-10 opacity-0 transition-all duration-300';
  const toastPrefix = type === 'error'
    ? 'Lỗi'
    : type === 'warning'
      ? 'Cảnh báo'
      : type === 'info'
        ? 'Thông báo'
        : 'Đã giao';
  const toastPrefixClass = type === 'error'
    ? 'text-red-500'
    : type === 'warning'
      ? 'text-yellow-400'
      : type === 'info'
        ? 'text-sky-400'
        : 'text-green-500';
  toast.innerHTML = `
    <span class="font-bold text-sm ${toastPrefixClass}">${toastPrefix}</span>
    <span class="font-bold text-sm">${message}</span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-10');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}


document.addEventListener('DOMContentLoaded', () => {
  // --- 5. Mobile Menu (Header) ---
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const closeMenuBtn = document.getElementById('close-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  function toggleMenu() {
    if (!mobileMenu) return;
    const isHidden = mobileMenu.classList.contains('hidden');
    if (isHidden) {
      mobileMenu.classList.remove('hidden');
      mobileMenu.classList.add('flex');
      document.body.style.overflow = 'hidden';
    } else {
      mobileMenu.classList.add('hidden');
      mobileMenu.classList.remove('flex');
      document.body.style.overflow = '';
    }
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMenu);
  if (closeMenuBtn) closeMenuBtn.addEventListener('click', toggleMenu);

  // Khởi tạo các logic chung
  window.updateCartCount();
  syncHeaderAuthUI();

  // --- 6. Quick Add (Global Event Listener) ---
  // Lắng nghe sự kiện click nút "Thêm Nhanh" trên toàn trang
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const btnText = btn.innerText.toUpperCase();
    // Logic: Nếu là nút "THÊM NHANH" hoặc nút "THÊM VÀO GIỎ" (loại trừ nút ở trang chi tiết vì cần chọn size)
    if (btnText.includes('THÊM NHANH') || (btnText.includes('THÊM VÀO GIỎ') && !btn.closest('.w-full.lg\\:w-2\\/5'))) { 
      const card = btn.closest('.group');
      if (card) {
        const name = card.querySelector('h3')?.innerText;
        const priceStr = card.querySelector('.text-primary')?.innerText;
        const img = card.querySelector('img')?.src;
        
        if (name && priceStr) {
          const price = parsePrice(priceStr);
          addToCart({
            id: Date.now(), // Tạo ID tạm thời
            name: name,
            price: price,
            image: img,
            size: 'Free Size' // Mặc định Free Size cho Quick Add
          });
        }
      }
    }
  });

});

async function syncHeaderAuthUI() {
  const authButtons = document.getElementById('auth-buttons');
  if (!authButtons) return;

  // Remove legacy login button in header to keep a consistent compact nav.
  const legacyLoginButton = authButtons.querySelector('#auth-action-btn');
  if (legacyLoginButton) {
    legacyLoginButton.remove();
  }

  const accountLink = Array.from(authButtons.querySelectorAll('a')).find((anchor) => {
    const icon = anchor.querySelector('.material-symbols-outlined');
    if (!icon) return false;
    const iconText = (icon.textContent || '').trim();
    return iconText === 'person' || iconText === 'settings';
  });

  if (!accountLink) return;

  accountLink.classList.add('account-link');
  accountLink.href = 'login.html';

  try {
    const [{ getFirebaseAuth }, { onAuthStateChanged }] = await Promise.all([
      import('./firebase-config.js'),
      import('https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js')
    ]);

    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, (user) => {
      accountLink.href = user ? 'Account.html' : 'login.html';
      accountLink.title = user ? 'Tài khoản của tôi' : 'Đăng nhập';
    });
  } catch (error) {
    console.warn('Auth sync skipped:', error?.message || error);
  }
}

