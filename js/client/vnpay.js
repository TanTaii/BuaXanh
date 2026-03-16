/**
 * VNPay Sandbox integration helpers.
 * Warning: hash secret below is for TEST only and must be moved to backend in production.
 */

const VNPAY_CONFIG = {
    tmnCode: '1P2M68V5',
    hashSecret: 'SXQPXC0IKN518OSTA6VLAQSH5SXR83PK',
    payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    locale: 'vn',
    currCode: 'VND',
    orderType: 'other',
    defaultBankCode: 'NCB',
    returnPath: '/vnpay-return.html'
};

function pad(number) {
    return number.toString().padStart(2, '0');
}

function formatDate(date = new Date()) {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function sortObject(obj) {
    const sorted = {};
    Object.keys(obj)
        .sort()
        .forEach((key) => {
            if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
                sorted[key] = obj[key];
            }
        });
    return sorted;
}

function encodeValue(value) {
    return encodeURIComponent(String(value)).replace(/%20/g, '+');
}

function buildQuery(params) {
    return Object.keys(params)
        .map((key) => `${key}=${encodeValue(params[key])}`)
        .join('&');
}

function getReturnUrl() {
    const customReturnUrl = localStorage.getItem('vnpay_return_url');
    if (customReturnUrl) {
        return customReturnUrl;
    }

    if (window.location.origin && window.location.origin.startsWith('http')) {
        return `${window.location.origin}${VNPAY_CONFIG.returnPath}`;
    }

    throw new Error('Không xác định được Return URL. Hãy chạy web bằng http/https hoặc set localStorage vnpay_return_url.');
}

function hmacSHA512(data) {
    if (!window.CryptoJS || !window.CryptoJS.HmacSHA512) {
        throw new Error('Thiếu thư viện CryptoJS để ký VNPay.');
    }

    return window.CryptoJS.HmacSHA512(data, VNPAY_CONFIG.hashSecret).toString(window.CryptoJS.enc.Hex);
}

export function createVNPayPaymentUrl({ orderId, amount, orderInfo = '' }) {
    const amountInVnpFormat = Math.max(0, Number(amount) || 0) * 100;

    const params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: VNPAY_CONFIG.tmnCode,
        vnp_Amount: String(amountInVnpFormat),
        vnp_CreateDate: formatDate(),
        vnp_CurrCode: VNPAY_CONFIG.currCode,
        vnp_IpAddr: '127.0.0.1',
        vnp_Locale: VNPAY_CONFIG.locale,
        vnp_OrderInfo: orderInfo || `Thanh toan don hang ${orderId}`,
        vnp_OrderType: VNPAY_CONFIG.orderType,
        vnp_ReturnUrl: getReturnUrl(),
        vnp_TxnRef: orderId,
        vnp_BankCode: VNPAY_CONFIG.defaultBankCode
    };

    const sortedParams = sortObject(params);
    const signData = buildQuery(sortedParams);
    const secureHash = hmacSHA512(signData);
    const queryWithHash = `${signData}&vnp_SecureHash=${secureHash}`;

    return `${VNPAY_CONFIG.payUrl}?${queryWithHash}`;
}

export function verifyVNPayReturnSignature(returnParams) {
    if (!returnParams || typeof returnParams !== 'object') {
        return false;
    }

    const paramsForSign = { ...returnParams };
    const returnedHash = paramsForSign.vnp_SecureHash;

    delete paramsForSign.vnp_SecureHash;
    delete paramsForSign.vnp_SecureHashType;

    const sortedParams = sortObject(paramsForSign);
    const signData = buildQuery(sortedParams);
    const calculatedHash = hmacSHA512(signData);

    return String(calculatedHash).toUpperCase() === String(returnedHash || '').toUpperCase();
}

export function savePendingVNPayOrder(orderData) {
    if (!orderData || !orderData.orderId) return;

    localStorage.setItem(`vnpay_pending_${orderData.orderId}`, JSON.stringify(orderData));
    localStorage.setItem('vnpay_last_order_id', orderData.orderId);
}

export function getPendingVNPayOrder(orderId) {
    if (!orderId) return null;

    const raw = localStorage.getItem(`vnpay_pending_${orderId}`);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error('Không parse được pending VNPay order:', error);
        return null;
    }
}

export function clearPendingVNPayOrder(orderId) {
    if (!orderId) return;

    localStorage.removeItem(`vnpay_pending_${orderId}`);
    if (localStorage.getItem('vnpay_last_order_id') === orderId) {
        localStorage.removeItem('vnpay_last_order_id');
    }
}
