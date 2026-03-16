import { getFirebaseFirestore } from './firebase-config.js';
import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const db = getFirebaseFirestore();
const memoryCache = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function getCacheKey(type, path) {
    return `buaxanh-cache:${type}:${path}`;
}

function readSessionCache(key, ttlMs) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.timestamp) return null;
        if (Date.now() - parsed.timestamp > ttlMs) return null;
        return parsed.data;
    } catch (error) {
        console.warn('Cache read failed:', error?.message || error);
        return null;
    }
}

function writeSessionCache(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch (error) {
        console.warn('Cache write failed:', error?.message || error);
    }
}

export async function getCachedCollectionData(collectionName, options = {}) {
    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    const forceRefresh = options.forceRefresh === true;
    const key = getCacheKey('collection', collectionName);

    if (!forceRefresh && memoryCache.has(key)) {
        const cached = memoryCache.get(key);
        if (Date.now() - cached.timestamp <= ttlMs) {
            return cached.data;
        }
    }

    if (!forceRefresh) {
        const sessionData = readSessionCache(key, ttlMs);
        if (sessionData) {
            memoryCache.set(key, { timestamp: Date.now(), data: sessionData });
            return sessionData;
        }
    }

    const snapshot = await getDocs(collection(db, collectionName));
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    memoryCache.set(key, { timestamp: Date.now(), data });
    writeSessionCache(key, data);
    return data;
}

export async function getCachedDocData(collectionName, docId, options = {}) {
    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    const forceRefresh = options.forceRefresh === true;
    const path = `${collectionName}/${docId}`;
    const key = getCacheKey('doc', path);

    if (!forceRefresh && memoryCache.has(key)) {
        const cached = memoryCache.get(key);
        if (Date.now() - cached.timestamp <= ttlMs) {
            return cached.data;
        }
    }

    if (!forceRefresh) {
        const sessionData = readSessionCache(key, ttlMs);
        if (sessionData) {
            memoryCache.set(key, { timestamp: Date.now(), data: sessionData });
            return sessionData;
        }
    }

    const snapshot = await getDoc(doc(db, collectionName, docId));
    if (!snapshot.exists()) {
        return null;
    }

    const data = { id: snapshot.id, ...snapshot.data() };
    memoryCache.set(key, { timestamp: Date.now(), data });
    writeSessionCache(key, data);
    return data;
}

export function invalidateCache(prefix = '') {
    [...memoryCache.keys()].forEach(key => {
        if (!prefix || key.includes(prefix)) {
            memoryCache.delete(key);
        }
    });

    try {
        const toDelete = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
            const key = sessionStorage.key(i);
            if (key && (key.startsWith('buaxanh-cache:') || key.startsWith('foodsaver-cache:')) && (!prefix || key.includes(prefix))) {
                toDelete.push(key);
            }
        }
        toDelete.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
        console.warn('Cache invalidation failed:', error?.message || error);
    }
}
