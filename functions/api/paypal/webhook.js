// =============================================
// POST /api/paypal/webhook
// Handle PayPal payment notifications (IPN/Webhooks)
// Automatically generates and sends license keys on successful purchase
// =============================================

import { sendLicenseEmail } from '../../utils/email.js';

// Generate secure random license key (format: SRTN-XXXX-XXXX-XXXX)
function generateSecureLicenseKey() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let key = 'SRTN-';
  for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  key += '-';
  for (let i = 0; i < 4; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  key += '-';
  for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

// Verify PayPal webhook signature (simplified - in production use proper verification)
// For production, verify the webhook signature using PayPal's SDK or webhook ID
async function verifyPayPalWebhook(request, env) {
  // In production, you would verify the webhook signature here
  // using env.PAYPAL_WEBHOOK_ID and the PayPal SDK
  // For now, we'll trust the webhook (add proper verification in production)
  return true;
}

export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    // Verify webhook signature
    const isValid = await verifyPayPalWebhook(request, env);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid webhook signature' }), { status: 401 });
    }

    const payload = await request.json();
    
    // Log the webhook for debugging
    console.log('PayPal webhook received:', JSON.stringify(payload, null, 2));

    // Handle different event types
    const eventType = payload.event_type;
    
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
      // Payment completed - extract purchaser info
      const resource = payload.resource;
      const purchaserEmail = resource.payer?.email_address || 
                            resource.payer?.payer_info?.email ||
                            payload.resource?.purchase_units?.[0]?.payee?.email_address;
      
      // Also check for custom_id or invoice_id which might contain the user's email
      const customId = resource.custom_id || resource.invoice_id || 
                       payload.resource?.purchase_units?.[0]?.custom_id ||
                       payload.resource?.purchase_units?.[0]?.invoice_id;
      
      // Try to get email from custom_id if it's an email
      let userEmail = purchaserEmail || customId;
      
      if (!userEmail || !userEmail.includes('@')) {
        // If we can't determine the email, log and return success (don't fail the webhook)
        console.warn('Could not determine user email from PayPal webhook:', payload);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Webhook received but email not found. Manual license creation needed.' 
        }), { status: 200 });
      }

      userEmail = userEmail.toLowerCase().trim();
      const licenseKey = generateSecureLicenseKey();

      // Store the license key in KV
      await env.SRT_SNAP_DATA.put(`license:${licenseKey}`, JSON.stringify({
        email: userEmail,
        createdAt: Date.now(),
        status: 'unused',
        source: 'paypal',
        paypalOrderId: resource.id || resource.order_id,
        paypalPayerId: resource.payer?.payer_id
      }));

      // If user exists, update their record with pending license
      const userDataRaw = await env.SRT_SNAP_DATA.get(`user:${userEmail}`);
      if (userDataRaw) {
        const userData = JSON.parse(userDataRaw);
        userData.pendingLicenseKey = licenseKey;
        await env.SRT_SNAP_DATA.put(`user:${userEmail}`, JSON.stringify(userData));
      }

      // Send license key via email
      const emailResult = await sendLicenseEmail(userEmail, licenseKey, env);
      if (!emailResult.success) {
        console.warn(`Failed to send license email to ${userEmail}: ${emailResult.error}`);
      }

      console.log(`License key generated for ${userEmail}: ${licenseKey} (PayPal order: ${resource.id || resource.order_id})`);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'License key generated and stored',
        email: userEmail,
        licenseKey
      }), { status: 200 });
    }

    // Handle other event types (refunds, disputes, etc.)
    if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'CUSTOMER.DISPUTE.CREATED') {
      // Handle refund/dispute - optionally revoke license
      const resource = payload.resource;
      const customId = resource.custom_id || resource.invoice_id;
      if (customId && customId.includes('@')) {
        const userEmail = customId.toLowerCase().trim();
        // Could revoke license here if needed
        console.log(`Refund/dispute for ${userEmail}: ${resource.id}`);
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Acknowledge other events
    return new Response(JSON.stringify({ success: true, message: 'Event acknowledged' }), { status: 200 });

  } catch (err) {
    console.error('PayPal webhook error:', err);
    // Return 200 to prevent PayPal from retrying (we log the error)
    return new Response(JSON.stringify({ success: false, error: 'Webhook processing error' }), { status: 200 });
  }
}