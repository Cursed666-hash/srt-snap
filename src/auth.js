/* =============================================
   SRT Snap — User Authentication System
   Register, Login, License Key Management
   ============================================= */

const AuthSystem = (() => {
    // ---- Constants ----
    const STORAGE_KEY_USERS = 'srtSnap_users';
    const STORAGE_KEY_SESSION = 'srtSnap_session';
    const STORAGE_KEY_PRO = 'srtSnap_proLicense';
    const STORAGE_KEY_VERIFICATION = 'srtSnap_verificationKeys';
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

    // ---- Verification Key Management ----
    function getVerificationKeys() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_VERIFICATION)) || {};
        } catch { return {}; }
    }

    function saveVerificationKeys(keys) {
        localStorage.setItem(STORAGE_KEY_VERIFICATION, JSON.stringify(keys));
    }

    function generateVerificationKey(email) {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let key = 'SRTV-';
        for (let i = 0; i < 4; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        key += '-';
        for (let i = 0; i < 4; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        key += '-';
        for (let i = 0; i < 4; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    // ---- Admin Check ----
    function isAdminUser(email) {
        try {
            // Check if ADMIN_CONFIG exists (from secret-config.js)
            if (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG) {
                return email.toLowerCase().trim() === (ADMIN_CONFIG.email || '').toLowerCase().trim();
            }
        } catch { }
        return false;
    }

    function checkAdminCredentials(username, password) {
        try {
            if (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG) {
                return username === ADMIN_CONFIG.username &&
                       password === ADMIN_CONFIG.password;
            }
        } catch { }
        return false;
    }

    function getAdminProStatus() {
        try {
            if (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG) {
                return ADMIN_CONFIG.isPro === true;
            }
        } catch { }
        return false;
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

            // Generate and store verification key
            const vkey = generateVerificationKey(email);
            const keys = getVerificationKeys();
            keys[email] = { key: vkey, createdAt: Date.now() };
            saveVerificationKeys(keys);

            return { success: true, email, verificationKey: vkey };
        },

        // Log in an existing user
        login(email, password) {
            email = email.toLowerCase().trim();
            if (!email || !password) {
                return { success: false, error: 'Email and password are required.' };
            }

            // Check admin credentials first (from gitignored secret-config.js)
            if (checkAdminCredentials(email, password)) {
                // Admin login — use admin email for session
                const adminEmail = (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG)
                    ? ADMIN_CONFIG.email.toLowerCase().trim()
                    : email;
                saveSession(adminEmail);
                const adminPro = getAdminProStatus();
                // Also save admin's Pro license if enabled
                if (adminPro) {
                    saveProLicense(adminEmail, 'ADMIN-PRO-' + Date.now());
                }
                return {
                    success: true,
                    email: adminEmail,
                    isPro: adminPro,
                    isAdmin: true
                };
            }

            // If email looks like a username (no @), try to find by username in ADMIN_CONFIG
            if (!email.includes('@')) {
                // Try treating the input as username
                const users = getUsers();
                // Check if any user email matches username pattern
                const matchedEmail = Object.keys(users).find(u => u.startsWith(email + '@') || u === email);
                if (matchedEmail) {
                    email = matchedEmail;
                } else {
                    return { success: false, error: 'No account found with this username. Please use your email.' };
                }
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

            // Get verification key for this user
            const keys = getVerificationKeys();
            const userVKey = keys[email] ? keys[email].key : null;

            // Restore Pro license if available for this email
            const pro = getProLicense();
            if (pro && pro.email === email) {
                return {
                    success: true,
                    email,
                    isPro: true,
                    verificationKey: userVKey,
                    isAdmin: false
                };
            }

            return {
                success: true,
                email,
                isPro: false,
                verificationKey: userVKey,
                isAdmin: false
            };
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

        // ---- Verification Key API ----

        // Get the verification key for a user
        getVerificationKey(email) {
            email = (email || '').toLowerCase().trim();
            const keys = getVerificationKeys();
            return keys[email] ? keys[email].key : null;
        },

        // Verify Pro status using a verification key
        verifyWithKey(email, key) {
            email = (email || '').toLowerCase().trim();
            key = (key || '').trim().toUpperCase();

            if (!email || !key) {
                return { success: false, error: 'Email and verification key are required.' };
            }

            const keys = getVerificationKeys();
            const record = keys[email];

            if (record && record.key === key) {
                // Valid key — activate Pro
                const licenseKey = this.generateLicenseKey(email);
                saveProLicense(email, licenseKey);
                saveSession(email);
                return { success: true, email, message: 'Pro verified successfully via verification key!' };
            }

            return { success: false, error: 'Invalid verification key. Please check your key and try again.' };
        },

        // ---- Admin API ----

        // Check if current session user is admin
        isAdmin() {
            try {
                const session = getSession();
                if (!session || !session.email) return false;
                if (typeof ADMIN_CONFIG === 'undefined' || !ADMIN_CONFIG) return false;
                return session.email.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim();
            } catch { return false; }
        },

        // Get admin Pro toggle status
        getAdminProToggle() {
            try {
                if (typeof ADMIN_CONFIG === 'undefined' || !ADMIN_CONFIG) return null;
                return ADMIN_CONFIG.isPro === true;
            } catch { return null; }
        },

        // Toggle admin Pro status (persisted to localStorage override)
        adminTogglePro() {
            const current = localStorage.getItem('srtSnap_adminProOverride');
            const newVal = current === 'true' ? 'false' : 'true';
            localStorage.setItem('srtSnap_adminProOverride', newVal);
            return newVal === 'true';
        },

        // Get effective admin Pro status (config + override)
        isAdminProEffective() {
            const override = localStorage.getItem('srtSnap_adminProOverride');
            if (override === 'true') return true;
            if (override === 'false') return false;
            return this.getAdminProToggle();
        },

        // Check if current session has Pro
        isPro() {
            // Check 0: Admin Pro status (config toggle + override)
            const session = getSession();
            if (session && session.email) {
                try {
                    if (typeof ADMIN_CONFIG !== 'undefined' && ADMIN_CONFIG &&
                        session.email.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim()) {
                        const override = localStorage.getItem('srtSnap_adminProOverride');
                        if (override === 'true') return true;
                        if (override === 'false') return false;
                        return ADMIN_CONFIG.isPro === true;
                    }
                } catch { }
            }

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
