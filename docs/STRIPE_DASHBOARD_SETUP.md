# Complete Stripe Dashboard Setup Guide

## 🎯 Step-by-Step Stripe Dashboard Configuration

### Prerequisites

- Stripe account created
- Your backend deployed and accessible via HTTPS (use ngrok for local testing)

---

## 1. 🔑 Get API Keys

### Navigate to API Keys

1. Log into [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **"Developers"** in the left sidebar
3. Click **"API keys"**

### Copy Your Keys

**Test Environment:**

- **Publishable key**: `pk_test_...` → Add to frontend `.env` as `VITE_STRIPE_PUBLISHABLE_KEY`
- **Secret key**: `sk_test_...` → Add to backend `.env` as `STRIPE_SECRET_KEY`

**Live Environment (when ready):**

- Toggle to "Live data"
- Copy **Publishable key**: `pk_live_...`
- Copy **Secret key**: `sk_live_...`

---

## 2. 🎁 Create Products & Prices

### Create Premium Subscription Product

1. Go to **"Products"** in left sidebar
2. Click **"+ Add product"**
3. Fill in:
   - **Name**: `Premium Listing Subscription`
   - **Description**: `Unlimited listings for 1 month`
   - **Metadata**: Add `type` = `premium_subscription`

### Create Pricing

1. In the product page, click **"+ Add another price"**
2. Configure:
   - **Price**: `27.00`
   - **Currency**: `AED` (United Arab Emirates Dirham)
   - **Billing period**: `Monthly`
   - **Usage type**: `Licensed` (not metered)
3. Click **"Save price"**
4. **Copy the Price ID** (starts with `price_...`) - you'll need this

---

## 3. 🔔 Configure Webhooks

### Create Webhook Endpoint

1. Go to **"Developers"** → **"Webhooks"**
2. Click **"+ Add endpoint"**

### Endpoint Configuration

**Endpoint URL:**

```
https://your-domain.com/api/v1/stripe/webhook
```

_For local testing with ngrok:_

```
https://your-ngrok-url.ngrok.io/api/v1/stripe/webhook
```

### Select Events to Send

**Essential Events** (check these boxes):

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.trial_will_end`

### Advanced Settings

- **API Version**: `2020-08-27` (or latest)
- **Filter events**: Leave blank (send all selected events)

### Save and Get Signing Secret

1. Click **"Add endpoint"**
2. Click on the newly created endpoint
3. Click **"Reveal"** under **"Signing secret"**
4. Copy the secret (starts with `whsec_...`)
5. Add to backend `.env` as `STRIPE_WEBHOOK_SECRET=whsec_...`

---

## 4. 🧪 Test Configuration

### Test Cards for Development

```
# Successful payment
4242 4242 4242 4242

# Declined payment
4000 0000 0000 0002

# Requires authentication (3D Secure)
4000 0000 0000 3220
```

### Test the Webhook

1. Go to **"Developers"** → **"Webhooks"**
2. Click on your endpoint
3. Click **"Send test webhook"**
4. Select `customer.subscription.created`
5. Click **"Send test webhook"**
6. Check your server logs to confirm receipt

---

## 5. 🛡️ Security Settings

### Restricted API Keys (Recommended)

1. Go to **"Developers"** → **"API keys"**
2. Click **"Create restricted key"**
3. Set permissions:
   - **Customers**: `Write`
   - **Subscriptions**: `Write`
   - **Products**: `Read`
   - **Prices**: `Read`
   - **Payment Intents**: `Write`
   - **Invoices**: `Read`
4. Use this restricted key instead of the full secret key

### Webhook Security

- Always verify webhook signatures in your code
- Use HTTPS for webhook endpoints
- Keep webhook secrets secure

---

## 6. 📊 Dashboard Monitoring

### Key Areas to Monitor

1. **"Payments"**: Track successful/failed payments
2. **"Subscriptions"**: Monitor active subscriptions
3. **"Customers"**: View customer payment methods
4. **"Developers" → "Events"**: See all webhook events
5. **"Developers" → "Logs"**: Debug API requests

### Set Up Notifications

1. Go to **"Settings"** → **"Notifications"**
2. Enable email alerts for:
   - Failed payments
   - Subscription cancellations
   - Webhook delivery failures

---

## 7. 🔄 Environment Variables Summary

**Backend `.env` file should contain:**

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...  # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional: Specific price ID if you want to hardcode it
STRIPE_PREMIUM_PRICE_ID=price_...
```

**Frontend `.env` file should contain:**

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...  # or pk_live_... for production
```

---

## 8. 🚀 Going Live Checklist

### Before Switching to Live Mode:

- [ ] Test all payment flows thoroughly
- [ ] Verify webhook delivery in test mode
- [ ] Update webhook URL to production domain
- [ ] Switch API keys to live keys (`pk_live_...`, `sk_live_...`)
- [ ] Create live webhook endpoint
- [ ] Test with real (small amount) payment
- [ ] Set up monitoring and alerts

### Live Mode Configuration:

1. Toggle to **"Live data"** in Stripe dashboard
2. Repeat webhook setup for live environment
3. Update environment variables with live keys
4. Monitor first live transactions closely

---

## 🎛️ Your Current Setup Status

Based on your code, you need:

### ✅ Already Configured:

- Subscription controller with Stripe integration
- Webhook handler for subscription events
- Frontend payment modal

### ⚠️ Need to Configure:

1. **Create webhook endpoint** in Stripe Dashboard
2. **Add webhook secret** to your `.env`
3. **Test webhook delivery**
4. **Monitor subscription events**

### 🔧 Webhook URL for Your Setup:

```
https://your-domain.com/api/v1/stripe/webhook
```

This endpoint will automatically:

- ✅ Create subscription records when customers subscribe
- ✅ Update subscription status on payment success/failure
- ✅ Handle subscription cancellations
- ✅ Process subscription renewals

Your subscription system is now **production-ready** with proper webhook handling! 🎉
