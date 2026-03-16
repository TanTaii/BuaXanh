// Product Detail Page Logic for Bua Xanh
// Handles product loading, gallery, options, cart, and related products

import { getFirebaseAuth, getFirebaseFirestore } from '../firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getCachedCollectionData, getCachedDocData } from '../firestore-cache.js';
import { initProductReviews } from './product-reviews.js';

// Get Firebase instances
const auth = getFirebaseAuth();
const database = getFirebaseFirestore();

// Global state
let currentProduct = null;
let selectedColor = null;
let selectedSize = null;
let currentImageIndex = 0;
let relatedProducts = []; // Store all related products
let relatedProductsStartIndex = 0; // Current carousel position

const CATEGORY_LABELS = {
    'tuoi-song': 'Thực phẩm tươi sống',
    'che-bien-san': 'Thực phẩm chế biến sẵn',
    'do-hop': 'Đồ hộp',
    'dong-lanh': 'Thực phẩm đông lạnh',
    'kho-gia-vi': 'Đồ khô & gia vị',
    'do-uong': 'Đồ uống'
};

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

function getSelectedVariantStock() {
    if (!currentProduct || !selectedColor || !selectedSize) return 0;

    const inventory = currentProduct.inventory || {};
    if (inventory[selectedColor] && inventory[selectedColor][selectedSize] != null) {
        return parseInt(inventory[selectedColor][selectedSize]) || 0;
    }

    return getProductTotalStock(currentProduct);
}

function normalizeVariantKeyPart(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getVariantPrice(product, color, size) {
    if (!product) return 0;

    const basePrice = parseInt(product.price) || 0;
    const variantPrices = product.variantPrices;
    const colorValue = String(color || '').trim();
    const sizeValue = String(size || '').trim();

    // Legacy format support: inventory[color][size] = { quantity, price }
    const legacyInventoryVariant = product.inventory?.[colorValue]?.[sizeValue];
    if (legacyInventoryVariant && typeof legacyInventoryVariant === 'object') {
        const legacyPrice = parseInt(legacyInventoryVariant.price);
        if (!Number.isNaN(legacyPrice) && legacyPrice >= 0) {
            return legacyPrice;
        }
    }

    if (!variantPrices || typeof variantPrices !== 'object') return basePrice;

    // Preferred flat map: { "color|size": price }
    const directKey = `${colorValue}|${sizeValue}`;
    const directPrice = parseInt(variantPrices[directKey]);
    if (!Number.isNaN(directPrice) && directPrice >= 0) {
        return directPrice;
    }

    // Support nested format: { color: { size: price } }
    const nestedPrice = parseInt(variantPrices?.[colorValue]?.[sizeValue]);
    if (!Number.isNaN(nestedPrice) && nestedPrice >= 0) {
        return nestedPrice;
    }

    // Fallback: tolerant key matching (spacing/case/diacritics differences)
    const normalizedColor = normalizeVariantKeyPart(colorValue);
    const normalizedSize = normalizeVariantKeyPart(sizeValue);
    for (const [key, value] of Object.entries(variantPrices)) {
        const [keyColor = '', keySize = ''] = String(key).split('|');
        if (
            normalizeVariantKeyPart(keyColor) === normalizedColor &&
            normalizeVariantKeyPart(keySize) === normalizedSize
        ) {
            const matchedPrice = parseInt(value);
            if (!Number.isNaN(matchedPrice) && matchedPrice >= 0) {
                return matchedPrice;
            }
        }
    }

    return basePrice;
}

function getSelectedVariantPrice() {
    if (!currentProduct) return 0;
    if (!selectedColor || !selectedSize) return parseInt(currentProduct.price) || 0;
    return getVariantPrice(currentProduct, selectedColor, selectedSize);
}

function updateProductPriceDisplay() {
    const priceContainer = document.getElementById('product-price');
    if (!priceContainer || !currentProduct) return;

    const displayPrice = getSelectedVariantPrice();
    const originalPrice = parseInt(currentProduct.originalPrice) || 0;

    if (originalPrice > displayPrice) {
        priceContainer.innerHTML = `
            <span class="text-primary text-3xl font-bold">${formatPrice(displayPrice)}</span>
            <span class="text-gray-400 line-through text-lg">${formatPrice(originalPrice)}</span>
        `;
        return;
    }

    priceContainer.innerHTML = `
        <span class="text-primary text-3xl font-bold">${formatPrice(displayPrice)}</span>
    `;
}

function formatCategoryLabel(categoryValue) {
    const normalized = String(categoryValue || '').trim();
    if (!normalized) return 'Danh mục khác';
    if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];

    return normalized
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function syncPurchaseState() {
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    if (!addToCartBtn) return;

    const totalStock = getProductTotalStock(currentProduct);
    const selectedStock = getSelectedVariantStock();
    const hasVariantSelection = Boolean(selectedColor && selectedSize);
    const isSoldOut = totalStock === 0;
    const isDisabled = isSoldOut || !hasVariantSelection || selectedStock <= 0;

    addToCartBtn.disabled = isDisabled;
    addToCartBtn.classList.toggle('opacity-60', isDisabled);
    addToCartBtn.classList.toggle('cursor-not-allowed', isDisabled);

    if (isSoldOut) {
        addToCartBtn.innerHTML = '<span class="material-symbols-outlined">block</span> Hết Hàng';
        return;
    }

    if (!hasVariantSelection) {
        addToCartBtn.innerHTML = '<span class="material-symbols-outlined">rule</span> Chọn Biến Thể';
        return;
    }

    if (selectedStock <= 0) {
        addToCartBtn.innerHTML = '<span class="material-symbols-outlined">block</span> Hết Hàng';
        return;
    }

    addToCartBtn.innerHTML = '<span class="material-symbols-outlined">shopping_cart</span> Thêm Vào Giỏ';
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Get product ID from URL parameter
 */
function getProductIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

/**
 * Get blog ID from URL parameter (if coming from blog)
 */
function getBlogIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('blog');
}

/**
 * Load product by ID from Firebase
 */
async function loadProductById(productId) {
    try {
        const productData = await getCachedDocData('products', productId, {
            ttlMs: 5 * 60 * 1000,
            forceRefresh: true
        });
        if (productData) {
            console.log('✅ Product loaded:', productData);
            return productData;
        } else {
            console.warn('⚠️ Product not found:', productId);
            return null;
        }
    } catch (error) {
        console.error('❌ Error loading product:', error);
        return null;
    }
}

/**
 * Load featured products from a specific blog
 */
async function loadFeaturedProductsFromBlog(blogId, currentProductId, limit = 6) {
    try {
        const blogSnap = await getDoc(doc(database, 'blogs', blogId));
        if (!blogSnap.exists()) {
            return await loadRelatedProducts('', currentProductId, limit);
        }
        const blogData = blogSnap.data();
        if (!blogData.featuredProducts || blogData.featuredProducts.length === 0) {
            return await loadRelatedProducts('', currentProductId, limit);
        }
        const cachedProducts = await getCachedCollectionData('products', { ttlMs: 5 * 60 * 1000 });
        const productsData = {};
        cachedProducts.forEach(product => { productsData[product.id] = product; });
        const featuredProducts = blogData.featuredProducts
            .filter(productId => productId !== currentProductId)
            .map(productId => {
                const product = productsData[productId];
                return product ? { id: productId, ...product } : null;
            })
            .filter(p => p !== null);
        if (featuredProducts.length >= 3) return featuredProducts.slice(0, limit);
        const allProducts = Object.keys(productsData)
            .map(key => ({ id: key, ...productsData[key] }))
            .filter(p => p.id !== currentProductId && !featuredProducts.find(fp => fp.id === p.id));
        const shuffled = allProducts.sort(() => 0.5 - Math.random());
        return [...featuredProducts, ...shuffled.slice(0, limit - featuredProducts.length)].slice(0, limit);
    } catch (error) {
        console.error('❌ Error loading featured products from blog:', error);
        return await loadRelatedProducts('', currentProductId, limit);
    }
}

/**
 * Load related products from same category
 */
async function loadRelatedProducts(category, currentProductId, limit = 6) {
    try {
        const allProducts = (await getCachedCollectionData('products', { ttlMs: 5 * 60 * 1000 }))
            .filter(p => p.id !== currentProductId);
        const shuffled = allProducts.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, limit);
    } catch (error) {
        console.error('❌ Error loading other products:', error);
        return [];
    }
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render product data to page
 */
function renderProductData(product) {
    currentProduct = product;

    const detailsContainer = document.getElementById('product-details-list');
    if (detailsContainer) {
        detailsContainer.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <div class="text-sm text-slate-600">Phân loại đã chọn: <span id="selected-color-name" class="font-bold text-slate-900">-</span></div>
            </div>
            <div>
                <div class="text-sm font-semibold text-slate-700 mb-3">Quy cách đóng gói</div>
                <div id="size-container" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
            </div>
        `;
    }
    
    // Update product name
    const nameEl = document.getElementById('product-name');
    if (nameEl) nameEl.textContent = product.name;
    
    // Update description
    const descEl = document.getElementById('product-description');
    if (descEl) descEl.textContent = product.description || 'Thực phẩm chất lượng, sẵn sàng giao đến bạn.';
    
    updateProductPriceDisplay();
    
    // Update breadcrumb
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    if (breadcrumbsContainer) {
        const categoryValue = product.category || '';
        const categoryLabel = formatCategoryLabel(categoryValue);
        breadcrumbsContainer.innerHTML = `
            <a class="text-gray-500 hover:text-primary transition-colors font-medium" href="index.html">Trang chủ</a>
            <span class="text-gray-400">/</span>
            <a class="text-gray-500 hover:text-primary transition-colors font-medium" href="Product.html">Sản phẩm</a>
            <span class="text-gray-400">/</span>
            <a class="text-gray-500 hover:text-primary transition-colors font-medium" href="Product.html?category=${encodeURIComponent(categoryValue)}">${categoryLabel}</a>
            <span class="text-gray-400">/</span>
            <span class="text-[#1b0e0f] dark:text-white font-bold">${product.name}</span>
        `;
    }
    
    // Update gender info
    const genderContainer = document.getElementById('gender-info');
    if (genderContainer && product.gender) {
        const genderMap = {
            'male': 'Nam',
            'female': 'Nữ',
            'unisex': 'Unisex'
        };
        const genderDisplay = genderMap[product.gender] || 'Unisex';
        genderContainer.innerHTML = `
            <div class="flex items-center gap-2 text-sm">
                <span class="material-symbols-outlined text-gray-400">person</span>
                <span class="text-gray-500 dark:text-gray-400">Giới tính:</span>
                <span class="font-semibold text-[#1b0e0f] dark:text-white">${genderDisplay}</span>
            </div>
        `;
    }
    
    // Update badges and rating
    const badgesContainer = document.getElementById('product-badges');
    if (badgesContainer) {
        const isNew = product.isNew || false;
        const rating = product.averageRating || 0;
        const reviewCount = product.reviewCount || 0;
        
        let badgesHTML = '';
        if (isNew) {
            badgesHTML += '<span class="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Hàng Mới</span>';
        }
        
        if (rating > 0) {
            const fullStars = Math.floor(rating);
            const hasHalfStar = rating % 1 >= 0.5;
            const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
            
            badgesHTML += `
                <div class="flex items-center text-amber-500">
                    ${Array(fullStars).fill('<span class="material-symbols-outlined text-sm">star</span>').join('')}
                    ${hasHalfStar ? '<span class="material-symbols-outlined text-sm">star_half</span>' : ''}
                    ${Array(emptyStars).fill('<span class="material-symbols-outlined text-sm text-gray-300">star</span>').join('')}
                    <span class="text-xs text-gray-500 dark:text-gray-400 ml-1 font-medium">(${reviewCount} Đánh giá)</span>
                </div>
            `;
        }
        
        badgesContainer.innerHTML = badgesHTML;
    }
    
    // Render main image container first
    const mainImageContainer = document.getElementById('main-image-container');
    if (mainImageContainer && !mainImageContainer.querySelector('.main-product-image')) {
        mainImageContainer.innerHTML = `
            <div class="main-product-image w-full h-full bg-center bg-no-repeat bg-cover hover:scale-105 transition-transform duration-500 cursor-zoom-in" 
                 style="background-image: url('');"
                 data-alt="${product.name}"></div>
        `;
    }
    
    // Render color variants first
    renderColorVariants(product.colors || []);
    syncPurchaseState();
    
    // Sizes will be rendered after color selection
}

/**
 * Render color variants
 */
function renderColorVariants(colors) {
    if (!colors || colors.length === 0) return;

    // Set first color as selected
    if (colors.length > 0) {
        selectedColor = colors[0];
        updateSelectedColorName(selectedColor);
        loadImagesForColor(selectedColor);
        renderColorThumbnails();
        renderSizesForColor(selectedColor);
    }
}

/**
 * Render color thumbnails
 */
function renderColorThumbnails() {
    if (!currentProduct) return;
    
    const container = document.getElementById('color-thumbnails-container');
    if (!container) return;
    
    const colors = currentProduct.colors || [];
    const colorImages = currentProduct.colorImages || {};
    const defaultImages = currentProduct.images || [];
    
    if (colors.length === 0) return;
    
    const colorMap = {
        'Đen': '#000000',
        'Trắng': '#FFFFFF',
        'Đỏ': '#E30B17',
        'Xanh Navy': '#1E3A8A',
        'Vàng': '#FACC15'
    };
    
    container.innerHTML = colors.map((colorName) => {
        // Get image for this color
        let thumbnailImage = '';
        if (colorImages[colorName]) {
            thumbnailImage = colorImages[colorName];
        } else if (defaultImages.length > 0) {
            thumbnailImage = defaultImages[0];
        }
        
        const isSelected = selectedColor === colorName;
        const colorValue = colorMap[colorName] || '#666666';
        
        return `
            <div class="color-thumbnail relative cursor-pointer group" data-color="${colorName}">
                <div class="aspect-square bg-white dark:bg-gray-800 rounded-lg overflow-hidden border-2 ${
                    isSelected ? 'border-primary shadow-lg' : 'border-gray-200 dark:border-gray-700 hover:border-primary'
                } transition-all">
                    ${thumbnailImage ? `
                        <div class="w-full h-full bg-center bg-no-repeat bg-cover"
                             style='background-image: url("${thumbnailImage}");'
                             data-alt="${currentProduct.name} - ${colorName}"></div>
                    ` : `
                        <div class="w-full h-full flex items-center justify-center text-gray-400">
                            <span class="material-symbols-outlined">image</span>
                        </div>
                    `}
                </div>
                <div class="mt-2 flex items-center justify-center gap-2">
                    <div class="w-4 h-4 rounded-full border border-gray-300" 
                         style="background-color: ${colorValue}; ${colorValue === '#FFFFFF' ? 'border-width: 2px;' : ''}"></div>
                    <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">${colorName}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render sizes for selected color based on inventory
 */
function renderSizesForColor(color) {
    if (!currentProduct || !color) return;
    
    const sizeContainer = document.getElementById('size-container');
    if (!sizeContainer) return;
    
    const sizes = currentProduct.sizes || [];
    const inventory = currentProduct.inventory || {};
    const colorInventory = inventory[color] || {};
    const fallbackStock = getProductTotalStock(currentProduct);
    
    if (sizes.length === 0) {
        sizeContainer.innerHTML = '<p class="col-span-3 text-gray-500 text-sm">Không có quy cách</p>';
        return;
    }
    
    sizeContainer.innerHTML = sizes.map((size, index) => {
        const sizeValue = typeof size === 'object' ? size.value : size;
        const stock = colorInventory[sizeValue] != null ? (parseInt(colorInventory[sizeValue]) || 0) : fallbackStock;
        const isSoldOut = stock === 0;
        const isFirst = index === 0 && !isSoldOut;
        
        return `
            <button class="size-btn py-3 text-center border ${
                isFirst ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 dark:border-gray-700'
            } rounded-lg text-sm font-semibold hover:border-primary transition-all ${
                isSoldOut ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-900' : ''
            }"
                    data-size="${sizeValue}"
                    data-stock="${stock}"
                    ${isSoldOut ? 'disabled' : ''}>
                ${sizeValue}
                ${stock > 0 && stock <= 5 ? `<span class="block text-[10px] text-orange-500">Còn ${stock}</span>` : ''}
            </button>
        `;
    }).join('');
    
    // Set first available size as selected
    const firstAvailableSize = sizes.find(s => {
        const sizeValue = typeof s === 'object' ? s.value : s;
        const stock = colorInventory[sizeValue] != null ? (parseInt(colorInventory[sizeValue]) || 0) : fallbackStock;
        return stock > 0;
    });
    
    if (firstAvailableSize) {
        selectedSize = typeof firstAvailableSize === 'object' ? firstAvailableSize.value : firstAvailableSize;
    } else {
        selectedSize = null;
    }

    updateProductPriceDisplay();
    syncPurchaseState();
}

/**
 * Load images for selected color
 */
function loadImagesForColor(colorName) {
    if (!currentProduct) return;
    
    let imageToLoad = '';
    
    // Check if product has color-specific image
    if (currentProduct.colorImages && currentProduct.colorImages[colorName]) {
        imageToLoad = currentProduct.colorImages[colorName];
    } else if (currentProduct.images && currentProduct.images.length > 0) {
        imageToLoad = currentProduct.images[0];
    }
    
    if (imageToLoad) {
        const mainImageDiv = document.querySelector('.main-product-image');
        if (mainImageDiv) {
            // Show loading state
            mainImageDiv.style.opacity = '0.3';
            mainImageDiv.style.filter = 'blur(10px)';
            
            // Preload image
            const img = new Image();
            img.onload = () => {
                setTimeout(() => {
                    mainImageDiv.style.backgroundImage = `url("${imageToLoad}")`;
                    mainImageDiv.style.transition = 'all 0.4s ease-in-out';
                    mainImageDiv.style.opacity = '1';
                    mainImageDiv.style.filter = 'blur(0)';
                }, 100);
            };
            img.onerror = () => {
                // Fallback on error
                mainImageDiv.style.opacity = '1';
                mainImageDiv.style.filter = 'blur(0)';
            };
            img.src = imageToLoad;
        }
    }
}

/**
 * Update selected color name display
 */
function updateSelectedColorName(colorName) {
    const colorNameEl = document.getElementById('selected-color-name');
    if (colorNameEl) {
        colorNameEl.textContent = colorName;
    }
}

/**
 * Render related products
 */
function renderRelatedProducts(products) {
    relatedProducts = products;
    relatedProductsStartIndex = 0;
    renderRelatedProductsCarousel();
}

/**
 * Render carousel view (4 products at a time)
 */
function renderRelatedProductsCarousel() {
    const container = document.getElementById('related-products-container');
    if (!container) return;
    
    if (relatedProducts.length === 0) {
        container.innerHTML = '<p class="col-span-4 text-center text-gray-500">Không có sản phẩm liên quan</p>';
        return;
    }
    
    const visibleProducts = relatedProducts.slice(relatedProductsStartIndex, relatedProductsStartIndex + 4);
    
    container.innerHTML = visibleProducts.map(product => {
        const mainImage = Array.isArray(product.images) && product.images.length > 0
            ? product.images[0]
            : 'image/coming_soon.png';
        
        return `
            <div class="group cursor-pointer">
                <div class="aspect-square rounded-xl overflow-hidden mb-4 bg-gray-100 relative">
                    <a href="Product-detail.html?id=${product.id}">
                        <div class="w-full h-full bg-center bg-no-repeat bg-cover group-hover:scale-105 transition-transform duration-500" 
                             style='background-image: url("${mainImage}");'
                             data-alt="${product.name}"></div>
                    </a>
                    <button class="wishlist-btn absolute top-3 right-3 p-2 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" data-product-id="${product.id}">
                        <span class="material-symbols-outlined text-gray-800 text-lg">favorite</span>
                    </button>
                </div>
                <h4 class="font-bold text-[#1b0e0f] dark:text-white group-hover:text-primary transition-colors">${product.name}</h4>
                <p class="text-sm text-gray-500 mb-2">${product.category || 'Sneakers'}</p>
                <span class="font-bold text-lg">${formatPrice(product.price)}</span>
            </div>
        `;
    }).join('');
    
    updateCarouselButtons();
}

/**
 * Update carousel button states
 */
function updateCarouselButtons() {
    const prevBtn = document.getElementById('related-prev-btn');
    const nextBtn = document.getElementById('related-next-btn');
    
    if (prevBtn) {
        if (relatedProductsStartIndex === 0) {
            prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
            prevBtn.disabled = true;
        } else {
            prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            prevBtn.disabled = false;
        }
    }
    
    if (nextBtn) {
        if (relatedProductsStartIndex + 4 >= relatedProducts.length) {
            nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
            nextBtn.disabled = true;
        } else {
            nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            nextBtn.disabled = false;
        }
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Color thumbnails click
    document.addEventListener('click', (e) => {
        const colorThumb = e.target.closest('.color-thumbnail');
        if (colorThumb) {
            const colorName = colorThumb.dataset.color;
            if (colorName && colorName !== selectedColor) {
                selectColor(colorName);
            }
        }
    });
    
    // Color button click
    document.addEventListener('click', (e) => {
        const colorBtn = e.target.closest('.color-btn');
        if (colorBtn) {
            const colorName = colorBtn.dataset.color;
            if (colorName) {
                selectColor(colorName);
            }
        }
    });
    
    // Size selection
    document.addEventListener('click', (e) => {
        const sizeBtn = e.target.closest('.size-btn');
        if (sizeBtn && !sizeBtn.disabled) {
            document.querySelectorAll('.size-btn').forEach(btn => {
                btn.classList.remove('border-primary', 'bg-primary/5', 'text-primary');
                btn.classList.add('border-gray-200', 'dark:border-gray-700');
            });
            
            sizeBtn.classList.remove('border-gray-200', 'dark:border-gray-700');
            sizeBtn.classList.add('border-primary', 'bg-primary/5', 'text-primary');
            
            selectedSize = sizeBtn.dataset.size;
            updateProductPriceDisplay();
            syncPurchaseState();
        }
    });
    
    // Add to Cart button
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', handleAddToCart);
    }
    
    // Add to Wishlist button
    const addToWishlistBtn = document.getElementById('add-to-wishlist-btn');
    if (addToWishlistBtn) {
        addToWishlistBtn.addEventListener('click', handleAddToWishlist);
    }
    
    // Wishlist buttons on related products
    document.addEventListener('click', (e) => {
        const wishlistBtn = e.target.closest('.wishlist-btn');
        if (wishlistBtn) {
            e.preventDefault();
            e.stopPropagation();
            const productId = wishlistBtn.dataset.productId;
            toggleWishlistForRelated(productId, wishlistBtn);
        }
    });
    
    // Related products carousel
    setupCarousel();
}

/**
 * Select a color
 */
function selectColor(colorName) {
    selectedColor = colorName;
    
    // Update color buttons
    document.querySelectorAll('.color-btn').forEach(btn => {
        if (btn.dataset.color === colorName) {
            btn.classList.remove('border', 'border-gray-200');
            btn.classList.add('border-2', 'border-primary', 'ring-offset-2', 'ring-1', 'ring-primary');
        } else {
            btn.classList.remove('border-2', 'border-primary', 'ring-offset-2', 'ring-1', 'ring-primary');
            btn.classList.add('border', 'border-gray-200');
        }
    });
    
    // Update selected color name
    updateSelectedColorName(colorName);
    
    // Load images for this color
    loadImagesForColor(colorName);
    
    // Update thumbnails
    renderColorThumbnails();
    
    // Render sizes for this color
    renderSizesForColor(colorName);
}

/**
 * Handle Add to Cart
 */
function handleAddToCart() {
    if (!currentProduct) {
        window.showToast?.('Không tìm thấy thông tin sản phẩm', 'error');
        return;
    }
    
    if (!selectedColor) {
        window.showToast?.('Vui lòng chọn phân loại', 'warning');
        return;
    }
    
    if (!selectedSize) {
        window.showToast?.('Vui lòng chọn quy cách', 'warning');
        return;
    }
    
    // Check stock availability
    const stock = getSelectedVariantStock();
    
    if (stock === 0) {
        window.showToast?.('Sản phẩm này đã hết hàng', 'error');
        syncPurchaseState();
        return;
    }
    
    // Get image for selected color
    let productImage = '';
    if (currentProduct.colorImages && currentProduct.colorImages[selectedColor]) {
        productImage = currentProduct.colorImages[selectedColor];
    } else if (currentProduct.images && currentProduct.images.length > 0) {
        productImage = currentProduct.images[0];
    }
    
    const cartItem = {
        id: currentProduct.id,
        name: currentProduct.name,
        price: getSelectedVariantPrice(),
        image: productImage,
        color: selectedColor,
        size: selectedSize,
        quantity: 1,
        maxStock: stock
    };
    
    // Use global addToCart function if available
    if (window.addToCart) {
        window.addToCart(cartItem);
    } else {
        // Fallback
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        const existing = cart.find(item => 
            item.id === cartItem.id && 
            item.color === cartItem.color && 
            item.size === cartItem.size
        );
        
        if (existing) {
            if (existing.quantity < stock) {
                existing.quantity += 1;
                window.showToast?.(`Đã cập nhật số lượng ${currentProduct.name}`, 'success');
            } else {
                window.showToast?.('Đã đạt số lượng tối đa có sẵn', 'warning');
                return;
            }
        } else {
            cart.push(cartItem);
            window.showToast?.(`Đã thêm ${currentProduct.name} vào giỏ hàng`, 'success');
        }
        
        localStorage.setItem('cart', JSON.stringify(cart));
        
        // Update cart count if function exists
        if (window.updateCartCount) {
            window.updateCartCount();
        }
    }
}

/**
 * Handle Add to Wishlist
 */
async function handleAddToWishlist() {
    if (!currentProduct) return;
    
    const user = auth.currentUser;
    let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const existingIndex = wishlist.findIndex(item => item.id === currentProduct.id);
    
    const btn = document.querySelector('#add-to-wishlist-btn span.material-symbols-outlined');
    
    if (existingIndex >= 0) {
        wishlist.splice(existingIndex, 1);
        if (btn) btn.textContent = 'favorite_border';
        window.showToast?.('Đã xóa khỏi danh sách yêu thích', 'info');
        
        if (user) {
            try {
                await updateDoc(doc(database, 'wishlist', user.uid), {
                    [currentProduct.id]: deleteField()
                });
            } catch (error) {
                console.error('❌ Lỗi xóa Firebase wishlist:', error);
            }
        }
    } else {
        const wishlistItem = {
            id: currentProduct.id,
            name: currentProduct.name,
            price: currentProduct.price,
            image: currentProduct.images?.[0] || '',
            addedAt: Date.now()
        };
        
        wishlist.push(wishlistItem);
        if (btn) btn.textContent = 'favorite';
        btn?.classList?.add('text-red-500');
        window.showToast?.('Đã thêm vào danh sách yêu thích', 'success');
        
        if (user) {
            try {
                await setDoc(doc(database, 'wishlist', user.uid), {
                    [currentProduct.id]: wishlistItem.addedAt
                }, { merge: true });
            } catch (error) {
                console.error('❌ Lỗi lưu Firebase wishlist:', error);
            }
        }
    }
    
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
}

/**
 * Toggle wishlist for related products
 */
async function toggleWishlistForRelated(productId, button) {
    const user = auth.currentUser;
    let wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    const existingIndex = wishlist.findIndex(item => item.id === productId);
    
    const icon = button.querySelector('span.material-symbols-outlined');
    
    if (existingIndex >= 0) {
        wishlist.splice(existingIndex, 1);
        if (icon) {
            icon.textContent = 'favorite';
            icon.classList.remove('text-red-500');
            icon.classList.add('text-gray-800');
        }
        window.showToast?.('Đã xóa khỏi yêu thích', 'info');
        
        if (user) {
            try {
                await updateDoc(doc(database, 'wishlist', user.uid), {
                    [productId]: deleteField()
                });
            } catch (error) {
                console.error('❌ Lỗi xóa Firebase wishlist:', error);
            }
        }
    } else {
        const relatedProduct = relatedProducts.find(p => p.id === productId);
        if (relatedProduct) {
            const wishlistItem = {
                id: productId,
                name: relatedProduct.name,
                price: relatedProduct.price,
                image: relatedProduct.images?.[0] || '',
                addedAt: Date.now()
            };
            
            wishlist.push(wishlistItem);
            
            if (icon) {
                icon.textContent = 'favorite';
                icon.classList.remove('text-gray-800');
                icon.classList.add('text-red-500');
            }
            window.showToast?.('Đã thêm vào yêu thích', 'success');
            
            if (user) {
                try {
                    await setDoc(doc(database, 'wishlist', user.uid), {
                        [productId]: wishlistItem.addedAt
                    }, { merge: true });
                } catch (error) {
                    console.error('❌ Lỗi lưu Firebase wishlist:', error);
                }
            }
        }
    }
    
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
}

/**
 * Setup carousel navigation
 */
function setupCarousel() {
    const prevBtn = document.getElementById('related-prev-btn');
    const nextBtn = document.getElementById('related-next-btn');
    
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (relatedProductsStartIndex > 0) {
                relatedProductsStartIndex = Math.max(0, relatedProductsStartIndex - 1);
                renderRelatedProductsCarousel();
            }
        });
        
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (relatedProductsStartIndex + 4 < relatedProducts.length) {
                relatedProductsStartIndex = Math.min(relatedProducts.length - 4, relatedProductsStartIndex + 1);
                renderRelatedProductsCarousel();
            }
        });
    }
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

/**
 * Show loading skeleton
 */
function showLoadingSkeleton() {
    const main = document.querySelector('main');
    if (!main) return;
    
    // Hide actual content
    const productContent = main.querySelector('.flex.flex-col.lg\\:flex-row.gap-12');
    const reviewsSection = main.querySelector('.mt-20.mb-12');
    const relatedSection = main.querySelector('.mt-24.mb-12');
    
    if (productContent) productContent.style.display = 'none';
    if (reviewsSection) reviewsSection.style.display = 'none';
    if (relatedSection) relatedSection.style.display = 'none';
    
    // Create skeleton
    const skeleton = document.createElement('div');
    skeleton.id = 'loading-skeleton';
    skeleton.className = 'animate-pulse';
    skeleton.innerHTML = `
        <div class="flex flex-col lg:flex-row gap-12 mb-12">
            <!-- Image Skeleton -->
            <div class="w-full lg:w-3/5 flex flex-col gap-4">
                <div class="w-full aspect-square bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
                <div class="grid grid-cols-5 gap-3">
                    <div class="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                </div>
            </div>
            
            <!-- Info Skeleton -->
            <div class="w-full lg:w-2/5 flex flex-col gap-4">
                <div class="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-3/4"></div>
                <div class="h-6 bg-gray-200 dark:bg-gray-800 rounded-lg w-full"></div>
                <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-1/2"></div>
                
                <!-- Color Skeleton -->
                <div class="flex gap-3 mt-4">
                    <div class="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                    <div class="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                    <div class="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                </div>
                
                <!-- Size Skeleton -->
                <div class="grid grid-cols-4 gap-2 mt-4">
                    <div class="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    <div class="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                </div>
                
                <!-- Buttons Skeleton -->
                <div class="flex flex-col gap-3 mt-6">
                    <div class="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
                    <div class="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
                </div>
            </div>
        </div>
        
        <!-- Reviews Skeleton -->
        <div class="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl mb-12"></div>
        
        <!-- Related Products Skeleton -->
        <div class="grid grid-cols-4 gap-6">
            <div class="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
            <div class="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
            <div class="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
            <div class="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
        </div>
    `;
    
    // Insert skeleton before breadcrumbs
    const breadcrumbs = main.querySelector('.flex.flex-wrap.gap-2.py-4');
    if (breadcrumbs && breadcrumbs.nextElementSibling) {
        breadcrumbs.nextElementSibling.insertAdjacentElement('afterend', skeleton);
    }
}

/**
 * Hide loading skeleton
 */
function hideLoadingSkeleton() {
    const skeleton = document.getElementById('loading-skeleton');
    if (skeleton) {
        skeleton.style.opacity = '0';
        skeleton.style.transition = 'opacity 0.3s ease-out';
        setTimeout(() => skeleton.remove(), 300);
    }
    
    // Show actual content
    const main = document.querySelector('main');
    if (!main) return;
    
    const productContent = main.querySelector('.flex.flex-col.lg\\:flex-row.gap-12');
    const reviewsSection = main.querySelector('.mt-20.mb-12');
    const relatedSection = main.querySelector('.mt-24.mb-12');
    
    if (productContent) {
        productContent.style.display = '';
        productContent.style.opacity = '0';
        setTimeout(() => {
            productContent.style.transition = 'opacity 0.4s ease-in';
            productContent.style.opacity = '1';
        }, 50);
    }
    
    if (reviewsSection) {
        reviewsSection.style.display = '';
        reviewsSection.style.opacity = '0';
        setTimeout(() => {
            reviewsSection.style.transition = 'opacity 0.4s ease-in';
            reviewsSection.style.opacity = '1';
        }, 150);
    }
    
    if (relatedSection) {
        relatedSection.style.display = '';
        relatedSection.style.opacity = '0';
        setTimeout(() => {
            relatedSection.style.transition = 'opacity 0.4s ease-in';
            relatedSection.style.opacity = '1';
        }, 250);
    }
}

/**
 * Show error page
 */
function showErrorPage() {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 px-4">
                <div class="size-24 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
                    <span class="material-symbols-outlined text-5xl text-red-500">error</span>
                </div>
                <h2 class="text-3xl font-black mb-3 text-center">Không Tìm Thấy Sản Phẩm</h2>
                <p class="text-gray-500 mb-2 text-center">Sản phẩm bạn đang tìm không tồn tại hoặc đã bị xóa.</p>
                <p class="text-gray-400 text-sm mb-8 text-center">Vui lòng kiểm tra lại đường dẫn hoặc tìm kiếm sản phẩm khác.</p>
                <div class="flex flex-col sm:flex-row gap-4">
                    <a href="Product.html" class="bg-primary text-white px-8 py-3 rounded-lg font-bold hover:bg-[#c4141d] transition-colors inline-flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined">storefront</span>
                        Về trang sản phẩm
                    </a>
                    <a href="index.html" class="bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 px-8 py-3 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-white/20 transition-colors inline-flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined">home</span>
                        Về trang chủ
                    </a>
                </div>
            </div>
        `;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 Initializing product detail page...');
    
    // Show loading skeleton immediately
    showLoadingSkeleton();
    
    const productId = getProductIdFromUrl();
    const blogId = getBlogIdFromUrl();
    
    if (!productId) {
        console.error('❌ No product ID in URL');
        hideLoadingSkeleton();
        showErrorPage();
        return;
    }
    
    try {
        // Load product data
        const product = await loadProductById(productId);
        
        if (!product) {
            hideLoadingSkeleton();
            showErrorPage();
            return;
        }
        
        // Render product immediately (progressive rendering)
        renderProductData(product);
        
        // Setup event listeners right away
        setupEventListeners();
        
        // Hide skeleton after main content is rendered
        hideLoadingSkeleton();
        
        // Load related products in background (non-blocking)
        setTimeout(async () => {
            let relatedProductsList;
            if (blogId) {
                console.log(`📝 Loading featured products from blog: ${blogId}`);
                relatedProductsList = await loadFeaturedProductsFromBlog(blogId, productId);
                
                const relatedTitle = document.querySelector('.mt-24.mb-12 h2');
                if (relatedTitle && relatedTitle.textContent.includes('Sản Phẩm Khác')) {
                    relatedTitle.textContent = 'Sản Phẩm Được Đề Xuất';
                    const relatedSubtitle = relatedTitle.nextElementSibling;
                    if (relatedSubtitle) {
                        relatedSubtitle.textContent = 'Các sản phẩm liên quan được giới thiệu trong bài viết.';
                    }
                }
            } else {
                relatedProductsList = await loadRelatedProducts(product.category, productId);
            }
            
            renderRelatedProducts(relatedProductsList);
        }, 100);
        
        // Load reviews in background (non-blocking)
        setTimeout(async () => {
            await initProductReviews(productId);
        }, 200);
        
        console.log('✅ Product detail page initialized');
    } catch (error) {
        console.error('❌ Error initializing product detail:', error);
        hideLoadingSkeleton();
        showErrorPage();
    }
}

// ============================================================================
// START APPLICATION
// ============================================================================

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
