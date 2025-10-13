import express from "express";
import { handleStripeWebhook } from "../controllers/stripe-webhook.controller.js";

const router = express.Router();

// Stripe webhook endpoint (raw body handled at server level)
router.post("/webhook", handleStripeWebhook);

export default router;
