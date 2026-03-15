
// Initialize search on page load
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
});

// Initialize search modal
export function initSearch() {
  const searchBtn = document.getElementById('global-search-btn');
  const searchBtns = document.querySelectorAll('button[class*="search"], button .material-symbols-outlined');
  const searchModal = document.getElementById('search-modal');
  const closeSearchBtn = document.getElementById('close-search-btn');
  const searchInput = document.getElementById('search-input');
  const clearHistoryBtn = document.getElementById('clear-history');
  const searchTags = document.querySelectorAll('.search-tag');

  // Check if we're on Product page
  const isProductPage = window.location.pathname.includes('Product.html');

  // For Product page, focus on the product search input
  if (isProductPage) {
    const productSearchInput = document.getElementById('product-search-input');
    if (productSearchInput) {
      console.log('🔍 Search initialized on Product page - using native search input');
      return; // Don't initialize modal on Product page
    }
  }

  // For other pages, redirect to Product.html when clicking search
  // Find all search buttons in header
  const headerSearchButtons = document.querySelectorAll('header button .material-symbols-outlined');
  headerSearchButtons.forEach(icon => {
    if (icon.textContent.trim() === 'search') {
      const button = icon.parentElement;
      button.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('🔍 Redirecting to Product page for search...');
        window.location.href = 'Product.html';
      });
    }
  });

  console.log('🔍 Search module initialized - will redirect to Product page');
}

// Initialize search on page load
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
});
