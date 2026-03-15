import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getFirebaseAuth } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const db = getFirebaseFirestore();

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatNumber(num) {
    return new Intl.NumberFormat('vi-VN').format(num);
}

function calculatePercentageChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(1);
}

function getDateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
}

function isWithinDateRange(timestamp, start, end) {
    const date = new Date(timestamp);
    return date >= start && date <= end;
}

function initDashboard() {
    const auth = getFirebaseAuth();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('Dashboard: User authenticated, fetching stats...');
            loadDashboardData();
        } else {
            console.log('Dashboard: No user authenticated');
            window.location.href = 'login.html';
        }
    });
}

function loadDashboardData() {
    loadRevenueAndOrders();
    loadCustomersStats();
    loadProductsStats();
    loadTopProducts();
    loadRecentActivity();
    loadRevenueChart();
}

// Load Revenue and Orders Statistics
function loadRevenueAndOrders() {
    onSnapshot(collection(db, 'orders'), (snapshot) => {
        let totalRevenue = 0;
        let totalOrders = 0;
        let currentMonthRevenue = 0;
        let previousMonthRevenue = 0;
        let currentMonthOrders = 0;
        let previousMonthOrders = 0;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        
        snapshot.docs.forEach(d => {
            const order = d.data();
            const orderTotal = parseInt(order.total) || 0;
            totalRevenue += orderTotal;
            totalOrders++;

            if (order.createdAt) {
                const orderDate = new Date(order.createdAt);
                const orderMonth = orderDate.getMonth();
                const orderYear = orderDate.getFullYear();

                if (orderMonth === currentMonth && orderYear === currentYear) {
                    currentMonthRevenue += orderTotal;
                    currentMonthOrders++;
                } else if (orderMonth === previousMonth && orderYear === previousYear) {
                    previousMonthRevenue += orderTotal;
                    previousMonthOrders++;
                }
            }
        });

        const revEl = document.getElementById('stat-revenue');
        const revChangeEl = document.getElementById('stat-revenue-change');
        if (revEl) revEl.textContent = formatCurrency(totalRevenue);
        if (revChangeEl) {
            const change = calculatePercentageChange(currentMonthRevenue, previousMonthRevenue);
            revChangeEl.innerHTML = `<span class="material-symbols-rounded text-[14px]">trending_${change >= 0 ? 'up' : 'down'}</span> ${Math.abs(change)}%`;
            revChangeEl.className = `text-xs font-bold ${change >= 0 ? 'text-emerald-500' : 'text-rose-500'} flex items-center`;
        }

        const ordEl = document.getElementById('stat-orders');
        const ordChangeEl = document.getElementById('stat-orders-change');
        if (ordEl) ordEl.textContent = formatNumber(totalOrders);
        if (ordChangeEl) {
            const change = calculatePercentageChange(currentMonthOrders, previousMonthOrders);
            ordChangeEl.innerHTML = `<span class="material-symbols-rounded text-[14px]">trending_${change >= 0 ? 'up' : 'down'}</span> ${Math.abs(change)}%`;
            ordChangeEl.className = `text-xs font-bold ${change >= 0 ? 'text-emerald-500' : 'text-rose-500'} flex items-center`;
        }
    }, (error) => {
        console.error("Error fetching orders:", error);
        const revEl = document.getElementById('stat-revenue');
        const ordEl = document.getElementById('stat-orders');
        if (revEl) revEl.textContent = "0đ";
        if (ordEl) ordEl.textContent = "0";
    });
}

// Load Customers Statistics
function loadCustomersStats() {
    onSnapshot(collection(db, 'users'), (snapshot) => {
        let totalCustomers = 0;
        let newThisMonth = 0;
        let previousMonthNew = 0;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        snapshot.docs.forEach(d => {
            const user = d.data();
            totalCustomers++;
            if (user.createdAt) {
                const userDate = new Date(user.createdAt);
                if (userDate.getMonth() === currentMonth && userDate.getFullYear() === currentYear) newThisMonth++;
                else if (userDate.getMonth() === previousMonth && userDate.getFullYear() === previousYear) previousMonthNew++;
            }
        });

        const custEl = document.getElementById('stat-customers');
        const custChangeEl = document.getElementById('stat-customers-change');
        if (custEl) custEl.textContent = formatNumber(totalCustomers);
        if (custChangeEl) {
            const change = calculatePercentageChange(newThisMonth, previousMonthNew);
            custChangeEl.innerHTML = `<span class="material-symbols-rounded text-[14px]">trending_${change >= 0 ? 'up' : 'down'}</span> ${Math.abs(change)}%`;
            custChangeEl.className = `text-xs font-bold ${change >= 0 ? 'text-emerald-500' : 'text-rose-500'} flex items-center`;
        }
    }, (error) => {
        console.error("Error fetching users:", error);
        const custEl = document.getElementById('stat-customers');
        if (custEl) custEl.textContent = "0";
    });
}

// Load Products Statistics
function loadProductsStats() {
    onSnapshot(collection(db, 'products'), (snapshot) => {
        const count = snapshot.size;
        const prodEl = document.getElementById('stat-products');
        if (prodEl) prodEl.textContent = formatNumber(count);
    }, (error) => {
        console.error("Error fetching products:", error);
        const prodEl = document.getElementById('stat-products');
        if (prodEl) prodEl.textContent = "0";
    });
}

// Load Top Selling Products
function loadTopProducts() {
    onSnapshot(collection(db, 'orders'), (ordersSnapshot) => {
        const productSales = {};
        ordersSnapshot.docs.forEach(d => {
            const order = d.data();
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const productId = item.id || item.productId;
                    if (productId) {
                        if (!productSales[productId]) {
                            productSales[productId] = { quantity: 0, revenue: 0, name: item.name || 'Unknown Product' };
                        }
                        productSales[productId].quantity += item.quantity || 1;
                        productSales[productId].revenue += (item.price || 0) * (item.quantity || 1);
                    }
                });
            }
        });

        const topProducts = Object.entries(productSales)
            .sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 3);

        const topProductsContainer = document.getElementById('top-products-list');
        if (topProductsContainer) {
            if (topProducts.length === 0) {
                topProductsContainer.innerHTML = `<div class="text-center py-8 text-slate-400"><span class="material-symbols-rounded text-4xl opacity-20">inventory_2</span><p class="text-sm mt-2">Chưa có dữ liệu bán hàng</p></div>`;
            } else {
                topProductsContainer.innerHTML = topProducts.map(([productId, data]) => `
                    <div class="flex items-center gap-4">
                        <div class="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                            <span class="material-symbols-rounded text-slate-400">image</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-semibold text-slate-900 dark:text-white">${data.name}</p>
                            <p class="text-xs text-slate-500">${data.quantity} sold</p>
                        </div>
                        <span class="text-sm font-bold text-slate-900 dark:text-white">${formatCurrency(data.revenue)}</span>
                    </div>
                `).join('');
            }
        }
    });
}

// Load Recent Activity
function loadRecentActivity() {
    const activitiesContainer = document.getElementById('recent-activities');
    if (!activitiesContainer) return;

    onSnapshot(collection(db, 'orders'), (snapshot) => {
        const activities = snapshot.docs.map(d => {
            const order = d.data();
            return {
                type: 'order',
                icon: 'shopping_bag',
                iconBg: 'emerald',
                title: `New order ${order.orderId || d.id}`,
                description: order.customerName ? `${order.customerName} ordered products` : 'New order received',
                timestamp: order.createdAt || Date.now()
            };
        });

        activities.sort((a, b) => b.timestamp - a.timestamp);
        const recentActivities = activities.slice(0, 5);

        if (recentActivities.length === 0) {
            activitiesContainer.innerHTML = `<div class="text-center py-8 text-slate-400"><span class="material-symbols-rounded text-4xl opacity-20">notifications</span><p class="text-sm mt-2">Chưa có hoạt động nào</p></div>`;
        } else {
            activitiesContainer.innerHTML = recentActivities.map((activity, index) => {
                const timeAgo = getTimeAgo(activity.timestamp);
                const isLast = index === recentActivities.length - 1;
                return `
                    <div class="flex items-start gap-4 ${!isLast ? 'pb-4 border-b border-slate-100 dark:border-border-dark' : ''}">
                        <div class="w-10 h-10 rounded-full bg-${activity.iconBg}-100 dark:bg-${activity.iconBg}-500/10 flex items-center justify-center">
                            <span class="material-symbols-rounded text-${activity.iconBg}-600 dark:text-${activity.iconBg}-400 text-[20px]">${activity.icon}</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-semibold text-slate-900 dark:text-white">${activity.title}</p>
                            <p class="text-xs text-slate-500 mt-1">${activity.description}</p>
                        </div>
                        <span class="text-xs text-slate-400">${timeAgo}</span>
                    </div>
                `;
            }).join('');
        }
    });
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} ngày trước`;
    if (hours > 0) return `${hours} giờ trước`;
    if (minutes > 0) return `${minutes} phút trước`;
    return 'Vừa xong';
}

// Load Revenue Chart - Last 7 days
function loadRevenueChart() {
    onSnapshot(collection(db, 'orders'), (snapshot) => {
        const revenueByDay = {};
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            revenueByDay[dateKey] = {
                revenue: 0, orders: 0,
                label: date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' })
            };
        }
        snapshot.docs.forEach(d => {
            const order = d.data();
            if (order.createdAt) {
                const dateKey = new Date(order.createdAt).toISOString().split('T')[0];
                if (revenueByDay[dateKey]) {
                    revenueByDay[dateKey].revenue += parseInt(order.total) || 0;
                    revenueByDay[dateKey].orders++;
                }
            }
        });

        const revenues = Object.values(revenueByDay).map(d => d.revenue);
        const maxRevenue = Math.max(...revenues, 1);
        const chartContainer = document.getElementById('revenue-chart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="flex items-end justify-between h-48 gap-2">
                    ${Object.values(revenueByDay).map(data => {
                        const height = (data.revenue / maxRevenue) * 100;
                        return `
                            <div class="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                                <div class="relative w-full">
                                    <div class="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 dark:bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                        ${formatCurrency(data.revenue)}<br><span class="text-slate-300">${data.orders} orders</span>
                                    </div>
                                    <div class="w-full bg-gradient-to-t from-primary to-primary/50 rounded-t-lg transition-all group-hover:from-primary-600 group-hover:to-primary/70" style="height: ${height}%"></div>
                                </div>
                                <span class="text-xs text-slate-500 dark:text-slate-400 font-medium">${data.label}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-border-dark">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-slate-500">Tổng 7 ngày</span>
                        <span class="font-bold text-slate-900 dark:text-white">${formatCurrency(revenues.reduce((a, b) => a + b, 0))}</span>
                    </div>
                </div>
            `;
        }
    });
}

// Export for use in admin.html
window.dashboardModule = {
    init: initDashboard,
    reload: loadDashboardData
};

// Start automatically
initDashboard();
