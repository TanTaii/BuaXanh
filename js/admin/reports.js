import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const db = getFirebaseFirestore();

// State
let allOrders = [];
let allProducts = {};
let currentPeriod = '30'; // Default 30 days
let charts = {
    sales: null,
    category: null
};

// Formatting Utilities
const formatCurrency = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount).replace('$', '$'); // Using $ for UI consistency with mockup, or VND if preferred. The mockup used $. But orders.js used VND.
// Wait, orders.js used VND. I should use VND to be consistent with orders.js unless user wants USD.
// orders.js: return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
// admin.html mockup (Report tab) used $.
// I should probably switch to VND to match the rest of the application (orders, products).
// "124,563" in template.
// I will use VND.

const formatVND = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

/**
 * Initialize Reports Module
 */
function init() {
    console.log('Reports Module Initialized');
    // Auto-load data on init
    reload();
}

/**
 * Reload Data
 */
async function reload() {
    // Show Loading state if needed
    
    try {
        // 1. Fetch Products
        const productsSnapshot = await getDocs(collection(db, 'products'));
        allProducts = {};
        productsSnapshot.docs.forEach(d => { allProducts[d.id] = { id: d.id, ...d.data() }; });

        // 2. Fetch Orders
        const ordersSnapshot = await getDocs(collection(db, 'orders'));
        // Sort orders by createdAt client-side since we removed orderBy
        allOrders = ordersSnapshot.docs.map(d => ({ key: d.id, ...d.data() })).sort((a, b) => {
            const timeA = a.createdAt || 0;
            const timeB = b.createdAt || 0;
            return timeA - timeB; // ascending
        });

        // 3. Process Data
        processData();

    } catch (error) {
        console.error("Error loading report data:", error);
    }
}

/**
 * Update Time Period
 */
function updatePeriod(period) {
    currentPeriod = period;
    processData();
}

/**
 * Process Data and Render stats/charts
 */
function processData() {
    // Filter orders by period & status
    const now = new Date();
    let startDate = new Date(0); // Beginning of time

    if (currentPeriod === '7') {
        startDate.setDate(now.getDate() - 7);
    } else if (currentPeriod === '30') {
        startDate.setDate(now.getDate() - 30);
    } else if (currentPeriod === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    }
    // 'all' keeps startDate as 0

    const validOrders = allOrders.filter(o => {
        // Filter by date
        const oDate = new Date(o.createdAt);
        if (oDate < startDate) return false;
        
        // Filter by status (only count delivered/completed for revenue? or all non-cancelled?)
        // Usually Revenue = Delivered + Shipped or just Delivered.
        // Let's use all except cancelled for "Sales" activity, but for "Revenue" strict accounting usually means Delivered.
        // For dashboard trends, usually we show what's happening.
        // I will exclude 'cancelled'.
        return (o.status !== 'cancelled');
    });

    const deliveredOrders = validOrders.filter(o => o.status === 'delivered');

    // --- Metrics ---
    let totalRevenue = 0;
    deliveredOrders.forEach(o => {
        totalRevenue += parseFloat(o.total || 0);
    });

    const totalOrdersCount = validOrders.length;
    const aov = totalOrdersCount > 0 ? totalRevenue / deliveredOrders.length : 0; // AOV usually based on revenue generating orders

    // Update UI Metrics
    setText('report-revenue', formatVND(totalRevenue));
    setText('report-aov', formatVND(aov || 0));
    setText('report-orders', totalOrdersCount);

    // --- Prepare Chart Data ---
    
    // 1. Sales Trend (Revenue by Date)
    const salesByDate = {};
    validOrders.forEach(o => {
        if (o.status === 'cancelled') return;
        const date = new Date(o.createdAt).toLocaleDateString('vi-VN'); // dd/mm/yyyy
        salesByDate[date] = (salesByDate[date] || 0) + parseFloat(o.total || 0);
    });

    // 2. Category Performance (by Brand)
    const salesByBrand = {};
    // 3. Top Products
    const productStats = {};

    validOrders.forEach(o => {
        if (o.status === 'cancelled') return;
        if (!o.items) return;

        o.items.forEach(item => {
            const product = allProducts[item.id] || {};
            const brand = product.brand || 'Other';
            const revenue = (item.price * item.quantity);

            // Category (Brand)
            salesByBrand[brand] = (salesByBrand[brand] || 0) + revenue;

            // Product Stats
            if (!productStats[item.id]) {
                productStats[item.id] = {
                    name: item.name,
                    qty: 0,
                    revenue: 0,
                    image: item.image
                };
            }
            productStats[item.id].qty += item.quantity;
            productStats[item.id].revenue += revenue;
        });
    });

    renderCharts(salesByDate, salesByBrand);
    renderTopProducts(productStats);
}

/**
 * Render Charts using Chart.js
 */
function renderCharts(salesData, brandData) {
    // --- Sales Chart ---
    const salesCtx = document.getElementById('salesChart');
    if (salesCtx) {
        if (charts.sales) charts.sales.destroy();

        charts.sales = new Chart(salesCtx, {
            type: 'line',
            data: {
                labels: Object.keys(salesData),
                datasets: [{
                    label: 'Revenue (VND)',
                    data: Object.values(salesData),
                    borderColor: '#e71823', // Primary color
                    backgroundColor: 'rgba(231, 24, 35, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    // --- Category Chart ---
    const catCtx = document.getElementById('categoryChart');
    if (catCtx) {
        if (charts.category) charts.category.destroy();

        const brands = Object.keys(brandData);
        const data = Object.values(brandData);
        
        // Colors palette
        const colors = ['#e71823', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

        charts.category = new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: brands,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, brands.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}

/**
 * Render Top Products Table
 */
function renderTopProducts(stats) {
    const tbody = document.getElementById('report-top-products');
    if (!tbody) return;

    const sorted = Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    tbody.innerHTML = sorted.map(p => `
        <tr class="border-b border-slate-100 dark:border-border-dark last:border-0">
            <td class="py-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        ${p.image ? `<img src="${p.image}" class="w-full h-full object-cover">` : ''}
                    </div>
                    <span class="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1">${p.name}</span>
                </div>
            </td>
            <td class="py-3 text-sm text-slate-600 dark:text-slate-400">${p.qty}</td>
            <td class="py-3 text-sm font-bold text-slate-900 dark:text-white">${formatVND(p.revenue)}</td>
        </tr>
    `).join('');
    
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="py-4 text-center text-slate-500">No data available</td></tr>';
    }
}

// Helpers
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

/**
 * Export Report to PDF
 */
async function exportPDF() {
    try {
        window.showNotification('Đang chuẩn bị xuất báo cáo PDF...', 'info');
        
        // Get current report data
        const period = document.getElementById('report-period')?.value || '30';
        const periodText = {
            '7': '7 ngày qua',
            '30': '30 ngày qua',
            'year': 'Năm nay',
            'all': 'Tất cả thời gian'
        }[period] || '30 ngày qua';

        const revenue = document.getElementById('report-revenue')?.textContent || '0đ';
        const aov = document.getElementById('report-aov')?.textContent || '0đ';
        const orders = document.getElementById('report-orders')?.textContent || '0';

        // Create HTML content for PDF
        const reportContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Báo Cáo Doanh Thu - X-Sneaker</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 40px;
                        color: #333;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 40px;
                        border-bottom: 3px solid #e71823;
                        padding-bottom: 20px;
                    }
                    .logo {
                        font-size: 32px;
                        font-weight: bold;
                        color: #e71823;
                        margin-bottom: 10px;
                    }
                    .report-title {
                        font-size: 24px;
                        font-weight: bold;
                        margin: 20px 0 10px 0;
                    }
                    .period {
                        font-size: 16px;
                        color: #666;
                        margin-bottom: 5px;
                    }
                    .generated-date {
                        font-size: 14px;
                        color: #999;
                    }
                    .metrics {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 20px;
                        margin: 40px 0;
                    }
                    .metric-card {
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 8px;
                        border-left: 4px solid #e71823;
                    }
                    .metric-label {
                        font-size: 12px;
                        text-transform: uppercase;
                        color: #666;
                        font-weight: bold;
                        margin-bottom: 8px;
                    }
                    .metric-value {
                        font-size: 28px;
                        font-weight: bold;
                        color: #e71823;
                    }
                    .table-section {
                        margin-top: 40px;
                    }
                    .section-title {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 15px;
                        color: #333;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    th {
                        background: #e71823;
                        color: white;
                        padding: 12px;
                        text-align: left;
                        font-weight: bold;
                    }
                    td {
                        padding: 10px 12px;
                        border-bottom: 1px solid #ddd;
                    }
                    tr:nth-child(even) {
                        background: #f8f9fa;
                    }
                    .footer {
                        margin-top: 60px;
                        text-align: center;
                        font-size: 12px;
                        color: #999;
                        border-top: 1px solid #ddd;
                        padding-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">X-SNEAKER</div>
                    <div class="report-title">BÁO CÁO DOANH THU & PHÂN TÍCH</div>
                    <div class="period">Kỳ báo cáo: ${periodText}</div>
                    <div class="generated-date">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}</div>
                </div>

                <div class="metrics">
                    <div class="metric-card">
                        <div class="metric-label">Tổng Doanh Thu</div>
                        <div class="metric-value">${revenue}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Giá Trị Đơn TB</div>
                        <div class="metric-value">${aov}</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Tổng Đơn Hàng</div>
                        <div class="metric-value">${orders}</div>
                    </div>
                </div>

                <div class="table-section">
                    <div class="section-title">Top 5 Sản Phẩm Bán Chạy</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Sản phẩm</th>
                                <th>Số lượng bán</th>
                                <th>Doanh thu</th>
                            </tr>
                        </thead>
                        <tbody id="pdf-products-table">
                            ${getTopProductsHTML()}
                        </tbody>
                    </table>
                </div>

                <div class="footer">
                    <p>© ${new Date().getFullYear()} X-Sneaker. Báo cáo được tạo tự động từ hệ thống quản lý.</p>
                    <p>Mọi thắc mắc vui lòng liên hệ: support@x-sneaker.com</p>
                </div>
            </body>
            </html>
        `;

        // Create and download PDF
        const blob = new Blob([reportContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Bao_Cao_Doanh_Thu_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        window.showNotification('Đã xuất báo cáo HTML thành công! Bạn có thể mở file và in ra PDF.', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        window.showNotification('Lỗi khi xuất báo cáo PDF', 'error');
    }
}

/**
 * Export Report to Excel (CSV format)
 */
function exportExcel() {
    try {
        window.showNotification('Đang chuẩn bị xuất báo cáo Excel...', 'info');
        
        // Prepare CSV data
        let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
        
        // Header
        csvContent += 'BÁO CÁO DOANH THU - X-SNEAKER\n';
        csvContent += `Kỳ báo cáo: ${getPeriodText()}\n`;
        csvContent += `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}\n\n`;
        
        // Summary metrics
        csvContent += 'TỔNG QUAN\n';
        csvContent += 'Chỉ số,Giá trị\n';
        csvContent += `Tổng Doanh Thu,${document.getElementById('report-revenue')?.textContent || '0'}\n`;
        csvContent += `Giá Trị Đơn Trung Bình,${document.getElementById('report-aov')?.textContent || '0'}\n`;
        csvContent += `Tổng Đơn Hàng,${document.getElementById('report-orders')?.textContent || '0'}\n\n`;
        
        // Top Products
        csvContent += 'TOP SẢN PHẨM BÁN CHẠY\n';
        csvContent += 'STT,Tên Sản Phẩm,Số Lượng Bán,Doanh Thu\n';
        
        const topProductsRows = document.querySelectorAll('#report-top-products tr');
        topProductsRows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const name = cells[0].textContent.trim();
                const qty = cells[1].textContent.trim();
                const revenue = cells[2].textContent.trim();
                csvContent += `${index + 1},"${name}",${qty},${revenue}\n`;
            }
        });
        
        // Create and download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Bao_Cao_Doanh_Thu_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        window.showNotification('Đã xuất báo cáo Excel thành công!', 'success');
    } catch (error) {
        console.error('Error exporting Excel:', error);
        window.showNotification('Lỗi khi xuất báo cáo Excel', 'error');
    }
}

/**
 * Get period text
 */
function getPeriodText() {
    const period = document.getElementById('report-period')?.value || '30';
    const periodMap = {
        '7': '7 ngày qua',
        '30': '30 ngày qua',
        'year': 'Năm nay',
        'all': 'Tất cả thời gian'
    };
    return periodMap[period] || '30 ngày qua';
}

/**
 * Get top products HTML for PDF
 */
function getTopProductsHTML() {
    const rows = document.querySelectorAll('#report-top-products tr');
    let html = '';
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
            const name = cells[0].textContent.trim();
            const qty = cells[1].textContent.trim();
            const revenue = cells[2].textContent.trim();
            html += `
                <tr>
                    <td>${name}</td>
                    <td>${qty}</td>
                    <td>${revenue}</td>
                </tr>
            `;
        }
    });
    
    if (!html) {
        html = '<tr><td colspan="3">Không có dữ liệu</td></tr>';
    }
    
    return html;
}

// Export
window.reportsModule = {
    init,
    reload,
    updatePeriod,
    exportPDF,
    exportExcel
};

// Start
init();
