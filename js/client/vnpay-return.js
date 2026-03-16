import { getFirebaseFirestore } from '../firebase-config.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
    verifyVNPayReturnSignature,
    getPendingVNPayOrder,
    clearPendingVNPayOrder
} from './vnpay.js';

const database = getFirebaseFirestore();

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value == null || value === '' ? '--' : String(value);
    }
}

function setStatus(type, title, subtitle) {
    const indicator = document.getElementById('vnpay-status-indicator');
    const subtitleEl = document.getElementById('vnpay-status-subtitle');
    if (!indicator || !subtitleEl) return;

    if (type === 'success') {
        indicator.className = 'flex items-center justify-center gap-3 text-green-600';
        indicator.innerHTML = '<span class="material-symbols-outlined">check_circle</span><span class="font-semibold">Thanh toán thành công</span>';
    } else if (type === 'error') {
        indicator.className = 'flex items-center justify-center gap-3 text-red-600';
        indicator.innerHTML = '<span class="material-symbols-outlined">error</span><span class="font-semibold">Thanh toán thất bại</span>';
    } else {
        indicator.className = 'flex items-center justify-center gap-3 text-amber-600';
        indicator.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span><span class="font-semibold">Đang xử lý</span>';
    }

    subtitleEl.textContent = subtitle || '';
    document.title = `Bữa Xanh | ${title}`;
}

function markOrderAsSaved(orderId) {
    localStorage.setItem(`vnpay_saved_${orderId}`, '1');
}

function isOrderSaved(orderId) {
    return localStorage.getItem(`vnpay_saved_${orderId}`) === '1';
}

function parseVNPayParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    params.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

function formatAmount(vnpAmount) {
    const raw = Number(vnpAmount || 0) / 100;
    if (window.formatPrice) {
        return window.formatPrice(raw);
    }
    return `${raw.toLocaleString('vi-VN')}đ`;
}

async function persistOrderIfNeeded(vnpParams) {
    const orderId = vnpParams.vnp_TxnRef;
    if (!orderId) {
        throw new Error('Thiếu mã đơn hàng từ VNPay.');
    }

    if (isOrderSaved(orderId)) {
        return;
    }

    const pendingOrder = getPendingVNPayOrder(orderId);
    if (!pendingOrder) {
        throw new Error('Không tìm thấy dữ liệu đơn hàng tạm. Hãy kiểm tra ở trang tài khoản.');
    }

    const orderData = {
        ...pendingOrder,
        paymentMethod: 'VNPay',
        paymentStatus: 'paid',
        status: 'pending',
        updatedAt: Date.now(),
        vnpay: {
            transactionNo: vnpParams.vnp_TransactionNo || '',
            bankCode: vnpParams.vnp_BankCode || '',
            bankTranNo: vnpParams.vnp_BankTranNo || '',
            payDate: vnpParams.vnp_PayDate || '',
            responseCode: vnpParams.vnp_ResponseCode || '',
            transactionStatus: vnpParams.vnp_TransactionStatus || ''
        }
    };

    await addDoc(collection(database, 'orders'), orderData);
    markOrderAsSaved(orderId);
    clearPendingVNPayOrder(orderId);

    localStorage.removeItem('cart');
    localStorage.removeItem('appliedCoupon');
}

async function handleReturn() {
    const params = parseVNPayParams();
    const orderId = params.vnp_TxnRef || '';

    setText('vnpay-order-id', orderId || '--');
    setText('vnpay-trans-no', params.vnp_TransactionNo || '--');
    setText('vnpay-amount', formatAmount(params.vnp_Amount));
    setText('vnpay-response-code', params.vnp_ResponseCode || '--');

    if (!params.vnp_TxnRef) {
        setStatus('error', 'Kết quả không hợp lệ', 'Thiếu thông tin giao dịch từ VNPay.');
        return;
    }

    const isValidSignature = verifyVNPayReturnSignature(params);
    const isPaid = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';

    if (!isValidSignature) {
        setStatus('error', 'Chữ ký không hợp lệ', 'Không thể xác thực chữ ký bảo mật từ VNPay.');
        return;
    }

    if (!isPaid) {
        setStatus('error', 'Thanh toán chưa thành công', `Giao dịch chưa hoàn tất (mã ${params.vnp_ResponseCode || 'N/A'}).`);
        return;
    }

    try {
        await persistOrderIfNeeded(params);
        setStatus('success', 'Thanh toán thành công', 'Giao dịch đã xác thực và đơn hàng đã được ghi nhận.');
        if (window.showToast) {
            window.showToast('Thanh toán VNPay thành công!');
        }
    } catch (error) {
        console.error('VNPay return persist error:', error);
        setStatus('error', 'Lưu đơn hàng thất bại', error.message || 'Không thể lưu đơn hàng sau khi thanh toán.');
        if (window.showToast) {
            window.showToast('Đã thanh toán nhưng lưu đơn thất bại. Vui lòng liên hệ hỗ trợ.', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    handleReturn();
});
