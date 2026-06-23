// =============================================
// POST /api/admin/setup
// One-time admin configuration setup
// After deployment, POST here with admin creds
// to initialize the KV store.
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
    // Check if admin already exists
    const existingAdmin = await env.SRT_SNAP_DATA.get('admin');
    if (existingAdmin) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin configuration already exists. To reset, delete the "admin" key from KV and try again.'
      }), { status: 409 });
    }

    const { username, password, email, isPro } = await request.json();
    
    if (!username || !password || !email) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Username, password, and email are required.'
      }), { status: 400 });
    }

    // Hash the password
    const passwordHash = simpleHash(username + ':' + password + ':ADMIN_SALT_2024');

    const adminConfig = {
      username: username.toLowerCase().trim(),
      passwordHash,
      email: email.toLowerCase().trim(),
      isPro: isPro === true
    };

    await env.SRT_SNAP_DATA.put('admin', JSON.stringify(adminConfig));

    return new Response(JSON.stringify({
      success: true,
      message: 'Admin configuration created successfully! You can now log in.',
      admin: {
        username: adminConfig.username,
        email: adminConfig.email,
        isPro: adminConfig.isPro
      }
    }), { status: 201 });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Server error. Please try again.'
    }), { status: 500 });
  }
}
