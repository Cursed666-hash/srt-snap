/* =============================================
   SRT Snap — User Authentication System
   Register, Login, License Key Management
   ============================================= */

const AuthSystem = (() => {
    // ---- Constants ----
    const STORAGE_KEY_USERS = 'srtSnap_users';
    const STORAGE_KEY_SESSION = 'srtSnap_session';
    const STORAGE_KEY_PRO = 'srtSnap_proLicense';
    const SECRET_SALT = 'SRT_SNAP_V1_SECURE_2024';

    // ---- Simple hash (not crypto-grade, but sufficient for client-side demo) ----
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
        // Format: SRTN-XXXX-XXXX-XXXX
        const p1 = 'SRTN';
        const p2 = hash.substring(0, 4).toUpperCase();
        const p3 = hash.substring(4, 8).toUpperCase();
        const p4 = simpleHash(email + ':' + hash).substring(0, 4).toUpperCase();
        return `${p1}-${p2}-${p3}-${p4}`;
    }

    // ---- Validate License Key ----
    function validateLicenseKey(email, key) {
        const expected = generateLicenseKey(email);
        return key.trim().toUpperCase() === expected;
    }

    // ---- User Data Management ----
    function getUsers() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_USERS)) || {};
        } catch { return {}; }
    }

    function saveUsers(users) {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION)) || null;
        } catch { return null; }
    }

    function saveSession(email) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({
            email,
            loggedInAt: Date.now(),
            deviceId: navigator.userAgent + navigator.language
        }));
    }

    function clearSession() {
        localStorage.removeItem(STORAGE_KEY_SESSION);
    }

    function getProLicense() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_PRO)) || null;
        } catch { return null; }
    }

    function saveProLicense(email, key) {
        localStorage.setItem(STORAGE_KEY_PRO, JSON.stringify({
            email,
            key,
            activatedAt: Date.now()
        }));
    }

    function clearProLicense() {
        localStorage.removeItem(STORAGE_KEY_PRO);
    }

    // ---- Public API ----
    return {
        // Register a new user
        register(email, password) {
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

            const users = getUsers();
            if (users[email]) {
                return { success: false, error: 'An account with this email already exists. Please log in.' };
            }

            const hash = simpleHash(email + ':' + password + ':' + SECRET_SALT);
            users[email] = {
                passwordHash: hash,
                createdAt: Date.now()
            };
            saveUsers(users);
            saveSession(email);

            return { success: true, email };
        },

        // Log in an existing user
        login(email, password) {
            email = email.toLowerCase().trim();
            if (!email || !password) {
                return { success: false, error: 'Email and password are required.' };
            }

            const users = getUsers();
            const user = users[email];
            if (!user) {
                return { success: false, error: 'No account found with this email. Please register first.' };
            }

            const hash = simpleHash(email + ':' + password + ':' + SECRET_SALT);
            if (hash !== user.passwordHash) {
                return { success: false, error: 'Incorrect password. Please try again.' };
            }

            saveSession(email);

            // Restore Pro license if available for this email
            const pro = getProLicense();
            if (pro && pro.email === email) {
                return { success: true, email, isPro: true };
            }

            return { success: true, email, isPro: false };
        },

        // Log out
        logout() {
            clearSession();
            return { success: true };
        },

        // Check if user is logged in
        getCurrentUser() {
            return getSession();
        },

        // Activate Pro with a license key
        activatePro(email, key) {
            email = (email || '').toLowerCase().trim();
            key = (key || '').trim();

            if (!email || !key) {
                return { success: false, error: 'Email and license key are required.' };
            }

            if (validateLicenseKey(email, key)) {
                saveProLicense(email, key);
                return { success: true, email, key };
            }

            return { success: false, error: 'Invalid license key. Please check your key and try again.' };
        },

        // Generate a license key for an email (after PayPal purchase)
        generateLicenseKey(email) {
            return generateLicenseKey(email);
        },

        // Check if current session has Pro
        isPro() {
            // Check 1: Session-based Pro flag (for backward compatibility)
            const pro = getProLicense();
            if (pro) return true;

            // Check 2: Legacy localStorage flag
            if (localStorage.getItem('isProUser') === 'true') return true;

            // Check 3: Session must exist
            const session = getSession();
            if (!session) return false;

            // Check 4: If session email matches a Pro license
            if (pro && pro.email === session.email) return true;

            return false;
        },

        // Get Pro license info
        getLicenseInfo() {
            const pro = getProLicense();
            if (pro) return pro;
            if (localStorage.getItem('isProUser') === 'true') {
                return { email: 'legacy@local', key: 'LEGACY', activatedAt: 0 };
            }
            return null;
        },

        // Check if editor should be accessible
        canAccessEditor() {
            return this.isPro();
        },

        // Init — check auth state on page load
        init() {
            const session = getSession();
            const isPro = this.isPro();

            // Migrate legacy Pro flag to new system
            if (localStorage.getItem('isProUser') === 'true' && !getProLicense()) {
                saveProLicense('legacy@local', 'LEGACY-MIGRATED');
            }

            return { loggedIn: !!session, isPro };
        }
    };
})();
