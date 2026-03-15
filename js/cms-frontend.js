import { getFirebaseFirestore } from './firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const db = getFirebaseFirestore();

/**
 * Applies global settings (Logo, Colors, Footer)
 */
function applyGlobalSettings() {
    onSnapshot(doc(db, 'settings', 'general'), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (data.logoUrl) {
            document.querySelectorAll('img[alt="X-Sneaker Logo"]').forEach(img => { img.src = data.logoUrl; });
        }
        if (data.siteName) {
            document.title = data.siteName + (document.title.includes('|') ? ` | ${document.title.split('|')[1].trim()}` : '');
            document.querySelectorAll('.logo-text').forEach(el => el.textContent = data.siteName);
        }
        if (data.primaryColor) {
            document.documentElement.style.setProperty('--color-primary', data.primaryColor);
            const styleId = 'dynamic-theme-styles';
            let styleTag = document.getElementById(styleId);
            if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = styleId; document.head.appendChild(styleTag); }
            styleTag.innerHTML = `
                .text-primary { color: ${data.primaryColor} !important; }
                .bg-primary { background-color: ${data.primaryColor} !important; }
                .border-primary { border-color: ${data.primaryColor} !important; }
                .hover\\:text-primary:hover { color: ${data.primaryColor} !important; }
            `;
        }
        if (data.footerDescription) {
            const footerDesc = document.querySelector('footer p.text-gray-400');
            if (footerDesc) footerDesc.textContent = data.footerDescription;
        }
    });
}

/**
 * Applies About Us Content
 */
function applyAboutContent() {
    if (!location.pathname.includes('About-us.html')) return;
    onSnapshot(doc(db, 'settings', 'aboutUs'), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el && val) el.innerText = val; };
        if (data.heroImage) {
            const hero = document.getElementById('about-hero');
            if (hero) hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.7)),url("${data.heroImage}")`;
        }
        setTxt('about-title', data.title);
        setTxt('about-subtitle', data.subtitle);
        setTxt('about-story', data.story);
        setTxt('about-mission-text', data.mission);
        setTxt('about-quality-text', data.quality);
        setTxt('about-community-text', data.community);
    });
}

/**
 * Applies Contact Content
 */
function applyContactContent() {
    if (!location.pathname.includes('Contact-Us.html')) return;
    onSnapshot(doc(db, 'settings', 'contactInfo'), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el && val) el.innerText = val; };
        setTxt('contact-phone', data.phone);
        setTxt('contact-email', data.email);
        setTxt('contact-address', data.address);
        if (data.mapImage) {
            const mapBg = document.getElementById('contact-map-bg');
            if (mapBg) mapBg.style.backgroundImage = `url("${data.mapImage}")`;
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    applyGlobalSettings();
    applyAboutContent();
    applyContactContent();
});
