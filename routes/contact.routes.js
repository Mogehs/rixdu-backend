import express from "express";
import { sendContactMessage } from "../controllers/contact.controller.js";

const router = express.Router();

// @route   POST /api/contact
// @desc    Send contact form message
// @access  Public
router.post("/", sendContactMessage);

export default router;
