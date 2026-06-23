/* =============================================
   SRT Snap — Admin Secret Configuration (EXAMPLE)
   =============================================
   INSTRUCTIONS:
   1. Copy this file to "secret-config.js" in the same folder
   2. Fill in your admin credentials
   3. Set CLOUDFLARE_API_URL after deploying to Cloudflare Pages
   4. NEVER commit secret-config.js to git (it's in .gitignore)
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

// Assign to window so it overrides the fallback null from index.html
if (typeof window !== 'undefined') {
    window.ADMIN_CONFIG = ADMIN_CONFIG;
}

// =============================================
// Cloudflare API Configuration
// After deploying to Cloudflare Pages, set this to your project URL.
// Format: https://your-project.pages.dev  (no trailing slash)
// Leave empty when running locally (file://) — auth falls back to localStorage.
// =============================================
window.CLOUDFLARE_API_URL = ''; // e.g. 'https://srt-snap.pages.dev'
