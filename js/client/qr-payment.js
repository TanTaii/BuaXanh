/**
 * QR Payment Module for X-Sneaker
 * Generates QR code for bank transfer using VietQR API
 * Simulates payment verification
 */

// Cấu hình ngân hàng (có thể thay đổi theo nhu cầu)
const BANK_CONFIG = {
    bankId: '970436',          // Vietcombank (Vietcombank: 970436, Techcombank: 970407)
    accountNo: '1030790398',   // Số tài khoản nhận tiền
    accountName: 'CONG TY X-SNEAKER',
    template: 'compact2'       // Template QR code
};

/**
 * Generate QR Code URL using VietQR API
 * @param {string} orderId - Mã đơn hàng
 * @param {number} amount - Số tiền cần thanh toán
 * @param {string} description - Mô tả giao dịch
 * @returns {string} QR code image URL
 */
export function generateQRCode(orderId, amount, description = '') {
    const content = description || `Thanh toan don hang ${orderId}`;
    
    // Encode nội dung chuyển khoản
    const encodedContent = encodeURIComponent(content);
    
    // URL API VietQR (https://vietqr.io/)
    const qrUrl = `https://img.vietqr.io/image/${BANK_CONFIG.bankId}-${BANK_CONFIG.accountNo}-${BANK_CONFIG.template}.png?amount=${amount}&addInfo=${encodedContent}&accountName=${encodeURIComponent(BANK_CONFIG.accountName)}`;
    
    return qrUrl;
}

/**
 * Show QR Payment Modal
 * @param {string} orderId - Mã đơn hàng
 * @param {number} amount - Số tiền
 * @param {Function} onSuccess - Callback khi thanh toán thành công
 * @param {Function} onCancel - Callback khi hủy thanh toán
 */
export function showQRPaymentModal(orderId, amount, onSuccess, onCancel) {
    const qrUrl = generateQRCode(orderId, amount);
    
    // Tạo modal HTML
    const modalHTML = `
        <div id="qr-payment-modal" class="fixed inset-0 flex items-center justify-center p-4 animate-fade-in" style="z-index: 999999; background: rgba(0, 0, 0, 0.8);">
            <div class="bg-white dark:bg-[#2d1a1b] rounded-2xl max-w-md w-full shadow-2xl transform animate-scale-in" style="position: relative; z-index: 1000000;">
                <!-- Header -->
                <div class="bg-gradient-to-r from-primary to-red-700 text-white p-6 rounded-t-2xl" style="position: relative; z-index: 1000001;">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-3xl">qr_code_2</span>
                            <div>
                                <h3 class="text-xl font-bold">Thanh Toán QR Code</h3>
                                <p class="text-sm opacity-90">Quét mã để chuyển khoản</p>
                            </div>
                        </div>
                        <button id="qr-close-btn" class="hover:bg-white/20 p-2 rounded-full transition-colors" style="position: relative; z-index: 1000002;">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                <!-- Body -->
                <div class="p-8" style="position: relative; z-index: 1000001;">
                    <!-- QR Code -->
                    <div class="bg-white p-6 rounded-xl border-4 border-dashed border-gray-300 mb-6 flex flex-col items-center" style="position: relative; z-index: 1000002;">
                        <img src="${qrUrl}" alt="QR Code" class="w-64 h-64 object-contain" id="qr-code-image" loading="eager" style="pointer-events: auto !important; user-select: none; -webkit-user-drag: none; position: relative; z-index: 1000003;">
                        <p class="text-xs text-gray-500 mt-3 text-center">
                            Sử dụng app ngân hàng để quét mã QR
                        </p>
                    </div>

                    <!-- Thông tin thanh toán -->
                    <div class="space-y-3 mb-6 bg-gray-50 dark:bg-black/20 p-4 rounded-xl">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Ngân hàng:</span>
                            <span class="font-bold text-gray-900 dark:text-white">Vietcombank</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Số tài khoản:</span>
                            <span class="font-bold text-gray-900 dark:text-white">${BANK_CONFIG.accountNo}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Chủ TK:</span>
                            <span class="font-bold text-gray-900 dark:text-white">${BANK_CONFIG.accountName}</span>
                        </div>
                        <div class="flex justify-between text-sm border-t border-dashed pt-3">
                            <span class="text-gray-600 dark:text-gray-400">Số tiền:</span>
                            <span class="font-black text-lg text-primary">${window.formatPrice(amount)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">Nội dung CK:</span>
                            <span class="font-bold text-gray-900 dark:text-white text-xs">Thanh toan ${orderId}</span>
                        </div>
                    </div>

                    <!-- Hướng dẫn -->
                    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
                        <h4 class="font-bold text-sm text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">info</span>
                            Hướng dẫn thanh toán
                        </h4>
                        <ol class="text-xs text-blue-800 dark:text-blue-200 space-y-1 ml-1">
                            <li>1. Mở app ngân hàng của bạn</li>
                            <li>2. Chọn chức năng quét mã QR</li>
                            <li>3. Quét mã QR phía trên</li>
                            <li>4. Kiểm tra thông tin và xác nhận thanh toán</li>
                        </ol>
                    </div>

                    <!-- Trạng thái -->
                    <div id="qr-payment-status" class="text-center mb-6">
                        <div class="flex items-center justify-center gap-2 text-yellow-600 dark:text-yellow-400">
                            <span class="material-symbols-outlined animate-pulse">schedule</span>
                            <span class="text-sm font-semibold">Đang chờ thanh toán...</span>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">Hệ thống sẽ tự động xác nhận sau khi chuyển khoản</p>
                    </div>

                    <!-- Buttons -->
                    <div class="space-y-3">
                        <!-- Nút Đã chuyển khoản - Demo -->
                        <button id="qr-confirm-btn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg">
                            <span class="material-symbols-outlined">check_circle</span>
                            <span>Đã chuyển khoản</span>
                        </button>
                        
                        <!-- Nút Giả lập - Hidden demo -->
                        <button id="qr-simulate-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
                            <span class="material-symbols-outlined text-lg">science</span>
                            <span>Giả lập thanh toán (Auto)</span>
                        </button>
                        
                        <!-- Nút Hủy -->
                        <button id="qr-cancel-btn" class="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-all">
                            Hủy bỏ
                        </button>
                    </div>

                    <p class="text-xs text-center text-gray-400 mt-4">
                        ⚠️ Đây là môi trường demo. Click "Đã chuyển khoản" sau khi quét QR
                    </p>
                </div>
            </div>
        </div>

        <style>
            @keyframes fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scale-in {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .animate-fade-in {
                animation: fade-in 0.2s ease-out;
            }
            .animate-scale-in {
                animation: scale-in 0.3s ease-out;
            }
        </style>
    `;

    // Thêm modal vào body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const modal = document.getElementById('qr-payment-modal');
    const closeBtn = document.getElementById('qr-close-btn');
    const cancelBtn = document.getElementById('qr-cancel-btn');
    const confirmBtn = document.getElementById('qr-confirm-btn');
    const simulateBtn = document.getElementById('qr-simulate-btn');

    // Close handlers
    const closeModal = () => {
        modal.classList.add('animate-fade-out');
        setTimeout(() => {
            modalContainer.remove();
            if (onCancel) onCancel();
        }, 200);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Xử lý khi user click "Đã chuyển khoản" (Demo - giả lập user đã chuyển khoản thành công)
    confirmBtn.addEventListener('click', async () => {
        const statusEl = document.getElementById('qr-payment-status');
        confirmBtn.disabled = true;
        simulateBtn.disabled = true;
        
        confirmBtn.innerHTML = `
            <span class="material-symbols-outlined animate-spin">progress_activity</span>
            <span>Đang kiểm tra...</span>
        `;

        // Giả lập delay kiểm tra thanh toán
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Thành công
        statusEl.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                <span class="material-symbols-outlined text-3xl">check_circle</span>
                <span class="text-lg font-bold">Thanh toán thành công!</span>
            </div>
        `;

        confirmBtn.innerHTML = `
            <span class="material-symbols-outlined">check</span>
            <span>Đã xác nhận</span>
        `;
        confirmBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        confirmBtn.classList.add('bg-green-700');

        // Đợi 1s rồi đóng modal và gọi callback
        setTimeout(() => {
            modal.classList.add('animate-fade-out');
            setTimeout(() => {
                modalContainer.remove();
                if (onSuccess) onSuccess();
            }, 200);
        }, 1500);
    });

    // Giả lập thanh toán tự động (trong production, đây sẽ là webhook/polling từ backend)
    simulateBtn.addEventListener('click', async () => {
        const statusEl = document.getElementById('qr-payment-status');
        confirmBtn.disabled = true;
        simulateBtn.disabled = true;
        
        simulateBtn.innerHTML = `
            <span class="material-symbols-outlined animate-spin">progress_activity</span>
            <span>Đang xử lý...</span>
        `;

        // Giả lập delay xác nhận thanh toán
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Thành công
        statusEl.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                <span class="material-symbols-outlined text-3xl">check_circle</span>
                <span class="text-lg font-bold">Thanh toán thành công!</span>
            </div>
        `;

        simulateBtn.innerHTML = `
            <span class="material-symbols-outlined">check</span>
            <span>Đã thanh toán</span>
        `;
        simulateBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        simulateBtn.classList.add('bg-blue-700');

        // Đợi 1s rồi đóng modal và gọi callback
        setTimeout(() => {
            modal.classList.add('animate-fade-out');
            setTimeout(() => {
                modalContainer.remove();
                if (onSuccess) onSuccess();
            }, 200);
        }, 1500);
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

/**
 * Kiểm tra trạng thái thanh toán (giả lập)
 * Trong production, hàm này sẽ call API backend để check webhook từ ngân hàng
 * @param {string} orderId - Mã đơn hàng
 * @returns {Promise<boolean>} True nếu đã thanh toán
 */
export async function checkPaymentStatus(orderId) {
    // Giả lập API call
    return new Promise((resolve) => {
        setTimeout(() => {
            // Random success (70% thành công cho demo)
            resolve(Math.random() > 0.3);
        }, 1000);
    });
}

/**
 * Format bank info for display
 */
export function getBankInfo() {
    const bankNames = {
        '970422': 'Ngân hàng TMCP Quân đội (MB Bank)',
        '970436': 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)',
        '970407': 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)',
    };

    return {
        bankName: bankNames[BANK_CONFIG.bankId] || 'Ngân hàng',
        accountNo: BANK_CONFIG.accountNo,
        accountName: BANK_CONFIG.accountName
    };
}

console.log('✅ QR Payment module loaded');
