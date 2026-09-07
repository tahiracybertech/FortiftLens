// FortifyLens — Payment Routes
// POST /api/payments/create-checkout-session       — org plan
// POST /api/payments/create-individual-checkout    — individual plan
// GET  /api/payments/verify/:sessionId             — success page check
// POST /api/payments/webhook                       — Stripe webhook

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { FieldValue } = require('firebase-admin/firestore');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
const STRIPE_SK = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Org plan checkout ────────────────────────────────────────
router.post('/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const { planName } = req.body;
    const orgId  = req.user.orgId;
    const userId = req.user.uid;

    if (!orgId) return res.status(400).json({ error: 'No organization found for this account' });

    const PRICES = { Starter: 50000, Business: 100000 }; // PKR in paisa
    const price = PRICES[planName];
    if (!price) return res.status(400).json({ error: 'Invalid plan. Use Starter or Business.' });

    const Stripe = require('stripe');
    const stripe = Stripe(STRIPE_SK);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [{
        price_data: {
          currency: 'pkr',
          product_data: { name: `FortifyLens ${planName} Plan (Organization)` },
          unit_amount: price,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { orgId, userId, planName, type: 'org' },
      success_url: `${FRONTEND}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=org`,
      cancel_url:  `${FRONTEND}/pricing?payment=cancelled`,
    });

    // record pending
    await db.collection('payments').doc(session.id).set({
      orgId, userId, planName, type: 'org',
      stripeSessionId: session.id, status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, checkoutUrl: session.url });
  } catch (err) {
    console.error('Org checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── Individual plan checkout ─────────────────────────────────
router.post('/create-individual-checkout', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const Stripe = require('stripe');
    const stripe = Stripe(STRIPE_SK);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [{
        price_data: {
          currency: 'pkr',
          product_data: { name: 'FortifyLens Individual Plan' },
          unit_amount: 30000, // Rs. 300 in paisa
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { userId, planName: 'Individual', type: 'individual' },
      success_url: `${FRONTEND}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=individual`,
      cancel_url:  `${FRONTEND}/pricing?payment=cancelled`,
    });

    await db.collection('payments').doc(session.id).set({
      userId, planName: 'Individual', type: 'individual',
      stripeSessionId: session.id, status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, checkoutUrl: session.url });
  } catch (err) {
    console.error('Individual checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── Verify session (success page) ───────────────────────────
router.get('/verify/:sessionId', verifyToken, async (req, res) => {
  try {
    const Stripe = require('stripe');
    const stripe = Stripe(STRIPE_SK);
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({
      success: true,
      paymentStatus: session.payment_status,
      planName: session.metadata?.planName,
      type: session.metadata?.type || 'org',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// ── Webhook ──────────────────────────────────────────────────
// IMPORTANT: must be mounted BEFORE express.json() in server/index.js
// app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const Stripe = require('stripe');
    const stripe = Stripe(STRIPE_SK);
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook sig failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { orgId, userId, planName, type } = session.metadata || {};

    // Idempotency guard
    const ref = db.collection('payments').doc(session.id);
    const doc = await ref.get();
    if (doc.exists && doc.data().status === 'paid') {
      return res.json({ received: true });
    }

    // Mark payment paid
    await ref.set({
      status: 'paid',
      stripePaymentIntent: session.payment_intent || null,
      amountTotal: session.amount_total,
      paidAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Activate subscription on correct Firestore path
    if (type === 'individual' && userId) {
      await db.collection('users').doc(userId).update({
        planStatus: 'active',
        currentPlan: planName || 'Individual',
        planActivatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[payments] Individual activated: ${userId}`);
    } else if (orgId) {
      await db.collection('organizations').doc(orgId).update({
        planStatus: 'active',
        currentPlan: planName,
        planActivatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[payments] Org activated: ${orgId} plan=${planName}`);
    }
  }

  res.json({ received: true });
});

module.exports = router;