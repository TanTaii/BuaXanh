import { getFirebaseDatabase, getFirebaseAuth, initFirebase } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const db = getFirebaseDatabase();

// Determine Views
const views = {
    dashboard: document.getElementById('view-dashboard'),
    users: document.getElementById('view-users'),
    products: document.getElementById('view-products'),
    blog: document.getElementById('view-blog'),
    cms: document.getElementById('view-cms'),
    settings: document.getElementById('view-settings')
};

// Check Auth Logic
function checkAuth() {
    const auth = getFirebaseAuth();
    
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.warn('User not logged in. Redirecting to login...');
            if (window.showToast) {
                window.showToast('Truy cập bị từ chối. Bạn phải đăng nhập với quyền Admin.', 'error');
            }
            window.location.href = 'login.html'; 
        } else {
            console.log('Admin Logged in as:', user.email);
            const adminNameEl = document.querySelector('.bg-primary + .flex-1 .font-bold');
            if(adminNameEl) adminNameEl.textContent = user.displayName || user.email;
        }
    });
}

// Navigation Handler
function setupNavigation() {
    const links = document.querySelectorAll('#admin-sidebar a[data-view]');
    const pageTitle = document.getElementById('page-title');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 1. Update Active State
            links.forEach(l => {
                l.classList.remove('bg-primary/10', 'text-primary');
                l.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-white/5');
            });
            link.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-white/5');
            link.classList.add('bg-primary/10', 'text-primary');

            // 2. Switch View
            const viewName = link.getAttribute('data-view');
            Object.values(views).forEach(view => {
                if(view) view.classList.add('hidden');
            });
            if (views[viewName]) {
                views[viewName].classList.remove('hidden');
            }

            // 3. Update Title
            // pageTitle.textContent = `Admin | ${link.querySelector('.font-semibold,.font-medium').innerText}`;
             const titleSpan = link.querySelector('span:last-child');
             if(pageTitle && titleSpan) pageTitle.textContent = titleSpan.textContent;
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    checkAuth();
    setupNavigation();
    console.log('Admin Core Initialized');
});
