/* =============================================
   SRT Snap — Admin Secret Configuration (EXAMPLE)
   =============================================
   INSTRUCTIONS:
   1. Copy this file to "secret-config.js" in the same folder
   2. Fill in your admin credentials
   3. NEVER commit secret-config.js to git (it's in .gitignore)
   4. The app will fall back to defaults if secret-config.js is missing
   ============================================= */

const ADMIN_CONFIG = {
    // Admin login credentials
    username: 'admin',
    password: 'your-admin-password-here', // <-- CHANGE THIS

    // Toggle: true = Pro access, false = Free (for testing)
    isPro: true,

    // Email for verification key delivery
    email: 'your-email@example.com'
};
