// =============================================
// POST /api/verify-key
// Activate Pro with a license key (secure random keys)
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

// Generate secure random license key (format: SRTN-XXXX-XXXX-XXXX)
function generateSecureLicenseKey() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let key = 'SRTN-';
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
    const { email, key, sessionToken } = await request.json();
    
    if (!email || !key) {
      return new Response(JSON.stringify({ success: false, error: 'Email and license key are required.' }), { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedKey = key.trim().toUpperCase();

    // Look up the license key in KV (secure random key validation)
    const licenseRaw = await env.SRT_SNAP_DATA.get(`license:${normalizedKey}`);
    if (!licenseRaw) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid license key. Please check your key and try again.' }), { status: 401 });
    }

    const licenseData = JSON.parse(licenseRaw);
    
    // Check if license is already used by someone else
    if (licenseData.email && licenseData.email !== normalizedEmail && licenseData.status !== 'unused') {
      return new Response(JSON.stringify({ success: false, error: 'This license key has already been activated on another account.' }), { status: 403 });
    }

    // Get user data
    const userDataRaw = await env.SRT_SNAP_DATA.get(`user:${normalizedEmail}`);
    if (!userDataRaw) {
      return new Response(JSON.stringify({ success: false, error: 'No account found. Please register first.' }), { status: 404 });
    }

    const userData = JSON.parse(userDataRaw);

    // Activate Pro for this user
    userData.isPro = true;
    userData.proLicenseKey = normalizedKey;
    userData.proActivatedAt = Date.now();
    
    await env.SRT_SNAP_DATA.put(`user:${normalizedEmail}`, JSON.stringify(userData));

    // Update license key status
    licenseData.email = normalizedEmail;
    licenseData.activatedAt = Date.now();
    licenseData.status = 'active';
    await env.SRT_SNAP_DATA.put(`license:${normalizedKey}`, JSON.stringify(licenseData));

    return new Response(JSON.stringify({
      success: true,
      email: normalizedEmail,
      key: normalizedKey,
      isPro: true
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error. Please try again.' }), { status: 500 });
  }
}
