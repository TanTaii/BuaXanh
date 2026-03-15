// Blog Comments System for X-Sneaker
// Handles comments display, posting, and replies with Firebase integration

import { getFirebaseDatabase } from './firebase-config.js';
import { ref, get, push, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const database = getFirebaseDatabase();
const auth = getAuth();

let currentUser = null;
let currentBlogId = null;

// ============================================================================
// AUTHENTICATION
// ============================================================================

function initAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            console.log('👤 User auth state:', user ? user.email : 'Not logged in');
            renderCommentForm();
            resolve(user);
        });
    });
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadComments(blogId) {
    try {
        const commentsRef = ref(database, `blogComments/${blogId}`);
        const snapshot = await get(commentsRef);
        
        if (snapshot.exists()) {
            const commentsData = snapshot.val();
            const comments = Object.keys(commentsData)
                .map(key => ({ id: key, ...commentsData[key] }))
                .filter(comment => !comment.parentId) // Only root comments
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            
            console.log(`✅ Loaded ${comments.length} comments`);
            return comments;
        }
        
        console.log('ℹ️ No comments yet');
        return [];
    } catch (error) {
        console.error('❌ Error loading comments:', error);
        return [];
    }
}

async function loadReplies(blogId, parentId) {
    try {
        const commentsRef = ref(database, `blogComments/${blogId}`);
        const snapshot = await get(commentsRef);
        
        if (snapshot.exists()) {
            const commentsData = snapshot.val();
            const replies = Object.keys(commentsData)
                .map(key => ({ id: key, ...commentsData[key] }))
                .filter(comment => comment.parentId === parentId)
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            return replies;
        }
        
        return [];
    } catch (error) {
        console.error('Error loading replies:', error);
        return [];
    }
}

async function getCommentCount(blogId) {
    try {
        const commentsRef = ref(database, `blogComments/${blogId}`);
        const snapshot = await get(commentsRef);
        
        if (snapshot.exists()) {
            return Object.keys(snapshot.val()).length;
        }
        
        return 0;
    } catch (error) {
        console.error('Error getting comment count:', error);
        return 0;
    }
}

// ============================================================================
// COMMENT POSTING
// ============================================================================

async function postComment(blogId, content, parentId = null) {
    if (!currentUser) {
        if (window.showToast) {
            window.showToast('Vui lòng đăng nhập để bình luận', 'warning');
        }
        window.location.href = 'login.html';
        return false;
    }
    
    if (!content.trim()) {
        if (window.showToast) {
            window.showToast('Nội dung bình luận không được để trống', 'warning');
        }
        return false;
    }
    
    try {
        const commentsRef = ref(database, `blogComments/${blogId}`);
        const newCommentRef = push(commentsRef);
        
        const commentData = {
            content: content.trim(),
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.displayName || currentUser.email.split('@')[0],
            userAvatar: currentUser.photoURL || null,
            timestamp: serverTimestamp(),
            likes: 0,
            parentId: parentId
        };
        
        await set(newCommentRef, commentData);
        
        console.log('✅ Comment posted successfully');
        return true;
    } catch (error) {
        console.error('❌ Error posting comment:', error);
        if (window.showToast) {
            window.showToast('Có lỗi xảy ra khi đăng bình luận. Vui lòng thử lại.', 'error');
        }
        return false;
    }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderCommentForm() {
    const container = document.getElementById('comment-form-container');
    if (!container) return;
    
    if (!currentUser) {
        // Show login prompt
        container.innerHTML = `
            <div class="text-center py-8">
                <span class="material-symbols-outlined text-5xl text-gray-300 mb-3">account_circle</span>
                <p class="text-gray-600 dark:text-gray-400 mb-4">Bạn cần đăng nhập để bình luận</p>
                <a href="login.html" class="inline-block bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors">
                    Đăng Nhập
                </a>
            </div>
        `;
    } else {
        // Show comment form
        container.innerHTML = `
            <div class="flex gap-4">
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${currentUser.photoURL ? `
                        <img src="${currentUser.photoURL}" alt="${currentUser.displayName}" class="w-full h-full object-cover"/>
                    ` : `
                        <span class="text-primary font-bold">${(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}</span>
                    `}
                </div>
                <div class="flex-1">
                    <textarea 
                        id="new-comment-textarea" 
                        class="w-full bg-white dark:bg-black border-gray-200 dark:border-gray-800 rounded-lg p-4 focus:ring-primary focus:border-primary text-base resize-none" 
                        placeholder="Chia sẻ ý kiến của bạn..." 
                        rows="3"></textarea>
                    <div class="flex justify-between items-center mt-3">
                        <span class="text-xs text-gray-500">
                            Đăng nhập với <strong>${currentUser.email}</strong>
                        </span>
                        <button 
                            id="post-comment-btn" 
                            class="bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            Đăng Bình Luận
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listener
        const postBtn = document.getElementById('post-comment-btn');
        const textarea = document.getElementById('new-comment-textarea');
        
        if (postBtn && textarea) {
            postBtn.addEventListener('click', async () => {
                const content = textarea.value;
                postBtn.disabled = true;
                postBtn.textContent = 'Đang đăng...';
                
                const success = await postComment(currentBlogId, content);
                
                if (success) {
                    textarea.value = '';
                    await refreshComments();
                }
                
                postBtn.disabled = false;
                postBtn.textContent = 'Đăng Bình Luận';
            });
            
            // Auto-resize textarea
            textarea.addEventListener('input', () => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            });
        }
    }
}

async function renderComments(blogId) {
    currentBlogId = blogId;
    const container = document.getElementById('comments-list');
    if (!container) return;
    
    const comments = await loadComments(blogId);
    
    // Update count
    const count = await getCommentCount(blogId);
    const countEl = document.getElementById('comments-count');
    if (countEl) {
        countEl.textContent = `(${count})`;
    }
    
    if (comments.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <span class="material-symbols-outlined text-6xl mb-3">chat_bubble_outline</span>
                <p class="text-lg font-medium">Chưa có bình luận nào</p>
                <p class="text-sm mt-2">Hãy là người đầu tiên chia sẻ ý kiến!</p>
            </div>
        `;
        return;
    }
    
    // Render each comment with replies
    const commentsHTML = await Promise.all(comments.map(comment => renderComment(comment, blogId)));
    container.innerHTML = commentsHTML.join('');
    
    // Setup reply buttons
    setupReplyButtons(blogId);
}

async function renderComment(comment, blogId, isReply = false) {
    const replies = await loadReplies(blogId, comment.id);
    const repliesHTML = await Promise.all(replies.map(reply => renderComment(reply, blogId, true)));
    
    return `
        <div class="comment-item ${isReply ? 'ml-12 pl-6 border-l-2 border-gray-200 dark:border-gray-700' : ''}" data-comment-id="${comment.id}">
            <div class="flex gap-4">
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${comment.userAvatar ? `
                        <img src="${comment.userAvatar}" alt="${comment.userName}" class="w-full h-full object-cover"/>
                    ` : `
                        <span class="text-primary font-bold">${comment.userName.charAt(0).toUpperCase()}</span>
                    `}
                </div>
                <div class="flex-1">
                    <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="font-bold text-sm">${comment.userName}</span>
                            <span class="text-xs text-gray-400">•</span>
                            <span class="text-xs text-gray-500">${formatTimestamp(comment.timestamp)}</span>
                        </div>
                        <p class="text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(comment.content)}</p>
                    </div>
                    <div class="flex items-center gap-4 mt-2 ml-4">
                        ${!isReply ? `
                            <button class="reply-btn text-xs font-medium text-gray-500 hover:text-primary transition-colors flex items-center gap-1" data-comment-id="${comment.id}" data-user-name="${comment.userName}">
                                <span class="material-symbols-outlined text-sm">reply</span>
                                Trả lời
                            </button>
                        ` : ''}
                    </div>
                    
                    <!-- Reply Form (hidden by default) -->
                    <div id="reply-form-${comment.id}" class="reply-form hidden mt-4"></div>
                    
                    <!-- Nested Replies -->
                    ${repliesHTML.length > 0 ? `
                        <div class="mt-4 space-y-4">
                            ${repliesHTML.join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function setupReplyButtons(blogId) {
    const replyButtons = document.querySelectorAll('.reply-btn');
    
    replyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const commentId = btn.getAttribute('data-comment-id');
            const userName = btn.getAttribute('data-user-name');
            showReplyForm(commentId, userName, blogId);
        });
    });
}

function showReplyForm(commentId, userName, blogId) {
    if (!currentUser) {
        if (window.showToast) {
            window.showToast('Vui lòng đăng nhập để trả lời', 'warning');
        }
        window.location.href = 'login.html';
        return;
    }
    
    // Hide all other reply forms
    document.querySelectorAll('.reply-form').forEach(form => {
        form.classList.add('hidden');
        form.innerHTML = '';
    });
    
    const replyContainer = document.getElementById(`reply-form-${commentId}`);
    if (!replyContainer) return;
    
    replyContainer.classList.remove('hidden');
    replyContainer.innerHTML = `
        <div class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                ${currentUser.photoURL ? `
                    <img src="${currentUser.photoURL}" alt="${currentUser.displayName}" class="w-full h-full object-cover"/>
                ` : `
                    <span class="text-primary text-sm font-bold">${(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}</span>
                `}
            </div>
            <div class="flex-1">
                <textarea 
                    id="reply-textarea-${commentId}" 
                    class="w-full bg-white dark:bg-black border-gray-200 dark:border-gray-800 rounded-lg p-3 focus:ring-primary focus:border-primary text-sm resize-none" 
                    placeholder="Trả lời ${userName}..." 
                    rows="2"></textarea>
                <div class="flex justify-end gap-2 mt-2">
                    <button 
                        class="cancel-reply-btn px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                        Hủy
                    </button>
                    <button 
                        class="post-reply-btn bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">
                        Trả lời
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Focus on textarea
    const textarea = document.getElementById(`reply-textarea-${commentId}`);
    if (textarea) textarea.focus();
    
    // Cancel button
    replyContainer.querySelector('.cancel-reply-btn').addEventListener('click', () => {
        replyContainer.classList.add('hidden');
        replyContainer.innerHTML = '';
    });
    
    // Post reply button
    replyContainer.querySelector('.post-reply-btn').addEventListener('click', async () => {
        const content = textarea.value;
        const postBtn = replyContainer.querySelector('.post-reply-btn');
        
        postBtn.disabled = true;
        postBtn.textContent = 'Đang trả lời...';
        
        const success = await postComment(blogId, content, commentId);
        
        if (success) {
            replyContainer.classList.add('hidden');
            replyContainer.innerHTML = '';
            await refreshComments();
        }
        
        postBtn.disabled = false;
        postBtn.textContent = 'Trả lời';
    });
}

async function refreshComments() {
    if (currentBlogId) {
        await renderComments(currentBlogId);
    }
}

// ============================================================================
// UTILITY
// ============================================================================

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Vừa xong';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    
    return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initComments(blogId) {
    console.log('🚀 Initializing comments system...');
    
    await initAuth();
    await renderComments(blogId);
    
    console.log('✅ Comments initialized');
}

// Export functions
export { initComments, refreshComments };

console.log('✅ Blog comments module loaded');
