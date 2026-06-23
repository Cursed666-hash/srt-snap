// =============================================
// POST /api/verify-session
// Verify a session token is still valid
// Returns user info including Pro status
// =============================================

export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { sessionToken } = await request.json();
    
    if (!sessionToken) {
      return new Response(JSON.stringify({ valid: false, error: 'No session token provided.' }), { status: 401 });
    }

    // Look up session in KV
    const sessionRaw = await env.SRT_SNAP_DATA.get(`session:${sessionToken}`);
    if (!sessionRaw) {
      return new Response(JSON.stringify({ valid: false, error: 'Session expired or invalid. Please log in again.' }), { status: 401 });
    }

    const session = JSON.parse(sessionRaw);
    
    // Check if session has expired (24h TTL handled by KV, but double-check)
    const age = Date.now() - session.createdAt;
    if (age > 86400000) {
      await env.SRT_SNAP_DATA.delete(`session:${sessionToken}`);
      return new Response(JSON.stringify({ valid: false, error: 'Session expired. Please log in again.' }), { status: 401 });
    }

    // If admin, get admin config
    if (session.isAdmin) {
      const adminConfigRaw = await env.SRT_SNAP_DATA.get('admin', 'json');
      if (adminConfigRaw) {
        return new Response(JSON.stringify({
          valid: true,
          email: session.email,
          isAdmin: true,
          isPro: adminConfigRaw.isPro || false
        }), { status: 200 });
      }
    }

    // Get user data for pro status
    const userDataRaw = await env.SRT_SNAP_DATA.get(`user:${session.email}`);
    const userData = userDataRaw ? JSON.parse(userDataRaw) : null;

    return new Response(JSON.stringify({
      valid: true,
      email: session.email,
      isAdmin: session.isAdmin || false,
      isPro: userData ? (userData.isPro || false) : false,
      verificationKey: userData ? (userData.verificationKey || null) : null
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: 'Server error.' }), { status: 500 });
  }
}
