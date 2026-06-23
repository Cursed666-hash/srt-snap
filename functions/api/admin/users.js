// =============================================
// GET /api/admin/users
// List all registered users (admin only)
// =============================================

export async function onRequest(context) {
  const { request, env } = context;
  
  // Verify admin session
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const sessionRaw = await env.SRT_SNAP_DATA.get(`session:${sessionToken}`);
  if (!sessionRaw) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid or expired session.' }), { status: 401 });
  }

  const session = JSON.parse(sessionRaw);
  if (!session.isAdmin) {
    return new Response(JSON.stringify({ success: false, error: 'Admin access required.' }), { status: 403 });
  }

  try {
    // List all users from KV
    const users = [];
    let cursor = undefined;
    
    do {
      const list = await env.SRT_SNAP_DATA.list({ prefix: 'user:', cursor });
      for (const key of list.keys) {
        const email = key.name.slice(5); // Remove 'user:' prefix
        const userDataRaw = await env.SRT_SNAP_DATA.get(key.name);
        if (userDataRaw) {
          const userData = JSON.parse(userDataRaw);
          users.push({
            email,
            createdAt: userData.createdAt,
            isPro: userData.isPro || false,
            proActivatedAt: userData.proActivatedAt || null
          });
        }
      }
      cursor = list.cursor;
    } while (cursor);

    // Sort by creation date (newest first)
    users.sort((a, b) => b.createdAt - a.createdAt);

    // Get stats
    const totalUsers = users.length;
    const totalPro = users.filter(u => u.isPro).length;

    return new Response(JSON.stringify({
      success: true,
      users,
      stats: { totalUsers, totalPro }
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error.' }), { status: 500 });
  }
}
