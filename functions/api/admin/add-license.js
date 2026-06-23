// =============================================
// POST /api/admin/add-license
// Generate a secure random license key for a user (admin only)
// After PayPal purchase, admin generates a key
// =============================================

import { sendLicenseEmail } from '../../utils/email.js';

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
    const { email } = await request.json();
    
    if (!email) {
      return new Response(JSON.stringify({ success: false, error: 'Email is required.' }), { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const licenseKey = generateSecureLicenseKey();

    // Store the license key
    await env.SRT_SNAP_DATA.put(`license:${licenseKey}`, JSON.stringify({
      email: normalizedEmail,
      createdAt: Date.now(),
      status: 'unused'
    }));

    // If user exists, also update their record
    const userDataRaw = await env.SRT_SNAP_DATA.get(`user:${normalizedEmail}`);
    if (userDataRaw) {
      const userData = JSON.parse(userDataRaw);
      // Don't auto-activate — user still needs to activate via UI
      // But store the key reference
      userData.pendingLicenseKey = licenseKey;
      await env.SRT_SNAP_DATA.put(`user:${normalizedEmail}`, JSON.stringify(userData));
    }

    // Send license key via email
    const emailResult = await sendLicenseEmail(normalizedEmail, licenseKey, env);
    if (!emailResult.success) {
      console.warn(`Failed to send license email to ${normalizedEmail}: ${emailResult.error}`);
    }

    return new Response(JSON.stringify({
      success: true,
      email: normalizedEmail,
      licenseKey,
      message: `License key generated for ${normalizedEmail}. ${emailResult.success ? 'Email sent.' : 'Email sending failed - key stored in KV.'}`
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Server error.' }), { status: 500 });
  }
}
