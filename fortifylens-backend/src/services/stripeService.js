// ============================================================
// FortifyLens — Stripe Service Layer
// Wraps all direct Stripe SDK calls used by payment routes.
// ============================================================

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is missing from .env — payment routes will fail.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// ── Plan → Price map ──────────────────────────────────────────
// Stripe needs a `price` (in the smallest currency unit, e.g. paisa for PKR)
// rather than a plan name. Keep this in sync with subscriptionPlans in Firestore.
// Enterprise has no fixed price (Contact Sales), so it is excluded here.
const PLAN_PRICING = {
  Starter:  { amountMinor: 50000,  currency: 'pkr', label: 'FortifyLens — Starter Plan (Monthly)' },   // Rs. 500
  Business: { amountMinor: 100000, currency: 'pkr', label: 'FortifyLens — Business Plan (Monthly)' },  // Rs. 1000
};

function getPlanPricing(planName) {
  return PLAN_PRICING[planName] || null;
}

/**
 * Creates a Stripe Checkout Session for a subscription-style one-time payment.
 * (Using `mode: payment` with manual monthly renewal tracked in Firestore,
 *  since FortifyLens manages its own plan/billing cycle rather than Stripe Billing.)
 */
async function createCheckoutSession({ planName, orgId, userId, userEmail, successUrl, cancelUrl }) {
  const pricing = getPlanPricing(planName);
  if (!pricing) {
    throw new Error(`No Stripe pricing configured for plan "${planName}"`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: pricing.currency,
          product_data: {
            name: pricing.label,
            description: `Subscription upgrade for organization ${orgId}`,
          },
          unit_amount: pricing.amountMinor,
        },
        quantity: 1,
      },
    ],
    metadata: {
      orgId,
      userId,
      planName,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

/**
 * Verifies and constructs a Stripe event from the raw webhook payload.
 * Must be called with the *raw* request body (not JSON-parsed).
 */
function constructWebhookEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is missing from .env');
  }
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Retrieves a Checkout Session by ID (used for the success-page confirmation call).
 */
async function retrieveSession(sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId);
}

module.exports = {
  stripe,
  getPlanPricing,
  createCheckoutSession,
  constructWebhookEvent,
  retrieveSession,
};