// =============================================
// POST /api/admin/login
// Admin login endpoint
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
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Username and password are required.' }), { status: 400 });
    }

    // Get admin config from KV
    const adminConfigRaw = await env.SRT_SNAP_DATA.get('admin', 'json');
    if (!adminConfigRaw) {
      return new Response(JSON.stringify({ success: false, error: 'Admin not configured.' }), { status: 401 });
    }

    const adminHash = simpleHash(adminConfigRaw.username + ':' + password + ':ADMIN_SALT_2024');
    
    if (username !== adminConfigRaw.username || adminHash !== adminConfigRaw.passwordHash) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid admin credentials.' }), { status: 401 });
    }

    // Create admin session
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

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error.' }), { status: 500 });
  }
}
