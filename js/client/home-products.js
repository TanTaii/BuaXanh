/**
 * MODULE SẢN PHẨM TRANG CHỦ
 * - Tải dữ liệu từ Firebase Firestore
 * - Hiển thị sản phẩm Flash Sale
 * - Hiển thị sản phẩm Bán chạy (Best Sellers)
 * - Hiển thị sản phẩm Mới (New Arrivals)
 */

import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// Khởi tạo database
const database = getFirebaseFirestore();

// ============================================================================
// PHẦN 1: TẢI DỮ LIỆU (DATA LOADING)
// ============================================================================

/**
 * Tải sản phẩm Flash Sale
 * @param {number} limit - Số lượng sản phẩm tối đa
 * @returns {Promise<Array>} Danh sách sản phẩm
 */
async function loadFlashSaleProducts(limit = 4) {
  try {
    const snapshot = await getDocs(collection(database, 'products'));
    const flashSaleProducts = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(product => (product.discount && product.discount > 0) || product.isFlashSale)
      .sort((a, b) => (b.discount || 0) - (a.discount || 0))
      .slice(0, limit);
    console.log(`✅ Đã tải ${flashSaleProducts.length} sản phẩm Flash Sale`);
    return flashSaleProducts;
  } catch (error) {
    console.error('❌ Lỗi tải Flash Sale:', error);
    return [];
  }
}

/**
 * Tải sản phẩm Bán chạy (Best Sellers)
 */
async function loadBestSellers(limit = null) {
  try {
    const snapshot = await getDocs(collection(database, 'products'));
    let bestSellers = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(product => product.isBestSeller || product.salesCount > 0)
      .sort((a, b) => (b.salesCount || b.sold || 0) - (a.salesCount || a.sold || 0));

    if (limit) {
      bestSellers = bestSellers.slice(0, limit);
    }

    console.log(`✅ Đã tải ${bestSellers.length} sản phẩm Bán chạy`);
    return bestSellers;
  } catch (error) {
    console.error('❌ Lỗi tải Best Sellers:', error);
    return [];
  }
}

/**
 * Tải sản phẩm Mới (New Arrivals)
 */
async function loadNewArrivals(limit = null) {
  try {
    const snapshot = await getDocs(collection(database, 'products'));
    let newArrivals = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(product => product.isNew)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (limit) {
      newArrivals = newArrivals.slice(0, limit);
    }

    console.log(`✅ Đã tải ${newArrivals.length} sản phẩm Mới`);
    return newArrivals;
  } catch (error) {
    console.error('❌ Lỗi tải New Arrivals:', error);
    return [];
  }
}

// ============================================================================
// PHẦN 2: HIỂN THỊ GIAO DIỆN (RENDERING)
// ============================================================================

/**
 * Định dạng tiền tệ Việt Nam (VND)
 */
function formatPrice(price) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price);
}

/**
 * Render HTML cho Flash Sale
 */
function renderFlashSale(products) {
  const container = document.getElementById('flash-sale-products');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-gray-500 font-medium">Chưa có sản phẩm flash sale</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(product => {
    const mainImage = Array.isArray(product.images) && product.images.length > 0
      ? product.images[0]
      : 'image/coming_soon.png';
    
    const discountPercent = product.discount || 0;
    const originalPrice = product.originalPrice || (product.price / (1 - discountPercent / 100));

    return `
      <div class="group bg-white dark:bg-background-dark rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-transparent hover:border-primary/20">
        <div class="relative aspect-square bg-gray-100 overflow-hidden">
          <div class="absolute top-4 left-4 z-10 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded">
            ${discountPercent}% OFF
          </div>
          <a href="Product-detail.html?id=${product.id}">
            <img class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                 src="${mainImage}"
                 alt="${product.name}"
                 onerror="this.src='image/coming_soon.png'"/>
          </a>
        </div>
        <div class="p-5">
          <p class="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">
            ${product.brand || product.category || 'Product'}
          </p>
          <a href="Product-detail.html?id=${product.id}">
            <h3 class="text-lg font-bold leading-tight mb-2 dark:text-white hover:text-primary transition-colors">
              ${product.name}
            </h3>
          </a>
          <div class="flex items-center gap-3">
            <span class="text-primary text-xl font-black">${formatPrice(product.price)}</span>
            ${discountPercent > 0 ? `<span class="text-gray-400 line-through text-sm font-medium">${formatPrice(originalPrice)}</span>` : ''}
          </div>
          <button class="w-full mt-4 bg-black dark:bg-primary py-3 text-white text-sm font-bold rounded-lg hover:bg-primary transition-colors flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-sm">shopping_bag</span>
            Thêm vào giỏ
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render HTML cho Best Sellers
 */
function renderBestSellers(products) {
  const container = document.getElementById('best-sellers-products');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-gray-500 font-medium">Chưa có sản phẩm bán chạy</p>
      </div>
    `;
    return;
  }

  // Lưu toàn bộ sản phẩm để sử dụng cho carousel
  container.dataset.allProducts = JSON.stringify(products);
  container.dataset.currentPage = '0';
  
  // Hiển thị carousel nếu có nhiều hơn 4 sản phẩm
  if (products.length > 4) {
    initProductCarousel('best-sellers', products);
  } else {
    renderProductPage('best-sellers', products, 0);
  }
}

/**
 * Render trang sản phẩm (4 sản phẩm)
 */
function renderProductPage(sectionId, products, page) {
  const container = document.getElementById(`${sectionId}-products`);
  if (!container) return;
  
  const start = page * 4;
  const end = start + 4;
  const pageProducts = products.slice(start, end);
  
  container.innerHTML = pageProducts.map(product => {
    const mainImage = Array.isArray(product.images) && product.images.length > 0
      ? product.images[0]
      : 'image/coming_soon.png';

    return `
      <div class="group relative flex flex-col">
        <div class="relative aspect-square bg-[#f3f3f3] dark:bg-[#2a1a1b] rounded-xl overflow-hidden mb-4">
          <a href="Product-detail.html?id=${product.id}">
            <img class="w-full h-full object-contain p-8 group-hover:scale-110 transition-transform duration-500"
                 src="${mainImage}"
                 alt="${product.name}"
                 onerror="this.src='image/coming_soon.png'"/>
          </a>
          ${product.isNew ? '<div class="absolute top-4 left-4 bg-black text-white text-[10px] font-bold px-2 py-1 rounded">MỚI</div>' : ''}
          ${product.isBestSeller ? '<div class="absolute top-4 right-4 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded">BÁN CHẠY</div>' : ''}
          <button class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-bold px-6 py-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 w-[80%] whitespace-nowrap">
            THÊM NHANH
          </button>
        </div>
        <div class="flex flex-col gap-1">
          <p class="text-gray-500 text-xs font-semibold uppercase tracking-wider">${product.brand || 'Brand'}</p>
          <a href="Product-detail.html?id=${product.id}">
            <h3 class="text-base font-bold text-gray-900 dark:text-white leading-tight hover:text-primary transition-colors">
              ${product.name}
            </h3>
          </a>
          <div class="flex items-center gap-2 mt-1">
            <p class="text-primary font-bold text-lg">${formatPrice(product.price)}</p>
            ${product.discount > 0 && product.originalPrice ? `<span class="text-gray-400 line-through text-sm">${formatPrice(product.originalPrice)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render HTML cho New Arrivals
 */
function renderNewArrivals(products) {
  const container = document.getElementById('new-arrivals-products');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-gray-500 font-medium">Chưa có sản phẩm mới</p>
      </div>
    `;
    return;
  }

  // Lưu toàn bộ sản phẩm để sử dụng cho carousel
  container.dataset.allProducts = JSON.stringify(products);
  container.dataset.currentPage = '0';
  
  // Hiển thị carousel nếu có nhiều hơn 4 sản phẩm
  if (products.length > 4) {
    initProductCarousel('new-arrivals', products);
  } else {
    renderProductPage('new-arrivals', products, 0);
  }
}

/**
 * Khởi tạo carousel cho sản phẩm
 */
function initProductCarousel(sectionId, products) {
  const prevBtn = document.getElementById(`${sectionId}-prev`);
  const nextBtn = document.getElementById(`${sectionId}-next`);
  const container = document.getElementById(`${sectionId}-products`);
  
  if (!prevBtn || !nextBtn || !container) return;
  
  // Hiển thị nút điều khiển
  prevBtn.classList.remove('hidden');
  prevBtn.classList.add('flex');
  nextBtn.classList.remove('hidden');
  nextBtn.classList.add('flex');
  
  let currentPage = 0;
  const totalPages = Math.ceil(products.length / 4);
  
  // Hiển thị trang đầu tiên
  renderProductPage(sectionId, products, currentPage);
  updateCarouselButtons();
  
  // Xử lý sự kiện nút Previous
  prevBtn.addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      renderProductPage(sectionId, products, currentPage);
      updateCarouselButtons();
    }
  });
  
  // Xử lý sự kiện nút Next
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages - 1) {
      currentPage++;
      renderProductPage(sectionId, products, currentPage);
      updateCarouselButtons();
    }
  });
  
  // Cập nhật trạng thái nút
  function updateCarouselButtons() {
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage === totalPages - 1;
    
    if (currentPage === 0) {
      prevBtn.classList.add('opacity-30', 'cursor-not-allowed');
    } else {
      prevBtn.classList.remove('opacity-30', 'cursor-not-allowed');
    }
    
    if (currentPage === totalPages - 1) {
      nextBtn.classList.add('opacity-30', 'cursor-not-allowed');
    } else {
      nextBtn.classList.remove('opacity-30', 'cursor-not-allowed');
    }
  }
}

/**
 * Hiển thị khung xương (Skeleton Loading) khi đang tải
 */
function showLoadingSkeleton(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const skeletons = Array(count).fill(0).map(() => `
    <div class="flex flex-col">
      <div class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-xl mb-4 skeleton animate-pulse"></div>
      <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2 skeleton animate-pulse"></div>
      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2 skeleton animate-pulse"></div>
      <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2 skeleton animate-pulse"></div>
    </div>
  `).join('');

  container.innerHTML = skeletons;
}

// ============================================================================
// PHẦN 3: KHỞI TẠO (INITIALIZATION)
// ============================================================================

async function init() {
  console.log('🚀 Đang khởi tạo trang chủ...');

  // 1. Hiển thị skeleton
  showLoadingSkeleton('flash-sale-products', 4);
  showLoadingSkeleton('best-sellers-products', 4);
  showLoadingSkeleton('new-arrivals-products', 4);

  // 2. Tải dữ liệu song song (không giới hạn số lượng cho carousel)
  const [flashSale, bestSellers, newArrivals] = await Promise.all([
    loadFlashSaleProducts(4),
    loadBestSellers(), // Load tất cả
    loadNewArrivals() // Load tất cả
  ]);

  // 3. Render dữ liệu
  renderFlashSale(flashSale);
  renderBestSellers(bestSellers);
  renderNewArrivals(newArrivals);

  console.log('✅ Trang chủ khởi tạo hoàn tất');
}

// Chạy khi trang load xong
document.addEventListener('DOMContentLoaded', init);

