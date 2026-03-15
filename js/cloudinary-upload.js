// Cloudinary Upload Helper for X-Sneaker
// Handles avatar uploads to Cloudinary

import { cloudinaryConfig } from './firebase-config.js';

const CLOUDINARY_CONFIG = {
    ...cloudinaryConfig,
    maxFileSize: 2000000, // 2MB
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp']
};

/**
 * Initialize Cloudinary Upload Widget
 * @param {Function} onUploadSuccess - Callback khi upload thành công
 * @returns {Object} Cloudinary widget instance
 */
export function initCloudinaryWidget(onUploadSuccess) {
    if (typeof cloudinary === 'undefined') {
        console.error('Cloudinary script chưa được load!');
        return null;
    }

    const widget = cloudinary.createUploadWidget({
        cloudName: CLOUDINARY_CONFIG.cloudName,
        uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
        folder: CLOUDINARY_CONFIG.folder,
        sources: ['local', 'camera'],
        multiple: false,
        maxFileSize: CLOUDINARY_CONFIG.maxFileSize,
        clientAllowedFormats: CLOUDINARY_CONFIG.allowedFormats,
        cropping: true,
        croppingAspectRatio: 1,
        croppingShowDimensions: true,
        showSkipCropButton: false,
        styles: {
            palette: {
                window: "#FFFFFF",
                windowBorder: "#ff3c3c",
                tabIcon: "#ff3c3c",
                menuIcons: "#5A616A",
                textDark: "#000000",
                textLight: "#FFFFFF",
                link: "#ff3c3c",
                action: "#ff3c3c",
                inactiveTabIcon: "#0E2F5A",
                error: "#F44235",
                inProgress: "#ff3c3c",
                complete: "#20B832",
                sourceBg: "#E4EBF1"
            }
        }
    }, (error, result) => {
        if (error) {
            console.error('Cloudinary upload error:', error);
            if (window.showToast) {
                window.showToast('Upload thất bại! Vui lòng thử lại.', 'error');
            }
            return;
        }

        if (result.event === 'success') {
            console.log('Upload successful:', result.info);
            if (onUploadSuccess) {
                onUploadSuccess(result.info.secure_url);
            }
        }
    });

    return widget;
}

/**
 * Upload file trực tiếp qua API (alternative method)
 * @param {File} file - File object to upload
 * @returns {Promise<string>} URL của ảnh đã upload
 */
export async function uploadAvatarDirect(file) {
    // Validate file
    if (!file) {
        throw new Error('No file provided');
    }

    if (file.size > CLOUDINARY_CONFIG.maxFileSize) {
        throw new Error('File quá lớn! Tối đa 2MB.');
    }

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!CLOUDINARY_CONFIG.allowedFormats.includes(fileExt)) {
        throw new Error('Định dạng file không hợp lệ! Chỉ chấp nhận: ' + CLOUDINARY_CONFIG.allowedFormats.join(', '));
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
    formData.append('folder', CLOUDINARY_CONFIG.folder);

    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        return data.secure_url;

    } catch (error) {
        console.error('Upload error:', error);
        throw new Error('Không thể upload ảnh. Vui lòng thử lại.');
    }
}

/**
 * Get optimized image URL with transformations
 * @param {string} url - Original Cloudinary URL
 * @param {Object} options - Transformation options
 * @returns {string} Transformed URL
 */
export function getOptimizedImageUrl(url, options = {}) {
    if (!url || !url.includes('cloudinary.com')) {
        return url;
    }

    try {
        const {
            width = 400,
            height = 400,
            crop = 'fill',
            quality = 'auto',
            format = 'auto'
        } = options;

        // Simplified transformation for better compatibility
        // Use c_limit instead of c_cover/c_fill for free tier
        const transformation = `w_${width},h_${height},c_limit`;
        
        // Check if already has transformation
        if (url.includes('/upload/')) {
            return url.replace('/upload/', `/upload/${transformation}/`);
        }
        
        return url;
    } catch (error) {
        console.warn('Image optimization failed, using original URL:', error);
        return url;
    }
}

console.log('✅ Cloudinary upload module loaded');
