// =============================================
// POST /api/login
// Log in an existing user
// =============================================

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    let { email, password } = await request.json();
    
    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Email and password are required.' }), { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check admin credentials from KV
    const adminConfigRaw = await env.SRT_SNAP_DATA.get('admin', 'json');
    if (adminConfigRaw) {
      // Support username-based admin login
      if (normalizedEmail === adminConfigRaw.username.toLowerCase().trim() ||
          normalizedEmail === adminConfigRaw.email.toLowerCase().trim()) {
        // Check password
        const adminHash = simpleHash(adminConfigRaw.username + ':' + password + ':ADMIN_SALT_2024');
        if (adminHash === adminConfigRaw.passwordHash) {
          const sessionToken = crypto.randomUUID();
          const sessionData = {
            email: adminConfigRaw.email,
            createdAt: Date.now(),
            isAdmin: true
          };
          await env.SRT_SNAP_DATA.put(`session:${sessionToken}`, JSON.stringify(sessionData), { expirationTtl: 86400 });
          
          return new Response(JSON.stringify({
            success: true,
            email: adminConfigRaw.email,
            isPro: adminConfigRaw.isPro || false,
            isAdmin: true,
            sessionToken
          }), { status: 200 });
        }
      }
    }

    // Regular user login
    const userDataRaw = await env.SRT_SNAP_DATA.get(`user:${normalizedEmail}`);
    if (!userDataRaw) {
      return new Response(JSON.stringify({ success: false, error: 'No account found with this email. Please register first.' }), { status: 404 });
    }

    const userData = JSON.parse(userDataRaw);
    const SECRET_SALT = 'SRT_SNAP_V1_SECURE_2024';
    const hash = simpleHash(normalizedEmail + ':' + password + ':' + SECRET_SALT);

    if (hash !== userData.passwordHash) {
      return new Response(JSON.stringify({ success: false, error: 'Incorrect password. Please try again.' }), { status: 401 });
    }

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
      isPro: userData.isPro || false,
      isAdmin: false,
      sessionToken,
      verificationKey: userData.verificationKey || null
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error. Please try again.' }), { status: 500 });
  }
}
