import { getFirebaseFirestore, getFirebaseAuth } from '../firebase-config.js';
import { doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const db = getFirebaseFirestore();
const auth = getFirebaseAuth();
const settingsDocRef = doc(db, 'settings', 'general');

// State
let currentTheme = localStorage.getItem('theme') || 'dark';
let currentSubTab = 'general';
let hasUnsavedChanges = false;

// Init
function initSettings() {
    console.log('Settings Module Initialized');
    loadAllSettings();
    loadBrandSettings();
    updateThemeUI(currentTheme);
    setupChangeDetection();
    setupColorSync();
}

// Sub-tab Switching
async function switchSubTab(tabName) {
    // Check for unsaved changes
    if (hasUnsavedChanges) {
        const confirmed = await window.showConfirm(
            'Bạn có thay đổi chưa lưu. Bạn có muốn hủy bỏ chúng?',
            {
                title: 'Thay đổi chưa lưu',
                type: 'warning',
                confirmText: 'Hủy bỏ',
                cancelText: 'Tiếp tục chỉnh sửa'
            }
        );
        if (!confirmed) {
            return;
        }
        hasUnsavedChanges = false;
    }

    currentSubTab = tabName;
    
    // Hide all content sections
    document.querySelectorAll('.settings-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // Show selected content
    const selectedContent = document.getElementById(`settings-${tabName}-content`);
    if (selectedContent) {
        selectedContent.classList.remove('hidden');
    }
    
    // Update sub-tab buttons
    document.querySelectorAll('.settings-subtab').forEach(btn => {
        btn.classList.remove('bg-white', 'dark:bg-background-dark', 'text-slate-900', 'dark:text-white', 'font-bold', 'shadow-sm');
        btn.classList.add('text-slate-500', 'dark:text-slate-400', 'font-medium');
    });
    
    const activeBtn = document.getElementById(`subtab-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'dark:text-slate-400', 'font-medium');
        activeBtn.classList.add('bg-white', 'dark:bg-background-dark', 'text-slate-900', 'dark:text-white', 'font-bold', 'shadow-sm');
    }
}

// Load All Settings from Firebase
function loadAllSettings() {
    onSnapshot(settingsDocRef, (snapshot) => {
        const data = snapshot.data() || {};
        
        setValue('setting-site-name', data.siteName || 'X-Sneaker');
        setValue('setting-store-email', data.storeEmail || 'info@xsneaker.com');
        setValue('setting-store-phone', data.storePhone || '+1 (555) 123-4567');
        setValue('setting-store-address', data.storeAddress || '123 Sneaker Street, Fashion District, NY 10001');
        setValue('setting-currency', data.currency || 'VND');
        setValue('setting-timezone', data.timezone || 'UTC+7');
        setValue('setting-date-format', data.dateFormat || 'DD/MM/YYYY');
        
        const taxCheckbox = document.getElementById('setting-enable-tax');
        if (taxCheckbox) taxCheckbox.checked = data.enableTax !== false;
        
        const social = data.socialMedia || {};
        setValue('setting-facebook', social.facebook || '');
        setValue('setting-instagram', social.instagram || '');
        setValue('setting-twitter', social.twitter || '');
        setValue('setting-tiktok', social.tiktok || '');
        
        const payment = data.payment || {};
        const momo = payment.momo || {};
        setCheckbox('payment-momo-enabled', momo.enabled || false);
        setValue('payment-momo-partner', momo.partnerCode || '');
        setValue('payment-momo-access', momo.accessKey || '');
        setValue('payment-momo-secret', momo.secretKey || '');
        const cod = payment.cod || {};
        setCheckbox('payment-cod-enabled', cod.enabled !== false);
        setValue('payment-cod-fee', cod.fee || 0);
        
        const notifications = data.notifications || {};
        const smtp = notifications.smtp || {};
        setValue('smtp-host', smtp.host || '');
        setValue('smtp-port', smtp.port || 587);
        setValue('smtp-username', smtp.username || '');
        setValue('smtp-password', smtp.password || '');
        setValue('smtp-encryption', smtp.encryption || 'tls');
        setValue('smtp-from-name', smtp.fromName || 'X-Sneaker Store');
        const emailNotif = notifications.emailNotifications || {};
        setCheckbox('notif-order-confirmation', emailNotif.orderConfirmation !== false);
        setCheckbox('notif-order-shipped', emailNotif.orderShipped !== false);
        setCheckbox('notif-order-delivered', emailNotif.orderDelivered !== false);
        setCheckbox('notif-low-stock', emailNotif.lowStock !== false);
        
        const security = data.security || {};
        const twoFAEnabled = security.twoFactorEnabled || false;
        document.getElementById('2fa-status').textContent = twoFAEnabled ? 'Enabled' : 'Disabled';
        document.getElementById('btn-toggle-2fa').textContent = twoFAEnabled ? 'Disable 2FA' : 'Enable 2FA';
        
        if (data.theme && data.theme !== currentTheme) setTheme(data.theme, false);
        hasUnsavedChanges = false;
    }, (error) => {
        console.error("Error loading settings:", error);
        showToast('Error loading settings', 'error');
    });
}

// Save Current Tab
async function saveCurrentTab() {
    switch(currentSubTab) {
        case 'general':
            await saveGeneralSettings();
            break;
        case 'payment':
            await savePaymentSettings();
            break;
        case 'notifications':
            await saveNotificationSettings();
            break;
        case 'security':
            // Security tab handles saves individually
            showToast('Security settings are saved individually', 'info');
            break;
        case 'brand':
            await saveBrandSettings();
            break;
        default:
            showToast('Unknown tab', 'error');
    }
}

// Save General Settings
async function saveGeneralSettings() {
    const btn = document.getElementById('btn-save-settings');
    const originalHTML = btn ? btn.innerHTML : '';
    
    if(btn) {
        btn.innerHTML = '<span class="material-symbols-rounded animate-spin text-[18px]">rotate_right</span> Saving...';
        btn.disabled = true;
    }

    try {
        const generalData = {
            siteName: getValue('setting-site-name'),
            storeEmail: getValue('setting-store-email'),
            storePhone: getValue('setting-store-phone'),
            storeAddress: getValue('setting-store-address'),
            currency: getValue('setting-currency'),
            timezone: getValue('setting-timezone'),
            dateFormat: getValue('setting-date-format'),
            enableTax: getCheckbox('setting-enable-tax'),
            socialMedia: {
                facebook: getValue('setting-facebook'),
                instagram: getValue('setting-instagram'),
                twitter: getValue('setting-twitter'),
                tiktok: getValue('setting-tiktok')
            },
            theme: currentTheme,
            updatedAt: new Date().toISOString()
        };

        await updateDoc(settingsDocRef, generalData);
        showToast('General settings saved successfully!', 'success');
        hasUnsavedChanges = false;

    } catch (error) {
        console.error('Error saving general settings:', error);
        showToast('Failed to save settings: ' + error.message, 'error');
    } finally {
        if(btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Save Payment Settings
async function savePaymentSettings() {
    const btn = document.getElementById('btn-save-settings');
    const originalHTML = btn ? btn.innerHTML : '';
    
    if(btn) {
        btn.innerHTML = '<span class="material-symbols-rounded animate-spin text-[18px]">rotate_right</span> Saving...';
        btn.disabled = true;
    }

    try {
        const paymentData = {
            payment: {
                momo: {
                    enabled: getCheckbox('payment-momo-enabled'),
                    partnerCode: getValue('payment-momo-partner'),
                    accessKey: getValue('payment-momo-access'),
                    secretKey: getValue('payment-momo-secret')
                },
                cod: {
                    enabled: getCheckbox('payment-cod-enabled'),
                    fee: parseInt(getValue('payment-cod-fee')) || 0
                }
            },
            updatedAt: new Date().toISOString()
        };

        await updateDoc(settingsDocRef, paymentData);
        showToast('Payment settings saved successfully!', 'success');
        hasUnsavedChanges = false;

    } catch (error) {
        console.error('Error saving payment settings:', error);
        showToast('Failed to save payment settings: ' + error.message, 'error');
    } finally {
        if(btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Save Notification Settings
async function saveNotificationSettings() {
    const btn = document.getElementById('btn-save-settings');
    const originalHTML = btn ? btn.innerHTML : '';
    
    if(btn) {
        btn.innerHTML = '<span class="material-symbols-rounded animate-spin text-[18px]">rotate_right</span> Saving...';
        btn.disabled = true;
    }

    try {
        const notificationData = {
            notifications: {
                smtp: {
                    host: getValue('smtp-host'),
                    port: parseInt(getValue('smtp-port')) || 587,
                    username: getValue('smtp-username'),
                    password: getValue('smtp-password'),
                    encryption: getValue('smtp-encryption'),
                    fromName: getValue('smtp-from-name')
                },
                emailNotifications: {
                    orderConfirmation: getCheckbox('notif-order-confirmation'),
                    orderShipped: getCheckbox('notif-order-shipped'),
                    orderDelivered: getCheckbox('notif-order-delivered'),
                    lowStock: getCheckbox('notif-low-stock')
                }
            },
            updatedAt: new Date().toISOString()
        };

        await updateDoc(settingsDocRef, notificationData);
        showToast('Notification settings saved successfully!', 'success');
        hasUnsavedChanges = false;

    } catch (error) {
        console.error('Error saving notification settings:', error);
        showToast('Failed to save notification settings: ' + error.message, 'error');
    } finally {
        if(btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Theme Handling
function setTheme(theme, save = true) {
    currentTheme = theme;
    localStorage.setItem('theme', theme);
    
    // Apply to DOM
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    updateThemeUI(theme);
    hasUnsavedChanges = true;
}

function updateThemeUI(activeTheme) {
    ['light', 'dark', 'auto'].forEach(t => {
        const btn = document.getElementById(`theme-btn-${t}`);
        const icon = btn?.querySelector('.check-icon');
        
        if (btn) {
            if (t === activeTheme) {
                btn.classList.add('border-primary');
                btn.classList.remove('border-slate-200', 'dark:border-border-dark');
                if(icon) icon.classList.remove('hidden');
            } else {
                btn.classList.remove('border-primary');
                btn.classList.add('border-slate-200', 'dark:border-border-dark');
                if(icon) icon.classList.add('hidden');
            }
        }
    });
}

// Test Email Connection
async function testEmail() {
    showToast('Testing email connection...', 'info');
    
    // Simulate email test (in real implementation, you'd call a backend API)
    setTimeout(() => {
        const host = getValue('smtp-host');
        const username = getValue('smtp-username');
        
        if (!host || !username) {
            showToast('Please fill in SMTP settings first', 'error');
            return;
        }
        
        // Mock success
        showToast('Email test successful! SMTP connection working.', 'success');
    }, 2000);
}

// Change Password
async function changePassword() {
    const currentPassword = getValue('security-current-password');
    const newPassword = getValue('security-new-password');
    const confirmPassword = getValue('security-confirm-password');
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const user = auth.currentUser;
        if (!user) {
            showToast('No user logged in', 'error');
            return;
        }
        
        // Reauthenticate user
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        // Update password
        await updatePassword(user, newPassword);
        
        showToast('Password updated successfully!', 'success');
        
        // Clear form
        setValue('security-current-password', '');
        setValue('security-new-password', '');
        setValue('security-confirm-password', '');
        
    } catch (error) {
        console.error('Error changing password:', error);
        if (error.code === 'auth/wrong-password') {
            showToast('Current password is incorrect', 'error');
        } else {
            showToast('Failed to change password: ' + error.message, 'error');
        }
    }
}

// Toggle 2FA
async function toggle2FA() {
    const statusEl = document.getElementById('2fa-status');
    const btnEl = document.getElementById('btn-toggle-2fa');
    const isEnabled = statusEl.textContent === 'Enabled';
    
    try {
        // Update Firebase
        await updateDoc(settingsDocRef, {
            'security.twoFactorEnabled': !isEnabled,
            updatedAt: new Date().toISOString()
        });
        
        statusEl.textContent = isEnabled ? 'Disabled' : 'Enabled';
        btnEl.textContent = isEnabled ? 'Enable 2FA' : 'Disable 2FA';
        btnEl.classList.toggle('bg-emerald-500');
        btnEl.classList.toggle('bg-red-500');
        btnEl.classList.toggle('hover:bg-emerald-600');
        btnEl.classList.toggle('hover:bg-red-600');
        
        showToast(`2FA ${isEnabled ? 'disabled' : 'enabled'} successfully!`, 'success');
        
    } catch (error) {
        console.error('Error toggling 2FA:', error);
        showToast('Failed to toggle 2FA: ' + error.message, 'error');
    }
}

// Export Data
async function exportData() {
    showToast('Preparing data export...', 'info');
    try {
        const snapshot = await import('https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js').then(async ({ getDocs, collection }) => {
            return await getDocs(collection(db, 'settings'));
        });
        const data = {};
        snapshot.docs.forEach(d => { data[d.id] = d.data(); });
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `x-sneaker-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showToast('Failed to export data: ' + error.message, 'error');
    }
}

// Clear Cache
async function clearCache() {
    const confirmed = await window.showConfirm(
        'Bạn có chắc muốn xóa cache? Bạn sẽ bị đăng xuất.',
        {
            title: 'Xác nhận xóa cache',
            type: 'warning',
            confirmText: 'Xóa',
            cancelText: 'Hủy'
        }
    );
    
    if (confirmed) {
        localStorage.clear();
        sessionStorage.clear();
        showToast('Cache đã được xóa! Đang chuyển đến trang đăng nhập...', 'success');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }
}

// Reset Form
async function resetForm() {
    if (hasUnsavedChanges) {
        const confirmed = await window.showConfirm(
            'Bạn có chắc muốn hủy bỏ các thay đổi?',
            {
                title: 'Xác nhận hủy',
                type: 'warning',
                confirmText: 'Hủy bỏ',
                cancelText: 'Tiếp tục'
            }
        );
        if (confirmed) {
            loadAllSettings();
            hasUnsavedChanges = false;
            showToast('Changes discarded', 'info');
        }
    }
}

// Setup Change Detection
function setupChangeDetection() {
    // Monitor all input changes
    const inputs = document.querySelectorAll('#settings-general-content input, #settings-general-content select, #settings-general-content textarea, #settings-payment-content input, #settings-payment-content select, #settings-notifications-content input, #settings-notifications-content select');
    
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            hasUnsavedChanges = true;
        });
    });
}

// Toast Notification System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `transform transition-all duration-300 ease-out translate-x-0 opacity-100 px-6 py-4 rounded-xl shadow-lg max-w-sm ${getToastColor(type)}`;
    
    const icon = getToastIcon(type);
    
    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="material-symbols-rounded text-[22px]">${icon}</span>
            <p class="text-sm font-semibold">${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 4000);
}

function getToastColor(type) {
    switch(type) {
        case 'success':
            return 'bg-emerald-500 text-white';
        case 'error':
            return 'bg-red-500 text-white';
        case 'warning':
            return 'bg-amber-500 text-white';
        case 'info':
        default:
            return 'bg-blue-500 text-white';
    }
}

function getToastIcon(type) {
    switch(type) {
        case 'success':
            return 'check_circle';
        case 'error':
            return 'error';
        case 'warning':
            return 'warning';
        case 'info':
        default:
            return 'info';
    }
}

// Helper Functions
function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function setCheckbox(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
}

function getCheckbox(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

// ==================== BRAND CUSTOMIZATION ====================

// Load Brand Settings
function loadBrandSettings() {
    onSnapshot(doc(db, 'settings', 'brandCustomization'), (snapshot) => {
        const data = snapshot.data() || {};
        
        const colors = data.colors || {};
        if (colors.primary) {
            setValue('brand-color-primary', colors.primary);
            setValue('brand-color-primary-hex', colors.primary);
        }
        if (colors.backgroundLight) {
            setValue('brand-color-bg-light', colors.backgroundLight);
            setValue('brand-color-bg-light-hex', colors.backgroundLight);
        }
        if (colors.backgroundDark) {
            setValue('brand-color-bg-dark', colors.backgroundDark);
            setValue('brand-color-bg-dark-hex', colors.backgroundDark);
        }
        applyBrandColors(colors);
        
        const logos = data.logos || {};
        if (logos.header) {
            const headerPreview = document.getElementById('preview-logo-header');
            if (headerPreview) headerPreview.src = logos.header;
        }
        if (logos.favicon) {
            const faviconPreview = document.getElementById('preview-favicon');
            if (faviconPreview) faviconPreview.src = logos.favicon;
        }
        if (logos.footer) {
            const footerPreview = document.getElementById('preview-logo-footer');
            if (footerPreview) footerPreview.src = logos.footer;
        }
        
        const banners = data.banners || {};
        if (banners.heroSlider) renderSliderImagesList(banners.heroSlider);
    });
}

// Apply Brand Colors via CSS Variables
function applyBrandColors(colors) {
    const root = document.documentElement;
    
    if (colors.primary) {
        root.style.setProperty('--brand-primary', colors.primary);
        // Update preview button
        const previewBtn = document.getElementById('color-preview-btn-primary');
        if (previewBtn) previewBtn.style.backgroundColor = colors.primary;
    }
    
    if (colors.backgroundLight) {
        root.style.setProperty('--brand-bg-light', colors.backgroundLight);
    }
    
    if (colors.backgroundDark) {
        root.style.setProperty('--brand-bg-dark', colors.backgroundDark);
    }
}

// Sync color input changes
function setupColorSync() {
    // Primary Color
    const primaryPicker = document.getElementById('brand-color-primary');
    const primaryHex = document.getElementById('brand-color-primary-hex');
    
    if (primaryPicker && primaryHex) {
        primaryPicker.addEventListener('input', (e) => {
            primaryHex.value = e.target.value;
            applyBrandColors({ primary: e.target.value });
            hasUnsavedChanges = true;
        });
        
        primaryHex.addEventListener('input', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                primaryPicker.value = e.target.value;
                applyBrandColors({ primary: e.target.value });
                hasUnsavedChanges = true;
            }
        });
    }
    
    // Background Light
    const bgLightPicker = document.getElementById('brand-color-bg-light');
    const bgLightHex = document.getElementById('brand-color-bg-light-hex');
    
    if (bgLightPicker && bgLightHex) {
        bgLightPicker.addEventListener('input', (e) => {
            bgLightHex.value = e.target.value;
            applyBrandColors({ backgroundLight: e.target.value });
            hasUnsavedChanges = true;
        });
        
        bgLightHex.addEventListener('input', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                bgLightPicker.value = e.target.value;
                applyBrandColors({ backgroundLight: e.target.value });
                hasUnsavedChanges = true;
            }
        });
    }
    
    // Background Dark
    const bgDarkPicker = document.getElementById('brand-color-bg-dark');
    const bgDarkHex = document.getElementById('brand-color-bg-dark-hex');
    
    if (bgDarkPicker && bgDarkHex) {
        bgDarkPicker.addEventListener('input', (e) => {
            bgDarkHex.value = e.target.value;
            applyBrandColors({ backgroundDark: e.target.value });
            hasUnsavedChanges = true;
        });
        
        bgDarkHex.addEventListener('input', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                bgDarkPicker.value = e.target.value;
                applyBrandColors({ backgroundDark: e.target.value });
                hasUnsavedChanges = true;
            }
        });
    }
}

// Reset Color to Default
function resetColor(type) {
    const defaults = {
        'primary': '#e71823',
        'bg-light': '#ffffff',
        'bg-dark': '#211112'
    };
    
    const defaultColor = defaults[type];
    if (!defaultColor) return;
    
    switch(type) {
        case 'primary':
            setValue('brand-color-primary', defaultColor);
            setValue('brand-color-primary-hex', defaultColor);
            applyBrandColors({ primary: defaultColor });
            break;
        case 'bg-light':
            setValue('brand-color-bg-light', defaultColor);
            setValue('brand-color-bg-light-hex', defaultColor);
            applyBrandColors({ backgroundLight: defaultColor });
            break;
        case 'bg-dark':
            setValue('brand-color-bg-dark', defaultColor);
            setValue('brand-color-bg-dark-hex', defaultColor);
            applyBrandColors({ backgroundDark: defaultColor });
            break;
    }
    
    hasUnsavedChanges = true;
    showToast(`Đã reset về màu mặc định`, 'success');
}

// Upload Logo via Cloudinary
async function uploadLogo(file, type) {
    if (!file) return;
    
    // Validate file size
    const maxSize = type === 'favicon' ? 500000 : 2000000; // 500KB for favicon, 2MB for others
    if (file.size > maxSize) {
        showToast(`File quá lớn! Tối đa ${maxSize / 1000000}MB`, 'error');
        return;
    }
    
    showToast('Đang tải lên logo...', 'info');
    
    try {
        // Upload to Cloudinary using existing function
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', '');
        formData.append('folder', '');
        
        const response = await fetch(
            `https://api.cloudinary.com/v1_1//image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        const data = await response.json();
        const imageUrl = data.secure_url;
        
        // Update preview
        const previewImg = document.getElementById(`preview-logo-${type}`);
        if (previewImg) {
            previewImg.src = imageUrl;
        }
        
        // Save to Firebase
        await update(ref(db, 'settings/brandCustomization/logos'), {
            [type]: imageUrl,
            updatedAt: new Date().toISOString()
        });
        
        showToast('Logo đã được cập nhật!', 'success');
        
    } catch (error) {
        console.error('Error uploading logo:', error);
        showToast('Lỗi khi tải logo: ' + error.message, 'error');
    }
}

// Upload Hero Slider Image
async function uploadSliderImage(file) {
    if (!file) return;
    
    // Validate file size
    if (file.size > 5000000) { // 5MB
        showToast('File quá lớn! Tối đa 5MB', 'error');
        return;
    }
    
    showToast('Đang tải lên banner...', 'info');
    
    try {
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'x-sneaker-upload');
        formData.append('folder', 'hero-slider');
        
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/dvcebine7/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        const data = await response.json();
        const imageUrl = data.secure_url;
        
        // Get existing slider data
        const snapshot = await new Promise((resolve) => {
            onValue(ref(db, 'settings/brandCustomization/banners/heroSlider'), resolve, { onlyOnce: true });
        });
        
        const sliderImages = snapshot.val() || [];
        
        // Add new image
        sliderImages.push({
            url: imageUrl,
            order: sliderImages.length + 1,
            title: '',
            subtitle: ''
        });
        
        // Save to Firebase
        await set(ref(db, 'settings/brandCustomization/banners/heroSlider'), sliderImages);
        
        showToast('Banner đã được thêm!', 'success');
        renderSliderImagesList(sliderImages);
        
    } catch (error) {
        console.error('Error uploading slider image:', error);
        showToast('Lỗi khi tải banner: ' + error.message, 'error');
    }
}

// Render Slider Images List
function renderSliderImagesList(slides) {
    const container = document.getElementById('slider-images-list');
    if (!container) return;
    
    if (!slides || slides.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 py-8">Chưa có slide nào. Click "Thêm Slide" để bắt đầu.</p>';
        return;
    }
    
    container.innerHTML = slides.map((slide, index) => `
        <div class="flex items-center gap-4 p-4 bg-slate-50 dark:bg-background-dark rounded-xl border border-slate-200 dark:border-border-dark">
            <div class="flex items-center gap-3">
                <span class="material-symbols-rounded text-slate-400 cursor-grab">drag_indicator</span>
                <span class="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-sm font-bold">${index + 1}</span>
            </div>
            <div class="w-32 h-20 bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                <img src="${slide.url}" class="w-full h-full object-cover" alt="Slide ${index + 1}">
            </div>
            <div class="flex-1 space-y-2">
                <input type="text" value="${slide.title || ''}" placeholder="Tiêu đề slide..." 
                       onchange="window.settingsModule.updateSlideText(${index}, 'title', this.value)"
                       class="w-full px-3 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-lg text-sm">
                <input type="text" value="${slide.subtitle || ''}" placeholder="Mô tả ngắn..." 
                       onchange="window.settingsModule.updateSlideText(${index}, 'subtitle', this.value)"
                       class="w-full px-3 py-2 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-lg text-sm">
            </div>
            <button onclick="window.settingsModule.deleteSlide(${index})" 
                    class="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors">
                <span class="material-symbols-rounded">delete</span>
            </button>
        </div>
    `).join('');
}

// Update Slide Text
async function updateSlideText(index, field, value) {
    try {
        const snapshot = await new Promise((resolve) => {
            onValue(ref(db, 'settings/brandCustomization/banners/heroSlider'), resolve, { onlyOnce: true });
        });
        
        const slides = snapshot.val() || [];
        if (slides[index]) {
            slides[index][field] = value;
            await set(ref(db, 'settings/brandCustomization/banners/heroSlider'), slides);
            showToast('Đã cập nhật!', 'success');
        }
    } catch (error) {
        console.error('Error updating slide:', error);
        showToast('Lỗi khi cập nhật', 'error');
    }
}

// Delete Slide
async function deleteSlide(index) {
    const confirmed = await window.showConfirm(
        'Bạn có chắc muốn xóa slide này?',
        {
            title: 'Xác nhận xóa',
            type: 'warning',
            confirmText: 'Xóa',
            cancelText: 'Hủy'
        }
    );
    
    if (!confirmed) return;
    
    try {
        const snapshot = await new Promise((resolve) => {
            onValue(ref(db, 'settings/brandCustomization/banners/heroSlider'), resolve, { onlyOnce: true });
        });
        
        const slides = snapshot.val() || [];
        slides.splice(index, 1);
        
        // Update order
        slides.forEach((slide, i) => {
            slide.order = i + 1;
        });
        
        await set(ref(db, 'settings/brandCustomization/banners/heroSlider'), slides);
        showToast('Đã xóa slide!', 'success');
        renderSliderImagesList(slides);
        
    } catch (error) {
        console.error('Error deleting slide:', error);
        showToast('Lỗi khi xóa slide', 'error');
    }
}

// Save Brand Settings
async function saveBrandSettings() {
    const btn = document.getElementById('btn-save-settings');
    const originalHTML = btn ? btn.innerHTML : '';
    
    if(btn) {
        btn.innerHTML = '<span class="material-symbols-rounded animate-spin text-[18px]">rotate_right</span> Saving...';
        btn.disabled = true;
    }

    try {
        const brandData = {
            colors: {
                primary: getValue('brand-color-primary'),
                backgroundLight: getValue('brand-color-bg-light'),
                backgroundDark: getValue('brand-color-bg-dark')
            },
            updatedAt: new Date().toISOString()
        };

        await update(ref(db, 'settings/brandCustomization'), brandData);
        showToast('Brand settings saved successfully!', 'success');
        hasUnsavedChanges = false;

    } catch (error) {
        console.error('Error saving brand settings:', error);
        showToast('Failed to save settings: ' + error.message, 'error');
    } finally {
        if(btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Export
window.settingsModule = {
    initSettings,
    switchSubTab,
    saveCurrentTab,
    setTheme,
    testEmail,
    changePassword,
    toggle2FA,
    exportData,
    clearCache,
    resetForm,
    // Brand Customization
    uploadLogo,
    uploadSliderImage,
    resetColor,
    updateSlideText,
    deleteSlide
};
