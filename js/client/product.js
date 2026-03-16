// Product Listing Page Logic for Bua Xanh
// Handles product loading, filtering, and rendering from Firebase

import { getFirebaseFirestore } from '../firebase-config.js';
import { getCachedCollectionData } from '../firestore-cache.js';

// Get Firebase database instance from shared config
const database = getFirebaseFirestore();

// Global state
let allProducts = [];
let allBrands = [];
let allCategories = [];
const MAX_PRICE = 5000000;
const DEFAULT_CATEGORIES = [
    { slug: 'tuoi-song', name: 'Thực phẩm tươi sống' },
    { slug: 'che-bien-san', name: 'Thực phẩm chế biến sẵn' },
    { slug: 'do-hop', name: 'Đồ hộp' },
    { slug: 'dong-lanh', name: 'Thực phẩm đông lạnh' },
    { slug: 'kho-gia-vi', name: 'Đồ khô & gia vị' },
    { slug: 'do-uong', name: 'Đồ uống' }
];
let currentFilters = {
    categories: [],
    brands: [],
    genders: [],
    sizes: [],
    priceMin: 0,
    priceMax: MAX_PRICE,
    searchTerm: '' // Add search term to filters
};
let currentPage = 1;
let itemsPerPage = 12;
let currentSort = 'popular'; // popular, price-asc, price-desc, newest
let searchTimeout = null;
const RECENT_SEARCHES_KEY = 'bua-xanh-product-recent-searches';
const MAX_RECENT_SEARCHES = 5;

function slugifyText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatLabel(value) {
    return String(value || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeBrandOption(brand) {
    const name = String(brand?.name || brand?.label || brand?.title || brand || '').trim();
    if (!name) return null;

    return {
        value: name,
        label: name
    };
}

function normalizeCategoryOption(category) {
    const slug = String(category?.slug || category?.value || category?.id || category || '').trim();
    const name = String(category?.name || category?.label || category?.title || '').trim();
    const value = slug || slugifyText(name);
    if (!value) return null;

    const matchedDefault = DEFAULT_CATEGORIES.find((item) => item.slug === value);

    return {
        value,
        label: name || matchedDefault?.name || formatLabel(value)
    };
}

function getMergedBrandOptions() {
    const brandMap = new Map();

    allBrands.forEach((brand) => {
        const normalized = normalizeBrandOption(brand);
        if (normalized) brandMap.set(normalized.value.toLowerCase(), normalized);
    });

    allProducts.forEach((product) => {
        const normalized = normalizeBrandOption(product?.brand);
        if (normalized && !brandMap.has(normalized.value.toLowerCase())) {
            brandMap.set(normalized.value.toLowerCase(), normalized);
        }
    });

    return [...brandMap.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

function getMergedCategoryOptions() {
    const categoryMap = new Map();

    DEFAULT_CATEGORIES.forEach((category) => {
        const normalized = normalizeCategoryOption(category);
        if (normalized) categoryMap.set(normalized.value, normalized);
    });

    allCategories.forEach((category) => {
        const normalized = normalizeCategoryOption(category);
        if (normalized) categoryMap.set(normalized.value, normalized);
    });

    allProducts.forEach((product) => {
        const normalized = normalizeCategoryOption(product?.category);
        if (normalized && !categoryMap.has(normalized.value)) {
            categoryMap.set(normalized.value, normalized);
        }
    });

    return [...categoryMap.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

function renderCheckboxFilters(containerId, filterType, options, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!options.length) {
        container.innerHTML = `<p class="text-sm text-slate-400">${emptyMessage}</p>`;
        return;
    }

    container.innerHTML = options.map((option) => {
        const checked = currentFilters[filterType].includes(option.value);
        return `
            <label class="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                    type="checkbox"
                    value="${option.value}"
                    data-filter="${filterType === 'categories' ? 'category' : 'brand'}"
                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    ${checked ? 'checked' : ''}
                />
                <span class="text-sm font-medium text-slate-700">${option.label}</span>
            </label>
        `;
    }).join('');
}

function renderDynamicFilters() {
    renderCheckboxFilters('category-filters', 'categories', getMergedCategoryOptions(), 'Chưa có danh mục.');
    renderCheckboxFilters('brand-filters', 'brands', getMergedBrandOptions(), 'Chưa có nhãn hàng.');
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadAllProducts() {
    try {
        allProducts = await getCachedCollectionData('products', { ttlMs: 5 * 60 * 1000 });
        console.log(`✅ Loaded ${allProducts.length} products from Firestore`);
        return allProducts;
    } catch (error) {
        console.error('❌ Error loading products:', error);
        return [];
    }
}

async function loadBrands() {
    try {
        allBrands = await getCachedCollectionData('brands', { ttlMs: 30 * 60 * 1000 });
        return allBrands;
    } catch (error) {
        console.warn('Error loading brands, fallback to product data:', error);
        return [];
    }
}

async function loadCategories() {
    try {
        allCategories = await getCachedCollectionData('categories', { ttlMs: 30 * 60 * 1000 });
        return allCategories;
    } catch (error) {
        console.warn('Error loading categories, fallback to product data:', error);
        return [];
    }
}

// ============================================================================
// FILTERING
// ============================================================================

function applyFilters() {
    let filtered = [...allProducts];

    // Filter by search term
    if (currentFilters.searchTerm) {
        const searchLower = currentFilters.searchTerm.toLowerCase();
        filtered = filtered.filter(p => {
            const nameMatch = p.name?.toLowerCase().includes(searchLower);
            const brandMatch = p.brand?.toLowerCase().includes(searchLower);
            const categoryMatch = p.category?.toLowerCase().includes(searchLower);
            const descMatch = p.description?.toLowerCase().includes(searchLower);
            return nameMatch || brandMatch || categoryMatch || descMatch;
        });
    }

    // Filter by category
    if (currentFilters.categories.length > 0) {
        filtered = filtered.filter(p => currentFilters.categories.includes(p.category));
    }

    // Filter by brand
    if (currentFilters.brands.length > 0) {
        filtered = filtered.filter(p => 
            currentFilters.brands.some(brand => 
                p.brand && p.brand.toLowerCase() === brand.toLowerCase()
            )
        );
    }

    // Filter by gender
    if (currentFilters.genders.length > 0) {
        filtered = filtered.filter(p => {
            // Unisex products appear in all gender filters
            if (p.gender === 'unisex') return true;
            return currentFilters.genders.includes(p.gender);
        });
    }

    // Filter by size
    if (currentFilters.sizes.length > 0) {
        filtered = filtered.filter(p => {
            if (!p.sizes) return false;
            return currentFilters.sizes.some(size => p.sizes.includes(parseInt(size)));
        });
    }

    // Filter by price range
    filtered = filtered.filter(p => 
        p.price >= currentFilters.priceMin && 
        p.price <= currentFilters.priceMax
    );

    // Apply sorting
    filtered = applySort(filtered);
    
    return filtered;
}

function applySort(products) {
    const sorted = [...products];
    
    switch(currentSort) {
        case 'price-asc':
            return sorted.sort((a, b) => a.price - b.price);
        case 'price-desc':
            return sorted.sort((a, b) => b.price - a.price);
        case 'newest':
            return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        case 'popular':
        default:
            return sorted.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    }
}

function updateFilterFromCheckbox(type, value, isChecked) {
    if (isChecked) {
        if (!currentFilters[type].includes(value)) {
            currentFilters[type].push(value);
        }
    } else {
        currentFilters[type] = currentFilters[type].filter(v => v !== value);
    }
    
    const filtered = applyFilters();
    renderProducts(filtered);
}

// ============================================================================
// STOCK MANAGEMENT
// ============================================================================

function getInventoryTotal(inventory) {
    if (!inventory || typeof inventory !== 'object') return 0;

    return Object.values(inventory).reduce((colorTotal, sizeMap) => {
        if (!sizeMap || typeof sizeMap !== 'object') return colorTotal;
        return colorTotal + Object.values(sizeMap).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
    }, 0);
}

function getProductTotalStock(product) {
    const inventoryTotal = getInventoryTotal(product?.inventory);
    if (inventoryTotal > 0 || (product?.inventory && Object.keys(product.inventory).length > 0)) {
        return inventoryTotal;
    }

    const stock = parseInt(product?.stock);
    if (!Number.isNaN(stock)) return stock;
    return parseInt(product?.quantity) || 0;
}

function isProductOutOfStock(product) {
    return getProductTotalStock(product) === 0;
}

// ============================================================================
// RENDERING
// ============================================================================

function renderProducts(products) {
    const container = document.getElementById('products-container');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-20">
                <span class="material-symbols-outlined text-6xl text-gray-300 mb-4">shopping_bag</span>
                <p class="text-xl font-bold text-gray-500">Không tìm thấy sản phẩm nào</p>
                <p class="text-gray-400 mt-2">Thử điều chỉnh bộ lọc của bạn</p>
            </div>
        `;
        // Hide pagination
        renderPagination(0);
        return;
    }

    // Calculate pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedProducts = products.slice(startIndex, endIndex);
    
    // Render paginated products
    container.innerHTML = paginatedProducts.map(product => {
        const mainImage = Array.isArray(product.images) && product.images.length > 0 
            ? product.images[0] 
            : 'image/coming_soon.png';
        
        const discountPercent = product.discount || 0;
        const hasDiscount = discountPercent > 0;
        const isOutOfStock = isProductOutOfStock(product);
        
        // Out of stock product styling
        const outOfStockClass = isOutOfStock ? 'opacity-60 pointer-events-none' : '';
        const productImageClass = isOutOfStock ? 'group-hover:scale-100' : 'group-hover:scale-110';

        return `
            <div class="group relative flex flex-col ${outOfStockClass}">
                <div class="relative aspect-square bg-[#f3f3f3] dark:bg-[#2a1a1b] rounded-xl overflow-hidden mb-4">
                    ${isOutOfStock ? `<div class="absolute inset-0 bg-black/40 z-10 flex items-center justify-center">
                        <div class="text-center">
                            <span class="material-symbols-outlined text-5xl text-white mb-2">block</span>
                            <p class="text-white font-bold text-lg">Hết Hàng</p>
                        </div>
                    </div>` : ''}
                    <a href="${isOutOfStock ? '#' : `Product-detail.html?id=${product.id}`}" ${isOutOfStock ? 'onclick="return false"' : ''}>
                        <img class="w-full h-full object-contain p-8 transition-transform duration-500 ${productImageClass}" 
                             src="${mainImage}"
                             alt="${product.name}"
                             onerror="if(this.src!='image/coming_soon.png'){this.src='image/coming_soon.png'}"/>
                    </a>
                    ${isOutOfStock ? `<div class="absolute top-4 left-4 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">HẾT HÀNG</div>` : ''}
                    ${!isOutOfStock && hasDiscount ? `<div class="absolute top-4 left-4 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded">${discountPercent}% OFF</div>` : ''}
                    ${!isOutOfStock && product.isNew ? `<div class="absolute top-4 left-4 bg-black text-white text-[10px] font-bold px-2 py-1 rounded">MỚI</div>` : ''}
                    ${!isOutOfStock ? `<button type="button" class="quick-add-btn absolute bottom-4 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-bold px-6 py-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 w-[80%] whitespace-nowrap" data-product-id="${product.id}">
                        THÊM NHANH
                    </button>` : ''}
                </div>
                <div class="flex flex-col gap-1">
                    <p class="text-gray-500 text-xs font-semibold uppercase tracking-wider">${product.brand || 'Brand'}</p>
                    <a href="${isOutOfStock ? '#' : `Product-detail.html?id=${product.id}`}" ${isOutOfStock ? 'onclick="return false"' : ''}>
                        <h3 class="text-base font-bold text-gray-900 dark:text-white leading-tight hover:text-primary transition-colors">${product.name}</h3>
                    </a>
                    <div class="flex items-center gap-2 mt-1">
                        <p class="text-primary font-bold text-lg">${formatPrice(product.price)}</p>
                        ${!isOutOfStock && hasDiscount && product.originalPrice ? `<span class="text-gray-400 line-through text-sm">${formatPrice(product.originalPrice)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Quick add behavior: add directly to cart without redirecting to detail page.
    container.querySelectorAll('.quick-add-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const productId = btn.dataset.productId;
            const product = paginatedProducts.find((item) => item.id === productId);
            if (!product) return;

            const maxStock = getProductTotalStock(product);
            if (maxStock <= 0) {
                window.showToast?.('Sản phẩm này đã hết hàng', 'warning');
                return;
            }

            const mainImage = Array.isArray(product.images) && product.images.length > 0
                ? product.images[0]
                : 'image/coming_soon.png';

            const defaultSize = Array.isArray(product.sizes) && product.sizes.length > 0
                ? String(typeof product.sizes[0] === 'object' ? product.sizes[0].value : product.sizes[0])
                : 'Free Size';

            window.addToCart?.({
                id: product.id,
                name: product.name,
                price: parseInt(product.price) || 0,
                image: mainImage,
                size: defaultSize,
                color: '',
                maxStock
            });
        });
    });
    
    // Render pagination controls
    renderPagination(products.length);
}

function renderLoadingSkeleton() {
    const container = document.getElementById('products-container');
    if (!container) return;

    const skeletonHTML = Array(8).fill(0).map(() => `
        <div class="flex flex-col">
            <div class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-xl mb-4 skeleton"></div>
            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2 skeleton"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2 skeleton"></div>
            <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2 skeleton"></div>
        </div>
    `).join('');

    container.innerHTML = skeletonHTML;
}

// ============================================================================
// UTILITY
// ============================================================================

function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(price);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 Initializing product listing page...');
    
    // Show loading
    renderLoadingSkeleton();

    // Load data
    await Promise.all([
        loadAllProducts(),
        loadBrands(),
        loadCategories()
    ]);

    renderDynamicFilters();

    // Setup event listeners for filters
    setupFilterListeners();
    
    // Setup search functionality
    setupSearchFunctionality();
    
    // Check for URL params (search or other filters)
    loadFromURLParams();

    // Initial render (will be updated by loadFromURLParams if search param exists)
    if (!currentFilters.searchTerm) {
        renderProducts(allProducts);
    }

    console.log('✅ Product listing page initialized');
}

function setupFilterListeners() {
    // Category filters
    document.querySelectorAll('input[data-filter="category"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            updateFilterFromCheckbox('categories', e.target.value, e.target.checked);
        });
    });

    // Brand filters
    document.querySelectorAll('input[data-filter="brand"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            updateFilterFromCheckbox('brands', e.target.value, e.target.checked);
        });
    });

    // Gender filters
    document.querySelectorAll('input[data-filter="gender"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            updateFilterFromCheckbox('genders', e.target.value, e.target.checked);
        });
    });

    // Clear filters button
    const clearBtn = document.querySelector('button[data-action="clear-filters"]');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            // Reset all checkboxes
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            
            // Reset dual range sliders
            const priceMin = document.getElementById('price-min');
            const priceMax = document.getElementById('price-max');
            const priceDisplay = document.getElementById('price-display');
            const priceRangeTrack = document.getElementById('price-range-track');
            
            if (priceMin) priceMin.value = 0;
            if (priceMax) priceMax.value = MAX_PRICE;
            if (priceDisplay) priceDisplay.textContent = '0₫ - 5.000.000₫';
            if (priceRangeTrack) {
                priceRangeTrack.style.left = '0%';
                priceRangeTrack.style.right = '0%';
            }

            // Reset filters
            currentFilters = {
                categories: [],
                brands: [],
                genders: [],
                sizes: [],
                priceMin: 0,
                priceMax: MAX_PRICE,
                searchTerm: ''
            };

            renderProducts(allProducts);
        });
    }

    // Dual Range Price Slider
    const priceMin = document.getElementById('price-min');
    const priceMax = document.getElementById('price-max');
    const priceDisplay = document.getElementById('price-display');
    const priceRangeTrack = document.getElementById('price-range-track');
    
    if (priceMin && priceMax && priceDisplay && priceRangeTrack) {
        priceMin.max = String(MAX_PRICE);
        priceMax.max = String(MAX_PRICE);
        priceMax.value = String(Math.min(parseInt(priceMax.value) || MAX_PRICE, MAX_PRICE));
        const maxPrice = MAX_PRICE;
        
        function updatePriceRange() {
            let minVal = parseInt(priceMin.value);
            let maxVal = parseInt(priceMax.value);
            
            // Prevent min from exceeding max
            if (minVal > maxVal - 100000) {
                minVal = maxVal - 100000;
                priceMin.value = minVal;
            }
            
            // Update filters
            currentFilters.priceMin = minVal;
            currentFilters.priceMax = maxVal;
            
            // Update display
            priceDisplay.textContent = `${formatPrice(minVal)} - ${formatPrice(maxVal)}`;
            
            // Update visual track
            const percentMin = (minVal / maxPrice) * 100;
            const percentMax = (maxVal / maxPrice) * 100;
            priceRangeTrack.style.left = percentMin + '%';
            priceRangeTrack.style.right = (100 - percentMax) + '%';
            
            // Apply filter
            const filtered = applyFilters();
            renderProducts(filtered);
        }
        
        priceMin.addEventListener('input', updatePriceRange);
        priceMax.addEventListener('input', updatePriceRange);
        
        // Set initial state
        updatePriceRange();
    }

    // Sort dropdown
    setupSortDropdown();

    // Pagination
    setupPagination();
}

function setupSortDropdown() {
    const sortButton = document.querySelector('.relative.inline-block button');
    if (!sortButton) return;
    
    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'absolute right-0 mt-2 w-56 bg-white dark:bg-background-dark border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10 hidden';
    dropdown.innerHTML = `
        <button data-sort="popular" class="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
            Phổ biến nhất
        </button>
        <button data-sort="price-asc" class="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
            Giá: Thấp đến Cao
        </button>
        <button data-sort="price-desc" class="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
            Giá: Cao đến Thấp
        </button>
        <button data-sort="newest" class="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
            Mới nhất
        </button>
    `;
    
    sortButton.parentElement.appendChild(dropdown);
    
    // Toggle dropdown
    sortButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.classList.add('hidden');
    });
    
    // Handle sort selection
    dropdown.querySelectorAll('[data-sort]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentSort = e.target.dataset.sort;
            
            // Update button text
            sortButton.childNodes[0].textContent = e.target.textContent.trim() + ' ';
            
            // Hide dropdown
            dropdown.classList.add('hidden');
            
            // Re-render with new sort
            const filtered = applyFilters();
            renderProducts(filtered);
        });
    });
}

function setupPagination() {
    // Initial render will show pagination
    // Pagination is rendered dynamically in renderProducts
}

function renderPagination(totalItems) {
    const paginationContainer = document.querySelector('.mt-16.flex.items-center');
    if (!paginationContainer) return;
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    let paginationHTML = `
        <button class="pagination-prev flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}">
            <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <div class="flex items-center gap-2">
    `;
    
    // Show first page
    paginationHTML += `<button class="pagination-num w-10 h-10 rounded-lg font-bold text-sm ${currentPage === 1 ? 'bg-black text-white' : 'border border-transparent hover:border-gray-200 dark:hover:border-gray-800'}" data-page="1">1</button>`;
    
    if (currentPage > 3) {
        paginationHTML += `<span class="px-2 text-gray-400">...</span>`;
    }
    
    // Show pages around current
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        paginationHTML += `<button class="pagination-num w-10 h-10 rounded-lg font-bold text-sm ${currentPage === i ? 'bg-black text-white' : 'border border-transparent hover:border-gray-200 dark:hover:border-gray-800'}" data-page="${i}">${i}</button>`;
    }
    
    if (currentPage < totalPages - 2) {
        paginationHTML += `<span class="px-2 text-gray-400">...</span>`;
    }
    
    // Show last page
    if (totalPages > 1) {
        paginationHTML += `<button class="pagination-num w-10 h-10 rounded-lg font-bold text-sm ${currentPage === totalPages ? 'bg-black text-white' : 'border border-transparent hover:border-gray-200 dark:hover:border-gray-800'}" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    paginationHTML += `
        </div>
        <button class="pagination-next flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}">
            <span class="material-symbols-outlined">chevron_right</span>
        </button>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
    
    // Add event listeners
    paginationContainer.querySelector('.pagination-prev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            const filtered = applyFilters();
            renderProducts(filtered);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    paginationContainer.querySelector('.pagination-next').addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            const filtered = applyFilters();
            renderProducts(filtered);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    paginationContainer.querySelectorAll('.pagination-num').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page);
            const filtered = applyFilters();
            renderProducts(filtered);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// Run on page load
document.addEventListener('DOMContentLoaded', init);

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

function setupSearchFunctionality() {
    const searchInput = document.getElementById('product-search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const clearSearchFilterBtn = document.getElementById('clear-search-filter-btn');
    const recentSearchesSection = document.getElementById('recent-searches-section');
    const recentSearchesList = document.getElementById('recent-searches-list');
    const clearRecentBtn = document.getElementById('clear-recent-btn');
    const trendingTags = document.querySelectorAll('.trending-tag');
    const activeSearchInfo = document.getElementById('active-search-info');
    const searchTermDisplay = document.getElementById('search-term-display');
    const searchSuggestions = document.getElementById('search-suggestions');

    if (!searchInput) return;

    // Display recent searches on load
    displayRecentSearches();

    // Search input handler with debounce
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        
        // Show/hide clear button
        if (searchTerm) {
            clearSearchBtn?.classList.remove('hidden');
        } else {
            clearSearchBtn?.classList.add('hidden');
        }

        // Debounce search
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        searchTimeout = setTimeout(() => {
            performSearch(searchTerm);
        }, 500);
    });

    // Enter key to search immediately
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            const searchTerm = searchInput.value.trim();
            performSearch(searchTerm);
        }
    });

    // Clear search button
    clearSearchBtn?.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        currentFilters.searchTerm = '';
        activeSearchInfo?.classList.add('hidden');
        searchSuggestions?.classList.remove('hidden');
        updateURL();
        const filtered = applyFilters();
        renderProducts(filtered);
        searchInput.focus();
    });

    // Clear search filter (from active search info)
    clearSearchFilterBtn?.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn?.classList.add('hidden');
        currentFilters.searchTerm = '';
        activeSearchInfo?.classList.add('hidden');
        searchSuggestions?.classList.remove('hidden');
        updateURL();
        const filtered = applyFilters();
        renderProducts(filtered);
    });

    // Clear recent searches
    clearRecentBtn?.addEventListener('click', () => {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
        displayRecentSearches();
        if (window.showToast) {
            window.showToast('Đã xóa lịch sử tìm kiếm', 'success');
        }
    });

    // Trending tags click
    trendingTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const searchTerm = tag.textContent.trim();
            searchInput.value = searchTerm;
            clearSearchBtn?.classList.remove('hidden');
            performSearch(searchTerm);
        });
    });

    // Recent search tags (will be added dynamically)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.recent-search-tag')) {
            const tag = e.target.closest('.recent-search-tag');
            const searchTerm = tag.textContent.trim();
            searchInput.value = searchTerm;
            clearSearchBtn?.classList.remove('hidden');
            performSearch(searchTerm);
        }
    });
}

function performSearch(searchTerm) {
    const activeSearchInfo = document.getElementById('active-search-info');
    const searchTermDisplay = document.getElementById('search-term-display');
    const searchSuggestions = document.getElementById('search-suggestions');

    if (!searchTerm) {
        currentFilters.searchTerm = '';
        activeSearchInfo?.classList.add('hidden');
        searchSuggestions?.classList.remove('hidden');
        updateURL();
        const filtered = applyFilters();
        renderProducts(filtered);
        return;
    }

    // Save to recent searches
    saveRecentSearch(searchTerm);

    // Update filter
    currentFilters.searchTerm = searchTerm;
    
    // Show active search info
    if (activeSearchInfo && searchTermDisplay) {
        searchTermDisplay.textContent = searchTerm;
        activeSearchInfo.classList.remove('hidden');
    }

    // Hide suggestions
    searchSuggestions?.classList.add('hidden');

    // Update URL
    updateURL();

    // Reset to first page
    currentPage = 1;

    // Apply filter and render
    const filtered = applyFilters();
    renderProducts(filtered);

    // Update recent searches display
    displayRecentSearches();
}

function saveRecentSearch(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) return;

    let recentSearches = getRecentSearches();
    
    // Remove duplicate if exists
    recentSearches = recentSearches.filter(term => term.toLowerCase() !== searchTerm.toLowerCase());
    
    // Add to beginning
    recentSearches.unshift(searchTerm);
    
    // Limit to MAX_RECENT_SEARCHES
    recentSearches = recentSearches.slice(0, MAX_RECENT_SEARCHES);
    
    // Save to localStorage
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
}

function getRecentSearches() {
    try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY) || localStorage.getItem('x-sneaker-product-recent-searches');
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error loading recent searches:', error);
        return [];
    }
}

function displayRecentSearches() {
    const recentSearchesSection = document.getElementById('recent-searches-section');
    const recentSearchesList = document.getElementById('recent-searches-list');
    
    if (!recentSearchesList) return;

    const recentSearches = getRecentSearches();

    if (recentSearches.length === 0) {
        recentSearchesSection?.classList.add('hidden');
        return;
    }

    recentSearchesSection?.classList.remove('hidden');

    recentSearchesList.innerHTML = recentSearches.map(term => `
        <button class="recent-search-tag group w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 text-xs font-semibold hover:bg-primary hover:text-white transition-all shadow-sm text-left flex items-center justify-between border border-gray-200 dark:border-gray-600">
            <span class="flex items-center gap-2 truncate">
                <span class="material-symbols-outlined text-sm">schedule</span>
                <span class="truncate">${term}</span>
            </span>
            <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">arrow_forward</span>
        </button>
    `).join('');
}

function loadFromURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    
    if (searchParam) {
        const searchInput = document.getElementById('product-search-input');
        const clearSearchBtn = document.getElementById('clear-search-btn');
        
        if (searchInput) {
            searchInput.value = searchParam;
            clearSearchBtn?.classList.remove('hidden');
        }
        
        performSearch(searchParam);
    }
}

function updateURL() {
    const params = new URLSearchParams();
    
    if (currentFilters.searchTerm) {
        params.set('search', currentFilters.searchTerm);
    }
    
    const newURL = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    
    window.history.replaceState({}, '', newURL);
}

console.log('✅ Product module loaded');
