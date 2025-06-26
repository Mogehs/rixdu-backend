import express from "express";
import {
  sendVerificationCode,
  register,
  login,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  resendVerificationCode,
  changePassword,
  auth0Login,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/send-verification", sendVerificationCode);
router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.get("/logout", logout);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.post("/resend-verification", resendVerificationCode);

router.post("/change-password", protect, changePassword);

router.post("/auth0", auth0Login);

export default router;
