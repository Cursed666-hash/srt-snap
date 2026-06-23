// =============================================
// Email utility for sending license keys
// Uses Cloudflare Email Workers (if configured) or external API
// =============================================

/**
 * Send a license key email to the user
 * @param {string} email - Recipient email
 * @param {string} licenseKey - The license key to send
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendLicenseEmail(email, licenseKey, env) {
  // Check if Email Workers binding is available
  if (env.EMAIL && typeof env.EMAIL.send === 'function') {
    try {
      await env.EMAIL.send({
        from: 'SRT Snap <noreply@yourdomain.com>',
        to: email,
        subject: 'Your SRT Snap Pro License Key',
        text: `Thank you for purchasing SRT Snap Pro!\n\nYour license key: ${licenseKey}\n\nTo activate:\n1. Go to https://srt-snap.pages.dev\n2. Click "Sign In" and log in to your account\n3. Click "Get Pro" or go to the Pricing tab\n4. Enter your email and this license key\n5. Click "Activate License"\n\nIf you have any issues, contact support@yourdomain.com\n\n— The SRT Snap Team`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #7C3AED, #06B6D4); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 1.5rem;">🎬 SRT Snap</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Your Pro License Key</p>
            </div>
            <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
              <p style="font-size: 1rem; color: #1e293b; margin-top: 0;">Thank you for purchasing <strong>SRT Snap Pro</strong>!</p>
              
              <div style="background: #0f172a; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
                <code style="font-size: 1.2rem; color: #22d3ee; letter-spacing: 2px; font-family: 'JetBrains Mono', monospace;">${licenseKey}</code>
              </div>
              
              <p style="color: #475569;">To activate your Pro license:</p>
              <ol style="color: #475569; padding-left: 20px;">
                <li>Go to <a href="https://srt-snap.pages.dev" style="color: #7C3AED;">https://srt-snap.pages.dev</a></li>
                <li>Click "Sign In" and log in to your account</li>
                <li>Click "Get Pro" or go to the Pricing tab</li>
                <li>Enter your email and the license key above</li>
                <li>Click "Activate License"</li>
              </ol>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
              
              <p style="color: #94a3b8; font-size: 0.85rem;">
                If you have any issues, contact <a href="mailto:support@yourdomain.com" style="color: #7C3AED;">support@yourdomain.com</a>
              </p>
              <p style="color: #94a3b8; font-size: 0.85rem;">— The SRT Snap Team</p>
            </div>
          </div>
        `
      });
      return { success: true };
    } catch (err) {
      console.error('Email Workers send error:', err);
      return { success: false, error: err.message };
    }
  }

  // Fallback: Use external API (e.g., Resend, SendGrid, Mailgun) if configured
  if (env.EMAIL_API_KEY && env.EMAIL_API_URL) {
    try {
      const response = await fetch(env.EMAIL_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'SRT Snap <noreply@yourdomain.com>',
          to: email,
          subject: 'Your SRT Snap Pro License Key',
          text: `Your license key: ${licenseKey}\n\nActivate at https://srt-snap.pages.dev`
        })
      });
      
      if (response.ok) {
        return { success: true };
      } else {
        const err = await response.text();
        return { success: false, error: `Email API error: ${err}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // No email service configured - log for manual delivery
  console.log(`📧 License key for ${email}: ${licenseKey} (No email service configured - manual delivery needed)`);
  return { success: false, error: 'No email service configured. License key logged for manual delivery.' };
}

/**
 * Send a purchase confirmation email
 */
export async function sendPurchaseConfirmation(email, orderId, env) {
  if (env.EMAIL && typeof env.EMAIL.send === 'function') {
    try {
      await env.EMAIL.send({
        from: 'SRT Snap <noreply@yourdomain.com>',
        to: email,
        subject: 'SRT Snap Pro Purchase Confirmed',
        text: `Your purchase has been confirmed! Order ID: ${orderId}\nYour license key will be sent shortly.`,
        html: `<p>Your purchase has been confirmed! Order ID: ${orderId}</p>`
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'No email service configured' };
}