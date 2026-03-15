// Blog List Page for X-Sneaker
// Loads and renders blog posts from Firestore

import { getFirebaseFirestore } from './firebase-config.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const database = getFirebaseFirestore();

// Global state
let allBlogs = [];
let filteredBlogs = [];
let currentCategory = 'all';
let currentSearchTerm = '';
let currentPage = 1;
const blogsPerPage = 6;

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadBlogs(limit = 100) {
    try {
        const q = query(collection(database, 'blogs'), orderBy('publishedDate', 'desc'));
        const snapshot = await getDocs(q);
        allBlogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        filteredBlogs = allBlogs.slice(0, limit);
        console.log(`✅ Loaded ${allBlogs.length} blogs from Firestore`);
        return filteredBlogs;
    } catch (error) {
        console.error('❌ Error loading blogs:', error);
        return [];
    }
}

// ============================================================================
// FILTERING & SEARCHING
// ============================================================================

function filterBlogs() {
    let result = [...allBlogs];
    
    // Filter by category
    if (currentCategory !== 'all') {
        result = result.filter(blog => 
            blog.category && blog.category.toLowerCase() === currentCategory.toLowerCase()
        );
    }
    
    // Filter by search term
    if (currentSearchTerm.trim()) {
        const searchLower = currentSearchTerm.toLowerCase();
        result = result.filter(blog => {
            const titleMatch = blog.title?.toLowerCase().includes(searchLower);
            const excerptMatch = blog.excerpt?.toLowerCase().includes(searchLower);
            const contentMatch = blog.content?.toLowerCase().includes(searchLower);
            return titleMatch || excerptMatch || contentMatch;
        });
    }
    
    filteredBlogs = result;
    
    // Reset to page 1 when filters change
    currentPage = 1;
    
    renderCurrentPage();
    renderPagination();
    
    // Update URL
    updateURL();
    
    console.log(`🔍 Filtered: ${filteredBlogs.length} blogs (category: ${currentCategory}, search: "${currentSearchTerm}")`);
}

function searchBlogs(searchTerm) {
    currentSearchTerm = searchTerm;
    filterBlogs();
}

function filterByCategory(category) {
    currentCategory = category;
    
    // Update active state on category buttons
    document.querySelectorAll('.category-filter').forEach(btn => {
        const btnCategory = btn.getAttribute('data-category');
        if (btnCategory === category) {
            btn.classList.add('bg-primary/20');
            btn.classList.remove('hover:bg-primary/10');
            btn.querySelector('span:last-child').classList.add('font-bold');
        } else {
            btn.classList.remove('bg-primary/20');
            btn.classList.add('hover:bg-primary/10');
            btn.querySelector('span:last-child').classList.remove('font-bold');
        }
    });
    
    filterBlogs();
}

function updateURL() {
    const params = new URLSearchParams();
    if (currentCategory !== 'all') params.set('category', currentCategory);
    if (currentSearchTerm.trim()) params.set('search', currentSearchTerm);
    if (currentPage > 1) params.set('page', currentPage);
    
    const newURL = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    
    window.history.replaceState({}, '', newURL);
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    const search = params.get('search');
    const page = params.get('page');
    
    if (category) {
        currentCategory = category;
        filterByCategory(category);
    }
    
    if (search) {
        currentSearchTerm = search;
        const searchInput = document.getElementById('blog-search-input');
        if (searchInput) searchInput.value = search;
        filterBlogs();
    }
    
    if (page) {
        currentPage = parseInt(page, 10) || 1;
    }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderCurrentPage() {
    const startIndex = (currentPage - 1) * blogsPerPage;
    const endIndex = startIndex + blogsPerPage;
    const blogsToShow = filteredBlogs.slice(startIndex, endIndex);
    
    renderBlogs(blogsToShow);
    
    // Scroll to top of blogs container
    const container = document.getElementById('blogs-container');
    if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function renderBlogs(blogs) {
    const container = document.getElementById('blogs-container');
    if (!container) return;
    
    if (blogs.length === 0) {
        const message = currentSearchTerm || currentCategory !== 'all'
            ? 'Không tìm thấy bài viết nào phù hợp'
            : 'Chưa có bài viết nào';
        
        container.innerHTML = `
            <div class="col-span-full text-center py-20">
                <span class="material-symbols-outlined text-6xl text-gray-300 mb-4">article</span>
                <p class="text-xl font-bold text-gray-500">${message}</p>
                <p class="text-gray-400 mt-2">
                    ${currentSearchTerm || currentCategory !== 'all' 
                        ? 'Thử tìm kiếm với từ khóa khác hoặc chọn danh mục khác.' 
                        : 'Hãy quay lại sau nhé!'}
                </p>
                ${currentSearchTerm || currentCategory !== 'all' ? `
                    <button onclick="window.location.href='Blog-list.html'" class="mt-6 px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-red-700 transition-colors">
                        Xem Tất Cả Bài Viết
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    container.innerHTML = blogs.map(blog => {
        const thumbnail = blog.thumbnailImage || 'image/coming_soon.png';
        const publishedDate = blog.publishedDate ? formatDate(blog.publishedDate) : 'N/A';
        const excerpt = blog.excerpt || 'Đọc thêm để khám phá...';
        
        return `
            <article class="bg-white dark:bg-background-dark rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-transparent hover:border-primary/20 group">
                <a href="Blog-detail.html?id=${blog.id}" class="block">
                    <div class="aspect-video bg-gray-100 overflow-hidden">
                        <img src="${thumbnail}" 
                             alt="${blog.title}"
                             class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                             onerror="this.src='image/coming_soon.png'"/>
                    </div>
                </a>
                <div class="p-6">
                    <div class="flex items-center gap-4 text-sm text-gray-500 mb-3">
                        <span class="flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">calendar_today</span>
                            ${publishedDate}
                        </span>
                        ${blog.category ? `
                            <span class="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold uppercase">
                                ${blog.category}
                            </span>
                        ` : ''}
                        ${blog.views ? `
                            <span class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">visibility</span>
                                ${formatNumber(blog.views)}
                            </span>
                        ` : ''}
                    </div>
                    <a href="Blog-detail.html?id=${blog.id}">
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3 leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            ${blog.title}
                        </h3>
                    </a>
                    <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
                        ${excerpt}
                    </p>
                    ${blog.author ? `
                        <div class="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                ${blog.author.avatar ? `
                                    <img src="${blog.author.avatar}" alt="${blog.author.name}" class="w-full h-full rounded-full object-cover"/>
                                ` : `
                                    <span class="text-primary font-bold text-sm">${blog.author.name?.charAt(0) || 'A'}</span>
                                `}
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">${blog.author.name || 'Admin'}</p>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </article>
        `;
    }).join('');
}

function showLoadingSkeleton() {
    const container = document.getElementById('blogs-container');
    if (!container) return;
    
    const skeletons = Array(6).fill(0).map(() => `
        <div class="bg-white dark:bg-background-dark rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800">
            <div class="aspect-video bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div class="p-6 space-y-3">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse"></div>
                <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse"></div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = skeletons;
}

function renderPagination() {
    const container = document.getElementById('pagination-container');
    if (!container) return;
    
    const totalPages = Math.ceil(filteredBlogs.length / blogsPerPage);
    
    // Hide pagination if only 1 page or no results
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <button 
            class="pagination-btn w-10 h-10 rounded-lg border border-gray-200 dark:border-white/20 flex items-center justify-center ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-white/5'}"
            data-page="${currentPage - 1}"
            ${currentPage === 1 ? 'disabled' : ''}>
            <span class="material-symbols-outlined">chevron_left</span>
        </button>
    `;
    
    // Page numbers with smart truncation
    const pageNumbers = generatePageNumbers(currentPage, totalPages);
    
    pageNumbers.forEach(page => {
        if (page === '...') {
            paginationHTML += `<span class="text-gray-400">...</span>`;
        } else {
            const isActive = page === currentPage;
            paginationHTML += `
                <button 
                    class="pagination-btn w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                        isActive 
                            ? 'bg-primary text-white' 
                            : 'border border-gray-200 dark:border-white/20 hover:bg-gray-50 dark:hover:bg-white/5'
                    }"
                    data-page="${page}">
                    ${page}
                </button>
            `;
        }
    });
    
    // Next button
    paginationHTML += `
        <button 
            class="pagination-btn w-10 h-10 rounded-lg border border-gray-200 dark:border-white/20 flex items-center justify-center ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-white/5'}"
            data-page="${currentPage + 1}"
            ${currentPage === totalPages ? 'disabled' : ''}>
            <span class="material-symbols-outlined">chevron_right</span>
        </button>
    `;
    
    container.innerHTML = paginationHTML;
    
    // Add click event listeners to pagination buttons
    container.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.getAttribute('data-page'));
            if (page >= 1 && page <= totalPages && page !== currentPage) {
                goToPage(page);
            }
        });
    });
}

function generatePageNumbers(current, total) {
    const pages = [];
    
    // Always show first page
    pages.push(1);
    
    if (total <= 7) {
        // Show all pages if total is small
        for (let i = 2; i <= total; i++) {
            pages.push(i);
        }
    } else {
        // Smart truncation for many pages
        if (current <= 3) {
            // Near start: 1 2 3 4 ... total
            for (let i = 2; i <= 4; i++) {
                pages.push(i);
            }
            pages.push('...');
            pages.push(total);
        } else if (current >= total - 2) {
            // Near end: 1 ... total-3 total-2 total-1 total
            pages.push('...');
            for (let i = total - 3; i <= total; i++) {
                pages.push(i);
            }
        } else {
            // Middle: 1 ... current-1 current current+1 ... total
            pages.push('...');
            pages.push(current - 1);
            pages.push(current);
            pages.push(current + 1);
            pages.push('...');
            pages.push(total);
        }
    }
    
    return pages;
}

function goToPage(page) {
    currentPage = page;
    renderCurrentPage();
    renderPagination();
    updateURL();
    
    console.log(`📄 Navigated to page ${page}`);
}

// ============================================================================
// UTILITY
// ============================================================================

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('blog-search-input');
    const searchBtn = document.getElementById('blog-search-btn');
    
    if (searchInput) {
        // Search on Enter key
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                searchBlogs(searchInput.value);
            }
        });
        
        // Real-time search with debounce
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchBlogs(e.target.value);
            }, 500);
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (searchInput) {
                searchBlogs(searchInput.value);
            }
        });
    }
    
    // Category filters
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const category = btn.getAttribute('data-category');
            filterByCategory(category);
        });
    });
    
    console.log('✅ Event listeners setup complete');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('🚀 Initializing blog list page...');
    
    showLoadingSkeleton();
    
    await loadBlogs(100); // Load more blogs for filtering
    
    // Setup event listeners
    setupEventListeners();
    
    // Load filters from URL
    loadFromURL();
    
    // If no URL params, show all blogs
    if (currentCategory === 'all' && !currentSearchTerm) {
        renderCurrentPage();
        renderPagination();
    }
    
    console.log('✅ Blog list initialized');
}

document.addEventListener('DOMContentLoaded', init);

console.log('✅ Blog module loaded');
