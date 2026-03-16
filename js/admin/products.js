import { getFirebaseFirestore } from '../firebase-config.js';
import { 
    collection, doc, addDoc, setDoc, deleteDoc, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { uploadAvatarDirect, getOptimizedImageUrl } from '../base64-upload.js';
import { getFirebaseAuth } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const db = getFirebaseFirestore();
const productsCol = collection(db, 'products');

let currentProducts = {};
let filteredProducts = []; // For search/filter
let currentPage = 1;
const itemsPerPage = 6;
let isInitialized = false;

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

/**
 * Render Statistics
 */
function renderStats() {
    const products = Object.values(currentProducts);
    const total = products.length;
    const inStock = products.filter(p => (parseInt(p.quantity) || 0) > 10).length;
    const lowStock = products.filter(p => (parseInt(p.quantity) || 0) > 0 && (parseInt(p.quantity) || 0) <= 10).length;
    const outStock = products.filter(p => (parseInt(p.quantity) || 0) === 0).length;

    const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setStat('stat-prod-total', total);
    setStat('stat-prod-instock', inStock);
    setStat('stat-prod-low', lowStock);
    setStat('stat-prod-out', outStock);
}

/**
 * Render Pagination
 */
function renderPagination() {
    const container = document.getElementById('products-pagination');
    if (!container) return;

    const totalItems = filteredProducts.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    let controlsHtml = '';
    
    // Prev Button
    controlsHtml += `
        <button onclick="window.productsModule.setPage(${currentPage - 1})" 
            class="p-2 rounded-lg border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            ${currentPage === 1 ? 'disabled' : ''}>
            <span class="material-symbols-rounded text-[18px]">chevron_left</span>
        </button>
    `;

    // Pages
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
             controlsHtml += `<button class="w-9 h-9 rounded-lg bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">${i}</button>`;
        } else {
             // Simple logic: show all pages or truncated. For now show all if < 7, else ellipsis logic could be added.
             // Showing limited pages for simplicity
             if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                controlsHtml += `<button onclick="window.productsModule.setPage(${i})" class="w-9 h-9 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 text-sm font-medium transition-all">${i}</button>`;
             } else if (i === currentPage - 2 || i === currentPage + 2) {
                controlsHtml += `<span class="text-slate-400">...</span>`;
             }
        }
    }

    // Next Button
    controlsHtml += `
        <button onclick="window.productsModule.setPage(${currentPage + 1})" 
            class="p-2 rounded-lg border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}>
            <span class="material-symbols-rounded text-[18px]">chevron_right</span>
        </button>
    `;

    container.innerHTML = `
        <p class="text-sm text-slate-500 font-medium">Showing <span class="text-slate-900 dark:text-white font-bold">${totalItems > 0 ? startItem : 0}-${endItem}</span> of <span class="text-slate-900 dark:text-white font-bold">${totalItems}</span> results</p>
        <div class="flex items-center gap-2">
            ${controlsHtml}
        </div>
    `;
}

/**
 * Filter and Render
 */
function applyFilterAndRender() {
    const searchTerm = (document.getElementById('product-search-input')?.value || '').toLowerCase();
    
    // Filter
    filteredProducts = Object.entries(currentProducts).map(([id, p]) => ({ ...p, id })).filter(p => {
        return !searchTerm || 
               p.name.toLowerCase().includes(searchTerm) || 
               (p.brand && p.brand.toLowerCase().includes(searchTerm));
    });

    // Sort (optional, default newest)
    filteredProducts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Pagination
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredProducts.slice(start, start + itemsPerPage);

    renderStats(); // Update stats (global or filtered? Doing global inside renderStats reading currentProducts)
    renderTable(paginatedItems); // Render sliced items
    renderPagination();
}

function setPage(page) {
    if (page < 1 || page > Math.ceil(filteredProducts.length / itemsPerPage)) return;
    currentPage = page;
    applyFilterAndRender();
}

function renderTable(products) {
    const tableBody = document.getElementById('products-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    
    if (!products || products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">No products found.</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-border-dark';
        
        const imgUrl = product.image ? getOptimizedImageUrl(product.image, { width: 40, height: 40 }) : 'https://placehold.co/40';
        
        // Status Logic
        const qty = parseInt(product.quantity) || 0;
        let statusHtml = '';
        if (qty === 0) {
            statusHtml = '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">Hết hàng</span>';
        } else if (qty <= 10) {
             statusHtml = '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-100 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20">Sắp hết</span>';
        } else {
             statusHtml = '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">Còn hàng</span>';
        }

        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-slate-100 dark:bg-white/5 rounded overflow-hidden flex-shrink-0">
                        <img src="${imgUrl}" class="w-full h-full object-cover">
                    </div>
                    <div>
                         <p class="font-bold text-slate-900 dark:text-white text-sm line-clamp-1">${product.name}</p>
                         <p class="text-xs text-slate-500 hidden sm:block">${product.style || ''}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 text-xs font-mono text-slate-500 dark:text-slate-400">${product.id.substring(0,8)}...</td>
            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">${product.brand || 'N/A'}</td>
            <td class="px-6 py-4 font-bold text-slate-900 dark:text-white">${formatCurrency(product.price)}</td>
            <td class="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">${qty}</td>
            <td class="px-6 py-4 text-center">
                 ${statusHtml}
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button class="group relative p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all btn-view" data-id="${product.id}" title="Xem chi tiết">
                        <span class="material-symbols-rounded text-[20px]">visibility</span>
                    </button>
                    <button class="group relative p-2 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-all btn-edit" data-id="${product.id}" title="Chỉnh sửa">
                        <span class="material-symbols-rounded text-[20px]">edit</span>
                    </button>
                    <button class="group relative p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all btn-delete" data-id="${product.id}" title="Xóa">
                        <span class="material-symbols-rounded text-[20px]">delete</span>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Add Listeners
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.id));
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
}

function loadProducts() {
    onSnapshot(productsCol, (snapshot) => {
        currentProducts = {};
        snapshot.docs.forEach(docSnap => {
            currentProducts[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        applyFilterAndRender();
    }, (error) => {
        console.error('Error loading products:', error);
        const tableBody = document.getElementById('products-table-body');
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Error: ${error.message}</td></tr>`;
    });
}

// Modal Handling
function openModal() {
    const modal = document.getElementById('product-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeModal() {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const previewDiv = document.getElementById('image-preview');
    
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    
    if(form) {
        form.reset();
        document.getElementById('product-id').value = '';
        document.getElementById('prod-image-url').value = '';
        if(previewDiv) previewDiv.innerHTML = '<span class="material-symbols-rounded text-slate-400 text-4xl">image</span>';
        document.getElementById('modal-title').innerText = 'Thêm Sản Phẩm Mới';
        
        // Clear inventory table body but keep the table structure
        const inventoryTableBody = document.getElementById('inventory-table-body');
        if (inventoryTableBody) {
            inventoryTableBody.innerHTML = '';
        }
        const totalInventory = document.getElementById('total-inventory');
        if (totalInventory) {
            totalInventory.textContent = '0';
        }
    }
}

function closeViewModal() {
    const modal = document.getElementById('view-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function openViewModal(id) {
    const product = currentProducts[id];
    if (!product) return;

    // Product basic info
    document.getElementById('view-name').textContent = product.name || '-';
    document.getElementById('view-brand').textContent = product.brand || '-';
    document.getElementById('view-category').textContent = product.category || '-';
    document.getElementById('view-gender').textContent = product.gender === 'male' ? 'Nam' : product.gender === 'female' ? 'Nữ' : 'Unisex';
    document.getElementById('view-price').textContent = (product.price || 0).toLocaleString('vi-VN') + 'đ';
    document.getElementById('view-original-price').textContent = (product.originalPrice || 0).toLocaleString('vi-VN') + 'đ';
    document.getElementById('view-discount').textContent = (product.discount || 0) + '%';
    document.getElementById('view-description').textContent = product.description || '-';
    document.getElementById('view-total-stock').textContent = product.stock || 0;

    // Colors and sizes
    const colors = product.colors || [];
    const sizes = product.sizes || [];
    document.getElementById('view-colors').textContent = colors.join(', ') || '-';
    document.getElementById('view-sizes').textContent = sizes.join(', ') || '-';

    // Badges
    const badges = [];
    if (product.featured) badges.push('Nổi bật');
    if (product.isNew) badges.push('Mới');
    if (product.isBestSeller) badges.push('Bán chạy');
    document.getElementById('view-badges').textContent = badges.length > 0 ? badges.join(', ') : '-';

    // Main image
    const imageUrl = product.images && product.images.length > 0 ? product.images[0] : '';
    const mainImageEl = document.getElementById('view-main-image');
    if (mainImageEl) {
        if (imageUrl) {
            mainImageEl.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-cover rounded-lg">`;
        } else {
            mainImageEl.innerHTML = '<span class="material-symbols-rounded text-slate-400 text-6xl">image</span>';
        }
    }

    // Inventory table
    if (product.inventory && colors.length > 0 && sizes.length > 0) {
        const inventoryHtml = generateViewInventoryTable(product.inventory, colors, sizes);
        document.getElementById('view-inventory-table').innerHTML = inventoryHtml;
    } else {
        document.getElementById('view-inventory-table').innerHTML = '<p class="text-sm text-slate-500">Không có dữ liệu tồn kho</p>';
    }

    // Color images
    if (product.colorImages && colors.length > 0) {
        const colorImagesHtml = generateViewColorImages(product.colorImages, colors);
        document.getElementById('view-color-images').innerHTML = colorImagesHtml;
    } else {
        document.getElementById('view-color-images').innerHTML = '<p class="text-sm text-slate-500">Không có ảnh màu</p>';
    }

    const modal = document.getElementById('view-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function openEditModal(id) {
    const product = currentProducts[id];
    if (!product) return;

    document.getElementById('product-id').value = id;
    document.getElementById('prod-name').value = product.name || '';
    document.getElementById('prod-brand').value = product.brand || '';
    document.getElementById('prod-category').value = product.category || '';
    document.getElementById('prod-gender').value = product.gender || 'unisex';
    document.getElementById('prod-price').value = product.price || 0;
    document.getElementById('prod-original-price').value = product.originalPrice || 0;
    document.getElementById('prod-discount').value = product.discount || 0;
    document.getElementById('prod-description').value = product.description || '';
    
    // Load colors and sizes
    const colors = product.colors || [];
    const sizes = product.sizes || [];
    document.getElementById('prod-colors').value = colors.join(', ');
    document.getElementById('prod-sizes').value = sizes.join(', ');
    document.getElementById('prod-stock').value = product.stock || 0;
    
    // Load badges
    document.getElementById('prod-featured').checked = product.featured || false;
    document.getElementById('prod-new').checked = product.isNew || false;
    document.getElementById('prod-bestseller').checked = product.isBestSeller || false;

    // Load image
    const imageUrl = product.images && product.images.length > 0 ? product.images[0] : '';
    document.getElementById('prod-image-url').value = imageUrl;
    const previewDiv = document.getElementById('image-preview');
    if (previewDiv && imageUrl) {
        previewDiv.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-cover rounded-lg">`;
    }

    // Load inventory data
    if (product.inventory && colors.length > 0 && sizes.length > 0) {
        loadInventoryData(product.inventory, colors, sizes);
    }
    
    // Load color images
    if (product.colorImages && colors.length > 0) {
        loadColorImages(product.colorImages, colors);
    }

    document.getElementById('modal-title').innerText = 'Chỉnh Sửa Sản Phẩm';
    openModal();
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('btn-submit-product');
    if (!submitBtn) return;
    
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-rounded animate-spin text-sm">rotate_right</span> Đang lưu...';
    submitBtn.disabled = true;

    try {
        const id = document.getElementById('product-id').value;
        const fileInput = document.getElementById('prod-image-file');
        const file = fileInput ? fileInput.files[0] : null;
        let imageUrl = document.getElementById('prod-image-url').value;

        // Upload image if selected
        if (file) {
            const statusEl = document.getElementById('upload-status');
            if(statusEl) statusEl.innerText = 'Đang tải ảnh lên...';
            imageUrl = await uploadAvatarDirect(file);
            if(statusEl) statusEl.innerText = 'Tải lên thành công!';
        }

        // Parse colors and sizes
        const colorsText = document.getElementById('prod-colors')?.value || '';
        const sizesText = document.getElementById('prod-sizes')?.value || '';
        const colors = colorsText.split(',').map(c => c.trim()).filter(c => c);
        const sizes = sizesText.split(',').map(s => s.trim()).filter(s => s);
        
        // Get inventory data
        const inventory = getInventoryData();
        const colorImages = getColorImages();

        const productData = {
            name: document.getElementById('prod-name')?.value || '',
            brand: document.getElementById('prod-brand')?.value || '',
            category: document.getElementById('prod-category')?.value || '',
            gender: document.getElementById('prod-gender')?.value || 'unisex',
            price: parseInt(document.getElementById('prod-price')?.value) || 0,
            originalPrice: parseInt(document.getElementById('prod-original-price')?.value) || 0,
            discount: parseInt(document.getElementById('prod-discount')?.value) || 0,
            description: document.getElementById('prod-description')?.value || '',
            colors: colors,
            sizes: sizes.map(s => isNaN(s) ? s : parseInt(s)),
            stock: parseInt(document.getElementById('prod-stock')?.value) || 0,
            inventory: inventory || {},
            colorImages: colorImages || {},
            images: imageUrl ? [imageUrl] : [],
            featured: document.getElementById('prod-featured')?.checked || false,
            isNew: document.getElementById('prod-new')?.checked || false,
            isBestSeller: document.getElementById('prod-bestseller')?.checked || false,
            updatedAt: Date.now()
        };

        if (id) {
            // Update existing
            const existingProduct = currentProducts[id];
            productData.createdAt = existingProduct?.createdAt || Date.now();
            productData.sold = existingProduct?.sold || 0;
            productData.rating = existingProduct?.rating || 0;
            productData.reviews = existingProduct?.reviews || 0;
            await setDoc(doc(productsCol, id), productData);
        } else {
            // Create new
            productData.createdAt = Date.now();
            productData.sold = 0;
            productData.rating = 0;
            productData.reviews = 0;
            await addDoc(productsCol, productData);
        }

        closeModal();
        if (window.showToast) {
            window.showToast('Lưu sản phẩm thành công!', 'success');
        }
        
    } catch (error) {
        console.error('Error saving product:', error);
        if (window.showToast) {
            window.showToast('Lỗi khi lưu sản phẩm: ' + error.message, 'error');
        }
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
}

async function deleteProduct(id) {
    const confirmed = await window.showConfirm(
        'Bạn có chắc muốn xóa sản phẩm này?',
        {
            title: 'Xác nhận xóa',
            type: 'warning',
            confirmText: 'Xóa',
            cancelText: 'Hủy'
        }
    );
    
    if (confirmed) {
        try {
            await deleteDoc(doc(productsCol, id));
            if (window.showToast) window.showToast('Xóa sản phẩm thành công!', 'success');
        } catch (error) {
            console.error(error);
            if (window.showToast) window.showToast('Lỗi khi xóa sản phẩm', 'error');
        }
    }
}

/**
 * Parsed CSV Import
 */
async function importCSV(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        let successCount = 0;
        let failCount = 0;

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const product = {};
            
            headers.forEach((header, index) => {
                if(values[index]) product[header] = values[index];
            });

            if (product.name && product.price) {
                try {
                    // Normalize data
                    product.price = parseInt(product.price) || 0;
                    product.quantity = parseInt(product.quantity) || 0;
                    product.createdAt = new Date().toISOString();
                    product.updatedAt = new Date().toISOString();
                    
                    await addDoc(productsCol, product);
                    successCount++;
                } catch (err) {
                    console.error('Row error:', err);
                    failCount++;
                }
            }
        }
        
        if (window.showToast) {
            window.showToast(`Import hoàn tất! Thành công: ${successCount}, Thất bại: ${failCount}`, successCount > 0 ? 'success' : 'warning');
        }
        loadProducts(); // Refresh
    };
    reader.readAsText(file);
}

// Reload function: Re-binds events and re-renders
function reload() {
    console.log('Products Module: Reloading...');
    
    // 1. Re-bind static button events if elements exist
    const btnAdd = document.getElementById('btn-add-product');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel');
    const fileInput = document.getElementById('prod-image-file');
    const form = document.getElementById('product-form');
    // New Elements
    const searchInput = document.getElementById('product-search-input');
    const btnImport = document.getElementById('btn-import-csv');
    const csvInput = document.getElementById('csv-file-input');

    if (btnAdd) {
        btnAdd.replaceWith(btnAdd.cloneNode(true)); // Remove old listeners
        document.getElementById('btn-add-product').addEventListener('click', openModal);
    }
    
    if (btnClose) btnClose.onclick = closeModal;
    if (btnCancel) btnCancel.onclick = closeModal;
    
    if (form) {
        form.removeEventListener('submit', handleFormSubmit); // Hard to remove with bound args, easier to clone or use onclick
        form.onsubmit = handleFormSubmit;
    }

    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            const previewDiv = document.getElementById('image-preview');
            if (file && previewDiv) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewDiv.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // New Event Bindings
    if (searchInput) {
        searchInput.oninput = () => {
             currentPage = 1; // Reset to page 1 on search
             applyFilterAndRender();
        };
    }

    if (btnImport && csvInput) {
        btnImport.onclick = () => csvInput.click();
        csvInput.onchange = (e) => {
            if(e.target.files[0]) importCSV(e.target.files[0]);
            e.target.value = ''; // Reset
        };
    }

    // Inventory Management
    const btnGenerateInventory = document.getElementById('btn-generate-inventory');
    if (btnGenerateInventory) {
        btnGenerateInventory.onclick = generateInventoryTable;
    }

    // Auto-calculate discount
    const originalPriceInput = document.getElementById('prod-original-price');
    const priceInput = document.getElementById('prod-price');
    const discountInput = document.getElementById('prod-discount');
    
    if (originalPriceInput && priceInput && discountInput) {
        const calculateDiscount = () => {
            const original = parseFloat(originalPriceInput.value) || 0;
            const current = parseFloat(priceInput.value) || 0;
            if (original > 0 && current > 0 && current < original) {
                const discount = Math.round(((original - current) / original) * 100);
                discountInput.value = discount;
            } else {
                discountInput.value = 0;
            }
        };
        
        originalPriceInput.oninput = calculateDiscount;
        priceInput.oninput = calculateDiscount;
    }

    // 2. Load Data
    loadProducts();
}

// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

function generateViewInventoryTable(inventory, colors, sizes) {
    let html = '<table class="w-full border-collapse border border-slate-200 dark:border-slate-700 text-sm">';
    html += '<thead><tr class="bg-slate-100 dark:bg-slate-800">';
    html += '<th class="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Màu</th>';
    html += '<th class="border border-slate-200 dark:border-slate-700 px-3 py-2 text-left">Size</th>';
    html += '<th class="border border-slate-200 dark:border-slate-700 px-3 py-2 text-right">Số lượng</th>';
    html += '</tr></thead><tbody>';
    
    colors.forEach(color => {
        sizes.forEach((size, sizeIndex) => {
            const quantity = inventory[color] && inventory[color][size] ? inventory[color][size] : 0;
            html += '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">';
            if (sizeIndex === 0) {
                html += `<td class="border border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold" rowspan="${sizes.length}">${color}</td>`;
            }
            html += `<td class="border border-slate-200 dark:border-slate-700 px-3 py-2">${size}</td>`;
            html += `<td class="border border-slate-200 dark:border-slate-700 px-3 py-2 text-right">${quantity}</td>`;
            html += '</tr>';
        });
    });
    
    html += '</tbody></table>';
    return html;
}

function generateViewColorImages(colorImages, colors) {
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 gap-4">';
    colors.forEach(color => {
        const imageUrl = colorImages[color] || '';
        html += '<div class="border border-slate-200 dark:border-slate-700 rounded-lg p-3">';
        html += `<div class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">${color}</div>`;
        if (imageUrl) {
            html += `<img src="${imageUrl}" class="w-full h-32 object-cover rounded">`;
        } else {
            html += '<div class="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center">';
            html += '<span class="material-symbols-rounded text-slate-400">image</span>';
            html += '</div>';
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function generateInventoryTable() {
    const colorsInput = document.getElementById('prod-colors');
    const sizesInput = document.getElementById('prod-sizes');
    const container = document.getElementById('inventory-table-container');
    const tbody = document.getElementById('inventory-table-body');
    
    if (!colorsInput || !sizesInput || !container || !tbody) return;
    
    const colorsText = colorsInput.value.trim();
    const sizesText = sizesInput.value.trim();
    
    if (!colorsText || !sizesText) {
        if (window.showToast) {
            window.showToast('Vui lòng nhập màu sắc và size trước!', 'warning');
        }
        return;
    }
    
    const colors = colorsText.split(',').map(c => c.trim()).filter(c => c);
    const sizes = sizesText.split(',').map(s => s.trim()).filter(s => s);
    
    if (colors.length === 0 || sizes.length === 0) {
        if (window.showToast) {
            window.showToast('Màu sắc hoặc size không hợp lệ!', 'warning');
        }
        return;
    }
    
    // Generate table rows
    let html = '';
    colors.forEach((color, colorIndex) => {
        sizes.forEach((size, sizeIndex) => {
            const isFirstSizeOfColor = sizeIndex === 0;
            html += `
                <tr class="hover:bg-purple-50 dark:hover:bg-purple-900/10">
                    ${isFirstSizeOfColor ? `<td class="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300" rowspan="${sizes.length}">${color}</td>` : ''}
                    ${isFirstSizeOfColor ? `
                    <td class="px-3 py-2" rowspan="${sizes.length}">
                        <div class="flex flex-col gap-2">
                            <input type="file" 
                                   accept="image/*"
                                   data-color="${color}"
                                   class="color-image-file hidden">
                            <button type="button" 
                                    onclick="this.previousElementSibling.click()"
                                    class="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800/50">
                                <span class="material-symbols-rounded text-sm align-middle">upload</span>
                                Chọn ảnh
                            </button>
                            <div class="color-image-preview-${color.replace(/\s+/g, '-')} w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                <span class="material-symbols-rounded text-slate-400 text-sm">image</span>
                            </div>
                            <input type="hidden" 
                                   data-color="${color}"
                                   class="color-image-url"
                                   value="">
                        </div>
                    </td>` : ''}
                    <td class="px-3 py-2 text-slate-600 dark:text-slate-400">${size}</td>
                    <td class="px-3 py-2">
                        <input type="number" 
                               min="0" 
                               value="0" 
                               data-color="${color}" 
                               data-size="${size}"
                               class="inventory-input w-full px-2 py-1 text-center bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 rounded text-sm font-semibold focus:ring-2 focus:ring-purple-500">
                    </td>
                </tr>
            `;
        });
    });
    
    tbody.innerHTML = html;
    // No need to toggle visibility anymore since table is always visible
    
    // Add event listeners for auto-calculate total
    document.querySelectorAll('.inventory-input').forEach(input => {
        input.addEventListener('input', updateTotalInventory);
    });
    
    // Add event listeners for color image uploads
    document.querySelectorAll('.color-image-file').forEach(input => {
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const color = e.target.dataset.color;
            const previewClass = `color-image-preview-${color.replace(/\s+/g, '-')}`;
            const preview = document.querySelector(`.${previewClass}`);
            const urlInput = document.querySelector(`.color-image-url[data-color="${color}"]`);
            
            try {
                if (preview) {
                    preview.innerHTML = '<span class="material-symbols-rounded text-slate-400 text-sm animate-spin">progress_activity</span>';
                }
                
                const imageUrl = await uploadAvatarDirect(file);
                
                if (urlInput) {
                    urlInput.value = imageUrl;
                }
                
                if (preview) {
                    preview.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-cover rounded">`;
                }
            } catch (error) {
                console.error('Error uploading color image:', error);
                if (window.showToast) {
                    window.showToast('Lỗi khi tải ảnh lên: ' + error.message, 'error');
                }
                if (preview) {
                    preview.innerHTML = '<span class="material-symbols-rounded text-red-400 text-sm">error</span>';
                }
            }
        });
    });
    
    updateTotalInventory();
}

function updateTotalInventory() {
    const inputs = document.querySelectorAll('.inventory-input');
    let total = 0;
    
    inputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });
    
    const totalEl = document.getElementById('total-inventory');
    if (totalEl) {
        totalEl.textContent = total;
    }
    
    // Also update stock field
    const stockInput = document.getElementById('prod-stock');
    if (stockInput) {
        stockInput.value = total;
    }
}

function getInventoryData() {
    const inputs = document.querySelectorAll('.inventory-input');
    const inventory = {};
    
    inputs.forEach(input => {
        const color = input.dataset.color;
        const size = input.dataset.size;
        const quantity = parseInt(input.value) || 0;
        
        if (!inventory[color]) {
            inventory[color] = {};
        }
        inventory[color][size] = quantity;
    });
    
    return Object.keys(inventory).length > 0 ? inventory : null;
}

function getColorImages() {
    const urlInputs = document.querySelectorAll('.color-image-url');
    const colorImages = {};
    
    urlInputs.forEach(input => {
        const color = input.dataset.color;
        const url = input.value.trim();
        
        if (url) {
            colorImages[color] = url;
        }
    });
    
    return Object.keys(colorImages).length > 0 ? colorImages : null;
}

function loadInventoryData(inventory, colors, sizes) {
    if (!inventory || typeof inventory !== 'object') return;
    
    // First generate the table
    const colorsInput = document.getElementById('prod-colors');
    const sizesInput = document.getElementById('prod-sizes');
    
    if (colorsInput && sizesInput) {
        colorsInput.value = colors.join(', ');
        sizesInput.value = sizes.join(', ');
        generateInventoryTable();
    }
    
    // Then populate values
    setTimeout(() => {
        Object.keys(inventory).forEach(color => {
            Object.keys(inventory[color]).forEach(size => {
                const input = document.querySelector(`.inventory-input[data-color="${color}"][data-size="${size}"]`);
                if (input) {
                    input.value = inventory[color][size] || 0;
                }
            });
        });
        updateTotalInventory();
    }, 100);
}

function loadColorImages(colorImages, colors) {
    if (!colorImages || !colors) return;
    
    setTimeout(() => {
        colors.forEach(color => {
            if (colorImages[color]) {
                const urlInput = document.querySelector(`.color-image-url[data-color="${color}"]`);
                const previewClass = `color-image-preview-${color.replace(/\s+/g, '-')}`;
                const preview = document.querySelector(`.${previewClass}`);
                
                if (urlInput) {
                    urlInput.value = colorImages[color];
                }
                
                if (preview) {
                    preview.innerHTML = `<img src="${colorImages[color]}" class="w-full h-full object-cover rounded">`;
                }
            }
        });
    }, 150);
}

function init() {
    if (isInitialized) return;
    
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('Products: User authenticated');
            // We don't load data here immediately because tab might not be active
        }
    });

    isInitialized = true;
}

window.productsModule = {
    init,
    reload,
    closeViewModal,
    setPage
};

// Auto init
init();
