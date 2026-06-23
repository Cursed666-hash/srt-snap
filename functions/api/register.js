// =============================================
// POST /api/register
// Register a new user account
// =============================================

// Simple hash function (matches auth.js for compatibility)
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Generate a verification key
function generateVerificationKey() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let key = 'SRTV-';
  for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  key += '-';
  for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  key += '-';
  for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Email and password are required.' }), { status: 400 });
    }
    
    if (password.length < 6) {
      return new Response(JSON.stringify({ success: false, error: 'Password must be at least 6 characters.' }), { status: 400 });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ success: false, error: 'Please enter a valid email address.' }), { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if user already exists
    const existingUser = await env.SRT_SNAP_DATA.get(`user:${normalizedEmail}`);
    if (existingUser) {
      return new Response(JSON.stringify({ success: false, error: 'An account with this email already exists. Please log in.' }), { status: 409 });
    }

    const SECRET_SALT = 'SRT_SNAP_V1_SECURE_2024';
    const passwordHash = simpleHash(normalizedEmail + ':' + password + ':' + SECRET_SALT);
    const verificationKey = generateVerificationKey();

    // Store user in KV
    const userData = {
      passwordHash,
      createdAt: Date.now(),
      isPro: false,
      verificationKey,
      proLicenseKey: null,
      proActivatedAt: null
    };

    await env.SRT_SNAP_DATA.put(`user:${normalizedEmail}`, JSON.stringify(userData));

    // Create session token
    const sessionToken = crypto.randomUUID();
    const sessionData = {
      email: normalizedEmail,
      createdAt: Date.now(),
      isAdmin: false
    };
    await env.SRT_SNAP_DATA.put(`session:${sessionToken}`, JSON.stringify(sessionData), { expirationTtl: 86400 });

    return new Response(JSON.stringify({
      success: true,
      email: normalizedEmail,
      isPro: false,
      isAdmin: false,
      sessionToken,
      verificationKey
    }), { status: 201 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error. Please try again.' }), { status: 500 });
  }
}
