// Firebase Authentication Module for FoodSaver
// Version: 2.0.0 - Firestore

import { getFirebaseAuth, getFirebaseFirestore } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithCredential,
  sendPasswordResetEmail,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// Get Firebase instances from shared config
const auth = getFirebaseAuth();
const db = getFirebaseFirestore();

// Admin email
const ADMIN_EMAIL = 'quantrifs@gmail.com'; // User specified admin email

// Providers
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showToast(message, type = "success") {
  if (window.showToast) {
    window.showToast(message);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

function setLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML =
      '<span class="material-symbols-outlined animate-spin">progress_activity</span> Đang xử lý...';
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

/**
 * Save user data to Firestore
 */
async function saveUserToDatabase(user, additionalData = {}) {
  try {
    const userRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(userRef);

    const isAdmin = user.email === ADMIN_EMAIL;

    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || additionalData.displayName || 'User',
      photoURL: user.photoURL || '../image/default-avatar.jpg',
      emailVerified: user.emailVerified,
      lastLogin: serverTimestamp(),
      ...additionalData,
    };

    if (!snapshot.exists()) {
      // New user - create full profile
      await setDoc(userRef, {
        ...userData,
        createdAt: serverTimestamp(),
        role: isAdmin ? 'admin' : 'customer',
        isAdmin: isAdmin,
        addresses: [],
        wishlist: [],
        loyaltyPoints: 0,
      });
    } else {
      // Existing user - update login time and basic info
      const updates = {
        lastLogin: serverTimestamp(),
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        emailVerified: userData.emailVerified,
      };

      // Force admin role for admin email
      if (isAdmin) {
        updates.role = 'admin';
        updates.isAdmin = true;
      }

      await updateDoc(userRef, updates);
    }

    return userData;
  } catch (error) {
    console.error('Error saving user to Firestore:', error);
    throw error;
  }
}

/**
 * Get user data from Firestore
 */
export async function getUserData(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

export async function registerUser(email, password, displayName, gender = '') {
  const submitButton = document.querySelector('button[type="submit"]');
  try {
    setLoading(submitButton, true);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await updateProfile(user, { displayName });
    await saveUserToDatabase(user, { displayName, gender });
    showToast(`Chào mừng ${displayName}! Đăng ký thành công.`);
    window.location.href = 'Account.html';
  } catch (error) {
    console.error('Registration error:', error);
    let errorMessage = 'Đăng ký thất bại. Vui lòng thử lại.';
    switch (error.code) {
      case 'auth/email-already-in-use': errorMessage = 'Email này đã được sử dụng!'; break;
      case 'auth/invalid-email': errorMessage = 'Email không hợp lệ!'; break;
      case 'auth/weak-password': errorMessage = 'Mật khẩu quá yếu!'; break;
    }
    showToast(errorMessage, 'error');
    throw error;
  } finally {
    setLoading(submitButton, false);
  }
}

export async function loginUser(email, password) {
  const submitButton = document.querySelector('button[type="submit"]');
  try {
    setLoading(submitButton, true);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await saveUserToDatabase(user);
    showToast(`Chào mừng trở lại, ${user.displayName || 'bạn'}!`);
    window.location.href = user.email === ADMIN_EMAIL ? 'admin.html' : 'Account.html';
  } catch (error) {
    console.error('Login error:', error);
    let errorMessage = 'Đăng nhập thất bại. Vui lòng thử lại.';
    switch (error.code) {
      case 'auth/invalid-email': errorMessage = 'Email không hợp lệ!'; break;
      case 'auth/user-disabled': errorMessage = 'Tài khoản đã bị vô hiệu hóa!'; break;
      case 'auth/user-not-found': errorMessage = 'Không tìm thấy tài khoản!'; break;
      case 'auth/wrong-password': errorMessage = 'Mật khẩu không đúng!'; break;
      case 'auth/invalid-credential': errorMessage = 'Email hoặc mật khẩu không đúng!'; break;
    }
    showToast(errorMessage, 'error');
    throw error;
  } finally {
    setLoading(submitButton, false);
  }
}

export async function loginWithGoogle() {
  try {
    const isHttps = window.location.protocol === 'https:';
    if (isHttps && typeof google !== 'undefined' && google.accounts) {
      const hasSession = await tryGoogleSilentSignIn();
      if (hasSession) return;
    } else {
      console.log('Google One Tap not available, using standard popup...');
    }

    console.log('Google not connected, showing popup...');
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await saveUserToDatabase(user);
    showToast(`Chào mừng ${user.displayName}!`);
    window.location.href = user.email === ADMIN_EMAIL ? 'admin.html' : 'Account.html';
  } catch (error) {
    console.error('Google login error:', error);
    let errorMessage = 'Đăng nhập Google thất bại!';
    switch (error.code) {
      case 'auth/popup-closed-by-user': errorMessage = 'Bạn đã đóng cửa sổ đăng nhập.'; break;
      case 'auth/cancelled-popup-request': return;
      case 'auth/popup-blocked': errorMessage = 'Popup bị chặn! Vui lòng cho phép popup.'; break;
      case 'auth/unauthorized-domain': errorMessage = 'Domain chưa được cấu hình trong Firebase Console!'; break;
    }
    showToast(errorMessage, 'error');
    throw error;
  }
}

async function tryGoogleSilentSignIn() {
  return new Promise((resolve) => {
    try {
      google.accounts.id.initialize({
        client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        callback: async (response) => {
          try {
            const credential = GoogleAuthProvider.credential(response.credential);
            const result = await signInWithCredential(auth, credential);
            const user = result.user;
            await saveUserToDatabase(user);
            showToast(`Chào mừng ${user.displayName}!`);
            window.location.href = user.email === ADMIN_EMAIL ? 'admin.html' : 'Account.html';
            resolve(true);
          } catch (error) {
            console.error('Google One Tap sign-in failed:', error);
            resolve(false);
          }
        },
        auto_select: true,
        cancel_on_tap_outside: false,
      });
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          resolve(false);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}

export async function loginWithFacebook() {
  try {
    const isHttps = window.location.protocol === 'https:';
    if (isHttps) {
      const loginStatus = await checkFacebookLoginStatus();
      if (loginStatus.status === 'connected') {
        await handleFacebookLogin(loginStatus.authResponse.accessToken);
        return;
      }
    }
    const result = await signInWithPopup(auth, facebookProvider);
    const user = result.user;
    await saveUserToDatabase(user);
    showToast(`Chào mừng ${user.displayName}!`);
    window.location.href = user.email === ADMIN_EMAIL ? 'admin.html' : 'Account.html';
  } catch (error) {
    console.error('Facebook login error:', error);
    let errorMessage = 'Đăng nhập Facebook thất bại!';
    switch (error.code) {
      case 'auth/popup-closed-by-user': errorMessage = 'Bạn đã đóng cửa sổ đăng nhập.'; break;
      case 'auth/cancelled-popup-request': return;
      case 'auth/popup-blocked': errorMessage = 'Popup bị chặn!'; break;
      case 'auth/account-exists-with-different-credential': errorMessage = 'Email đã được dùng với phương thức khác!'; break;
    }
    showToast(errorMessage, 'error');
    throw error;
  }
}

function checkFacebookLoginStatus() {
  return new Promise((resolve) => {
    if (typeof FB === 'undefined') { resolve({ status: 'unknown' }); return; }
    FB.getLoginStatus((response) => resolve(response));
  });
}

async function handleFacebookLogin(accessToken) {
  try {
    const credential = FacebookAuthProvider.credential(accessToken);
    const result = await signInWithCredential(auth, credential);
    const user = result.user;
    await saveUserToDatabase(user);
    showToast(`Chào mừng ${user.displayName}!`);
    window.location.href = user.email === ADMIN_EMAIL ? 'admin.html' : 'Account.html';
  } catch (error) {
    console.error('Facebook auto-login error:', error);
    throw error;
  }
}

export async function resetPassword(email) {
  const submitButton = document.querySelector('button[type="submit"]');
  try {
    setLoading(submitButton, true);
    await sendPasswordResetEmail(auth, email);
    showToast('Email khôi phục mật khẩu đã được gửi!');
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Password reset error:', error);
    let errorMessage = 'Không thể gửi email khôi phục!';
    switch (error.code) {
      case 'auth/invalid-email': errorMessage = 'Email không hợp lệ!'; break;
      case 'auth/user-not-found': errorMessage = 'Không tìm thấy tài khoản!'; break;
    }
    showToast(errorMessage, 'error');
    throw error;
  } finally {
    setLoading(submitButton, false);
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    showToast('Đã đăng xuất thành công!');
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Logout error:', error);
    showToast('Đăng xuất thất bại!', 'error');
    throw error;
  }
}

export function getCurrentUser() { return auth.currentUser; }
export function isUserLoggedIn() { return auth.currentUser !== null; }

export function initAuthStateObserver(callback) {
  onAuthStateChanged(auth, async (user) => {
    let isAdmin = false;
    if (user) {
      const userData = await getUserData(user.uid);
      if (userData && userData.isAdmin) {
        isAdmin = true;
      }
    }

    // Check if admin page and redirect if not admin
    const isAdminPage = window.location.pathname.includes('admin.html') || window.location.pathname.includes('/admin/');
    if (isAdminPage && !isAdmin) {
      console.log('⚠️ Non-admin user attempting to access admin page. Redirecting to home...');
      window.location.href = 'index.html';
      return;
    }

    if (typeof callback === 'function') callback(user);
  });
}

if (window.location.pathname.includes('Account.html')) {
  initAuthStateObserver((user) => {
    if (!user) window.location.href = 'login.html';
  });
}

export { auth, db };

console.log('✅ Firebase Auth module loaded successfully');
