import express from "express";
import {
  createBooking,
  getBookingsByDoctor,
  getBookingsByPatient,
  getUserBookings,
  updateBookingStatus,
  getAvailableSlots,
  checkDateAvailability,
} from "../controllers/booking.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createBooking);
router.get("/user", protect, getUserBookings);
router.get("/doctor/:doctorId", protect, getBookingsByDoctor);
router.get("/patient/:patientId", protect, getBookingsByPatient);
router.get("/available-slots", protect, getAvailableSlots);
router.get("/check-availability", protect, checkDateAvailability);
router.patch("/:bookingId/status", protect, updateBookingStatus);

export default router;
