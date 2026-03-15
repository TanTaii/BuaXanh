import { getFirebaseFirestore } from '../firebase-config.js';
import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { uploadAvatarDirect } from '../base64-upload.js';

const db = getFirebaseFirestore();

// Initialize CMS Module
function initCMS() {
    // DOM Elements - Query after tab is loaded
    const btnSave = document.getElementById('btn-save-cms');
    const tabBtns = document.querySelectorAll('.cms-tab-btn');
    const tabContents = document.querySelectorAll('.cms-tab-content');
    
    // About Elements
    const aboutHeroFile = document.getElementById('cms-about-hero-file');
    const aboutHeroUrl = document.getElementById('cms-about-hero-url');
    const aboutHeroPreview = document.getElementById('cms-about-hero-preview');
    const aboutTitle = document.getElementById('cms-about-title');
    const aboutSubtitle = document.getElementById('cms-about-subtitle');
    const aboutStory = document.getElementById('cms-about-story');
    const aboutMission = document.getElementById('cms-about-mission');
    const aboutQuality = document.getElementById('cms-about-quality');
    const aboutCommunity = document.getElementById('cms-about-community');
    
    // Contact Elements
    const contactPhone = document.getElementById('cms-contact-phone');
    const contactEmail = document.getElementById('cms-contact-email');
    const contactAddress = document.getElementById('cms-contact-address');
    const contactMap = document.getElementById('cms-contact-map');

    // Check if elements exist
    if (!btnSave || !aboutTitle) {
        console.warn('CMS elements not found. Tab may not be loaded yet.');
        return;
    }

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class
            tabBtns.forEach(b => {
                b.classList.remove('text-primary', 'border-primary', 'bg-white', 'dark:bg-background-dark', 'font-bold');
                b.classList.add('text-slate-500', 'dark:text-slate-400', 'font-medium');
            });
            // Add active class
            btn.classList.add('text-primary', 'border-primary', 'bg-white', 'dark:bg-background-dark', 'font-bold');
            btn.classList.remove('font-medium');

            // Show Content
            const targetId = btn.getAttribute('data-target');
            tabContents.forEach(content => content.classList.add('hidden'));
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // Image Preview
    if (aboutHeroFile) {
        aboutHeroFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    aboutHeroPreview.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Load Data from Firebase
    loadCMSData();

    // Save Button
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const originalText = btnSave.innerHTML;
            btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">rotate_right</span> Saving...';
            btnSave.disabled = true;

            try {
                // Upload Hero Image if changed
                let heroImageUrl = aboutHeroUrl.value;
                if (aboutHeroFile.files[0]) {
                    heroImageUrl = await uploadAvatarDirect(aboutHeroFile.files[0]);
                }

                const aboutData = {
                    heroImage: heroImageUrl,
                    title: aboutTitle.value,
                    subtitle: aboutSubtitle.value,
                    story: aboutStory.value,
                    mission: aboutMission.value,
                    quality: aboutQuality.value,
                    community: aboutCommunity.value
                };

                const contactData = {
                    phone: contactPhone.value,
                    email: contactEmail.value,
                    address: contactAddress.value,
                    mapImage: contactMap.value
                };

                // Save in parallel
                await Promise.all([
                    setDoc(doc(db, 'settings', 'aboutUs'), aboutData),
                    setDoc(doc(db, 'settings', 'contactInfo'), contactData)
                ]);

                if (window.showToast) {
                    window.showToast('Lưu nội dung CMS thành công!', 'success');
                }

            } catch (error) {
                console.error(error);
                if (window.showToast) {
                    window.showToast('Lỗi khi lưu nội dung: ' + error.message, 'error');
                }
            } finally {
                btnSave.innerHTML = originalText;
                btnSave.disabled = false;
            }
        });
    }

    console.log('✅ CMS Module Initialized');
}

// Load CMS Data from Firebase
function loadCMSData() {
    const aboutHeroUrl = document.getElementById('cms-about-hero-url');
    const aboutHeroPreview = document.getElementById('cms-about-hero-preview');
    const aboutTitle = document.getElementById('cms-about-title');
    const aboutSubtitle = document.getElementById('cms-about-subtitle');
    const aboutStory = document.getElementById('cms-about-story');
    const aboutMission = document.getElementById('cms-about-mission');
    const aboutQuality = document.getElementById('cms-about-quality');
    const aboutCommunity = document.getElementById('cms-about-community');
    const contactPhone = document.getElementById('cms-contact-phone');
    const contactEmail = document.getElementById('cms-contact-email');
    const contactAddress = document.getElementById('cms-contact-address');
    const contactMap = document.getElementById('cms-contact-map');

    // Load About
    onSnapshot(doc(db, 'settings', 'aboutUs'), (snapshot) => {
        const data = snapshot.data();
        if (data && aboutTitle) {
            aboutHeroUrl.value = data.heroImage || '';
            aboutHeroPreview.src = data.heroImage || 'https://placehold.co/800x400?text=Hero+Image';
            aboutTitle.value = data.title || '';
            aboutSubtitle.value = data.subtitle || '';
            aboutStory.value = data.story || '';
            aboutMission.value = data.mission || '';
            aboutQuality.value = data.quality || '';
            aboutCommunity.value = data.community || '';
        }
    });

    // Load Contact
    onSnapshot(doc(db, 'settings', 'contactInfo'), (snapshot) => {
        const data = snapshot.data();
        if (data && contactPhone) {
            contactPhone.value = data.phone || '';
            contactEmail.value = data.email || '';
            contactAddress.value = data.address || '';
            contactMap.value = data.mapImage || '';
        }
    });
}

// Export module to window
window.cmsModule = {
    initCMS,
    loadCMSData
};

console.log('📦 CMS Module Loaded');
