/* =============================================
   SRT Snap — User Authentication System
   Cloudflare API + localStorage fallback
   ============================================= */

const AuthSystem = (() => {
    // ---- Configuration ----
    // Set by secret-config.js when running on Cloudflare (optional)
    // Auto-detects current origin when on http/https.
    // Falls back to localStorage when running locally (file://).
    const API_BASE = window.CLOUDFLARE_API_URL || (window.location.protocol !== 'file:' ? window.location.origin : null);
    const USE_API = !!API_BASE;
    
    // ---- Constants (localStorage fallback) ----
    const STORAGE_KEY_SESSION = 'srtSnap_session';
    const STORAGE_KEY_PRO = 'srtSnap_proLicense';
    const STORAGE_KEY_TOKEN = 'srtSnap_sessionToken';
    const SECRET_SALT = 'SRT_SNAP_V1_SECURE_2024';

    // ---- Simple hash (for local fallback) ----
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    // ---- License Key Generation ----
    function generateLicenseKey(email) {
        const raw = email.toLowerCase().trim() + ':' + SECRET_SALT;
        const hash = simpleHash(raw);
        const p1 = 'SRTN';
        const p2 = hash.substring(0, 4).toUpperCase();
        const p3 = hash.substring(4, 8).toUpperCase();
        const p4 = simpleHash(email + ':' + hash).substring(0, 4).toUpperCase();
        return `${p1}-${p2}-${p3}-${p4}`;
    }

    // ---- Validate License Key (client-side) ----
    function validateLicenseKey(email, key) {
        const expected = generateLicenseKey(email);
        return key.trim().toUpperCase() === expected;
    }

    // ---- API helper ----
    async function apiPost(endpoint, body) {
        try {
            const res = await fetch(`${API_BASE}/api/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch (err) {
            return { success: false, error: 'Network error. Please check your connection.' };
        }
    }

    // ---- LocalStorage helpers (fallback) ----
    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION)) || null;
        } catch { return null; }
    }

    function saveSession(email, sessionToken) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({
            email,
            loggedInAt: Date.now(),
            deviceId: navigator.userAgent + navigator.language
        }));
        if (sessionToken) {
            localStorage.setItem(STORAGE_KEY_TOKEN, sessionToken);
        }
    }

    function clearSession() {
        localStorage.removeItem(STORAGE_KEY_SESSION);
        localStorage.removeItem(STORAGE_KEY_TOKEN);
    }

    function getSessionToken() {
        return localStorage.getItem(STORAGE_KEY_TOKEN);
    }

    function getProLicense() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_PRO)) || null;
        } catch { return null; }
    }

    function saveProLicense(email, key) {
        localStorage.setItem(STORAGE_KEY_PRO, JSON.stringify({
            email, key, activatedAt: Date.now()
        }));
    }

    function clearProLicense() {
        localStorage.removeItem(STORAGE_KEY_PRO);
    }

    // ---- Admin Check (local only) ----
    function isAdminUserLocal(email) {
        try {
            if (window.ADMIN_CONFIG) {
                return email.toLowerCase().trim() === (window.ADMIN_CONFIG.email || '').toLowerCase().trim();
            }
        } catch { }
        return false;
    }

    function checkAdminCredentialsLocal(username, password) {
        try {
            if (window.ADMIN_CONFIG) {
                return username === window.ADMIN_CONFIG.username &&
                       password === window.ADMIN_CONFIG.password;
            }
        } catch { }
        return false;
    }

    // ---- Public API ----
    return {
        // Register a new user
        async register(email, password) {
            email = email.toLowerCase().trim();
            if (!email || !password) {
                return { success: false, error: 'Email and password are required.' };
            }
            if (password.length < 6) {
                return { success: false, error: 'Password must be at least 6 characters.' };
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return { success: false, error: 'Please enter a valid email address.' };
            }

            if (USE_API) {
                const result = await apiPost('register', { email, password });
                if (result.success) {
                    saveSession(result.email, result.sessionToken);
                }
                return result;
            }

            // ---- LocalStorage fallback ----
            const STORAGE_KEY_USERS = 'srtSnap_users';
            const STORAGE_KEY_VERIFICATION = 'srtSnap_verificationKeys';
            const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS)) || {};
            if (users[email]) {
                return { success: false, error: 'An account with this email already exists. Please log in.' };
            }
            const hash = simpleHash(email + ':' + password + ':' + SECRET_SALT);
            users[email] = { passwordHash: hash, createdAt: Date.now() };
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
            
            const vkey = 'SRTV-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                         Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                         Math.random().toString(36).substring(2, 6).toUpperCase();
            const keys = JSON.parse(localStorage.getItem(STORAGE_KEY_VERIFICATION)) || {};
            keys[email] = { key: vkey, createdAt: Date.now() };
            localStorage.setItem(STORAGE_KEY_VERIFICATION, JSON.stringify(keys));
            
            saveSession(email);
            return { success: true, email, verificationKey: vkey };
        },

        // Log in an existing user
        async login(email, password) {
            email = email.toLowerCase().trim();
            if (!email || !password) {
                return { success: false, error: 'Email and password are required.' };
            }

            if (USE_API) {
                // Try admin login through API first
                const adminResult = await apiPost('admin/login', { username: email, password });
                if (adminResult.success) {
                    saveSession(adminResult.email, adminResult.sessionToken);
                    return adminResult;
                }

                // Regular user login
                const result = await apiPost('login', { email, password });
                if (result.success) {
                    saveSession(result.email, result.sessionToken);
                }
                return result;
            }

            // ---- LocalStorage fallback ----
            // Admin check (local)
            if (checkAdminCredentialsLocal(email, password)) {
                const adminEmail = window.ADMIN_CONFIG
                    ? window.ADMIN_CONFIG.email.toLowerCase().trim()
                    : email;
                saveSession(adminEmail);
                const adminPro = window.ADMIN_CONFIG ? window.ADMIN_CONFIG.isPro === true : false;
                if (adminPro) {
                    saveProLicense(adminEmail, 'ADMIN-PRO-' + Date.now());
                }
                return { success: true, email: adminEmail, isPro: adminPro, isAdmin: true };
            }

            const STORAGE_KEY_USERS = 'srtSnap_users';
            const STORAGE_KEY_VERIFICATION = 'srtSnap_verificationKeys';
            const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS)) || {};
            
            if (!email.includes('@')) {
                const matchedEmail = Object.keys(users).find(u => u.startsWith(email + '@') || u === email);
                if (matchedEmail) { email = matchedEmail; }
                else { return { success: false, error: 'No account found with this username.' }; }
            }

            const user = users[email];
            if (!user) {
                return { success: false, error: 'No account found with this email. Please register first.' };
            }
            const hash = simpleHash(email + ':' + password + ':' + SECRET_SALT);
            if (hash !== user.passwordHash) {
                return { success: false, error: 'Incorrect password. Please try again.' };
            }

            saveSession(email);
            const keys = JSON.parse(localStorage.getItem(STORAGE_KEY_VERIFICATION)) || {};
            const userVKey = keys[email] ? keys[email].key : null;
            const pro = getProLicense();
            const isPro = !!(pro && pro.email === email);

            return { success: true, email, isPro, verificationKey: userVKey, isAdmin: false };
        },

        // Log out
        async logout() {
            if (USE_API) {
                // Session invalidation on server is handled by TTL, but we clear locally
            }
            clearSession();
            return { success: true };
        },

        // Check if user is logged in
        getCurrentUser() {
            return getSession();
        },

        // Activate Pro with a license key
        async activatePro(email, key) {
            email = (email || '').toLowerCase().trim();
            key = (key || '').trim();

            if (!email || !key) {
                return { success: false, error: 'Email and license key are required.' };
            }

            if (USE_API) {
                const sessionToken = getSessionToken();
                const result = await apiPost('verify-key', { email, key, sessionToken });
                if (result.success) {
                    saveProLicense(email, key);
                }
                return result;
            }

            // ---- LocalStorage fallback ----
            if (validateLicenseKey(email, key)) {
                saveProLicense(email, key);
                return { success: true, email, key };
            }
            return { success: false, error: 'Invalid license key. Please check your key and try again.' };
        },

        // Generate a license key for an email
        generateLicenseKey(email) {
            return generateLicenseKey(email);
        },

        // ---- Verification Key API ----

        getVerificationKey(email) {
            email = (email || '').toLowerCase().trim();
            if (USE_API) {
                // This is available from the session or user data
                return null; // Users should check via init() or login response
            }
            const STORAGE_KEY_VERIFICATION = 'srtSnap_verificationKeys';
            const keys = JSON.parse(localStorage.getItem(STORAGE_KEY_VERIFICATION)) || {};
            return keys[email] ? keys[email].key : null;
        },

        async verifyWithKey(email, key) {
            email = (email || '').toLowerCase().trim();
            key = (key || '').trim().toUpperCase();

            if (!email || !key) {
                return { success: false, error: 'Email and verification key are required.' };
            }

            if (USE_API) {
                // Verification key is handled during registration on the server.
                // Use the verify-key endpoint to activate Pro.
                const result = await apiPost('verify-key', { email, key });
                if (result.success) {
                    saveProLicense(email, key);
                    saveSession(email, getSessionToken());
                }
                return result;
            }

            // ---- LocalStorage fallback ----
            const STORAGE_KEY_VERIFICATION = 'srtSnap_verificationKeys';
            const keys = JSON.parse(localStorage.getItem(STORAGE_KEY_VERIFICATION)) || {};
            const record = keys[email];
            if (record && record.key === key) {
                const licenseKey = generateLicenseKey(email);
                saveProLicense(email, licenseKey);
                saveSession(email);
                return { success: true, email, message: 'Pro verified successfully via verification key!' };
            }
            return { success: false, error: 'Invalid verification key.' };
        },

        // ---- Admin API ----

        isAdmin() {
            try {
                const session = getSession();
                if (!session || !session.email) return false;
                if (USE_API) {
                    // Admin status is determined by server session
                    const token = getSessionToken();
                    // We cache this from the login response or verify-session
                    return localStorage.getItem('srtSnap_isAdmin') === 'true';
                }
                if (!window.ADMIN_CONFIG) return false;
                return session.email.toLowerCase().trim() === window.ADMIN_CONFIG.email.toLowerCase().trim();
            } catch { return false; }
        },

        getAdminProToggle() {
            try {
                if (!window.ADMIN_CONFIG) return null;
                return window.ADMIN_CONFIG.isPro === true;
            } catch { return null; }
        },

        adminTogglePro() {
            const current = localStorage.getItem('srtSnap_adminProOverride');
            const newVal = current === 'true' ? 'false' : 'true';
            localStorage.setItem('srtSnap_adminProOverride', newVal);
            return newVal === 'true';
        },

        isAdminProEffective() {
            const override = localStorage.getItem('srtSnap_adminProOverride');
            if (override === 'true') return true;
            if (override === 'false') return false;
            return this.getAdminProToggle();
        },

        // Check if current session has Pro
        isPro() {
            const session = getSession();
            
            // Admin Pro check
            if (session && session.email) {
                try {
                    if (window.ADMIN_CONFIG &&
                        session.email.toLowerCase().trim() === window.ADMIN_CONFIG.email.toLowerCase().trim()) {
                        const override = localStorage.getItem('srtSnap_adminProOverride');
                        if (override === 'true') return true;
                        if (override === 'false') return false;
                        return window.ADMIN_CONFIG.isPro === true;
                    }
                } catch { }
            }

            const pro = getProLicense();
            if (pro) return true;
            if (localStorage.getItem('isProUser') === 'true') return true;
            if (!session) return false;
            if (pro && pro.email === session.email) return true;

            return false;
        },

        getLicenseInfo() {
            const pro = getProLicense();
            if (pro) return pro;
            if (localStorage.getItem('isProUser') === 'true') {
                return { email: 'legacy@local', key: 'LEGACY', activatedAt: 0 };
            }
            return null;
        },

        canAccessEditor() {
            return this.isPro();
        },

        // Init — check auth state on page load
        async init() {
            const localSession = getSession();
            const token = getSessionToken();

            // Migrate legacy Pro flag
            if (localStorage.getItem('isProUser') === 'true' && !getProLicense()) {
                saveProLicense('legacy@local', 'LEGACY-MIGRATED');
            }

            // If using API, verify session with server
            if (USE_API && token) {
                const result = await apiPost('verify-session', { sessionToken: token });
                if (result.valid) {
                    // Update local session with server data
                    saveSession(result.email, token);
                    if (result.isAdmin) {
                        localStorage.setItem('srtSnap_isAdmin', 'true');
                    } else {
                        localStorage.removeItem('srtSnap_isAdmin');
                    }
                    // If user has Pro on server, sync it locally
                    if (result.isPro && !getProLicense()) {
                        saveProLicense(result.email, 'SERVER-SYNCED');
                    }
                    return { loggedIn: true, isPro: result.isPro || this.isPro() };
                } else {
                    // Session expired or invalid
                    clearSession();
                    localStorage.removeItem('srtSnap_isAdmin');
                    return { loggedIn: false, isPro: false };
                }
            }

            const isPro = this.isPro();
            return { loggedIn: !!localSession, isPro };
        }
    };
})();
