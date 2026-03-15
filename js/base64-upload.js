// Base64 Upload Helper for FoodSaver
// Automatically compresses and converts image files to base64 Data URLs for Firestore

/**
 * Nén hình ảnh và chuyển thành chuỗi Base64
 * Kích thước chuỗi đầu ra thường rất nhỏ (vài chục KB) giúp tiết kiệm dung lượng Firestore (Giới hạn 1MB/Doc)
 * @param {File} file - File object to upload
 * @param {number} maxWidth - Chiều rộng tối đa (pixels)
 * @param {number} maxHeight - Chiều cao tối đa (pixels)
 * @param {number} quality - Chất lượng JPEG (0.1 -> 1.0)
 * @returns {Promise<string>} Chuỗi Base64 (Data URI)
 */
export async function uploadAvatarDirect(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    if (!file) {
        throw new Error('No file provided');
    }

    if (!file.type.startsWith('image/')) {
        throw new Error('Chỉ chấp nhận file định dạng hình ảnh!');
    }

    const targetMaxBytes = 180 * 1024;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Tính toán tỷ lệ mới nếu ảnh lớn hơn kích thước tối đa
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const drawAndEncode = (w, h, q) => {
                    canvas.width = w;
                    canvas.height = h;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    return canvas.toDataURL('image/jpeg', q);
                };

                const getDataUrlSizeBytes = (dataUrl) => {
                    const base64 = dataUrl.split(',')[1] || '';
                    return Math.ceil((base64.length * 3) / 4);
                };

                let outputWidth = width;
                let outputHeight = height;
                let outputQuality = quality;
                let base64String = drawAndEncode(outputWidth, outputHeight, outputQuality);
                let attempts = 0;

                // Keep compressing to stay below a safer Firestore payload threshold.
                while (getDataUrlSizeBytes(base64String) > targetMaxBytes && attempts < 8) {
                    attempts += 1;

                    if (outputQuality > 0.45) {
                        outputQuality = Math.max(0.45, outputQuality - 0.08);
                    } else {
                        outputWidth = Math.max(320, Math.round(outputWidth * 0.85));
                        outputHeight = Math.max(320, Math.round(outputHeight * 0.85));
                    }

                    base64String = drawAndEncode(outputWidth, outputHeight, outputQuality);
                }

                resolve(base64String);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

/**
 * Trả về chính chuỗi base64 (Hàm tương thích ngược với getOptimizedImageUrl của cloudinary)
 * @param {string} url - Original URL
 * @param {Object} options - Transformation options
 * @returns {string} Trả lại nguyên chuỗi URL gốc
 */
export function getOptimizedImageUrl(url, options = {}) {
    // Không cần gọi Optimizer nữa vì chuỗi hiện tại đã là Base64 siêu cấp nhẹ
    return url;
}

console.log('✅ Base64 Upload module loaded');
