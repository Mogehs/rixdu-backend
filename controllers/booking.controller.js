import Bookings from "../models/Bookings.js";
import mongoose from "mongoose";
import Listing from "../models/Listing.js";
import { getBookingEmail, sendEmail } from "../utils/emailService.js";
import {
  getBookingConfirmationSMSTemplate,
  sendSMS,
} from "../utils/smsService.js";

export const createBooking = async (req, res) => {
  try {
    const patientId = req.user.id;
    const {
      doctorId,
      listing,
      date,
      time,
      consultationType,
      patientName,
      phone,
      email,
      notes,
      status,
    } = req.body;
    if (
      !doctorId ||
      !patientId ||
      !date ||
      !time ||
      !patientName ||
      !phone ||
      !email ||
      !listing
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Doctor ID, Patient ID, Date, Time, Patient Name, Phone, Email, and Listing are required.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(doctorId) ||
      !mongoose.Types.ObjectId.isValid(patientId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Doctor ID or Patient ID.",
      });
    }

    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format.",
      });
    }
    if (bookingDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Booking date must be in the future.",
      });
    }
    const existingBooking = await Bookings.findOne({
      doctor: doctorId,
      date: bookingDate,
      time: time,
      status: { $ne: "cancelled" },
    });
    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "Doctor is already booked for this date and time.",
      });
    }

    const booking = new Bookings({
      doctor: doctorId,
      patient: patientId,
      listing: listing,
      date: bookingDate,
      time: time,
      consultationType: consultationType || "clinic",
      patientInfo: {
        name: patientName,
        phone: phone,
        email: email,
      },
      notes: notes || "",
      status: status || "pending",
    });

    await booking.save();
    const populatedBooking = await Bookings.findById(booking._id)
      .populate("doctor", "name email")
      .populate("patient", "name email");

    const emailData = getBookingEmail({
      patientName: populatedBooking.patientInfo.name,
      doctorName: populatedBooking.doctor.name,
      appointmentDate: bookingDate,
      appointmentTime: time,
      consultationType: consultationType || "clinic",
    });

    const messageData = {
      body: getBookingConfirmationSMSTemplate(bookingDate, time),
    };

    const toEmail = populatedBooking.patient.email;
    const toPhoneNumber = populatedBooking.patient.phone;
    if (toEmail) {
      await sendEmail({ to: toEmail, ...emailData });
    }
    if (toPhoneNumber) {
      await sendSMS({ to: toPhoneNumber, ...messageData });
    }

    return res.status(201).json({
      success: true,
      message: "Booking created successfully.",
      data: booking,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while creating booking.",
      error: error.message,
    });
  }
};

export const getBookingsByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Doctor ID.",
      });
    }

    const bookings = await Bookings.find({ doctor: doctorId })
      .populate("patient")
      .populate("doctor", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while fetching bookings.",
      error: error.message,
    });
  }
};

export const getBookingsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Patient ID.",
      });
    }

    const bookings = await Bookings.find({ patient: patientId })
      .populate("doctor", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while fetching bookings.",
      error: error.message,
    });
  }
};
export const getUserBookings = async (req, res) => {
  try {
    const patientId = req.user.id;

    const bookings = await Bookings.find({ patient: patientId })
      .populate("doctor", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while fetching user bookings.",
      error: error.message,
    });
  }
};
export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Booking ID.",
      });
    }

    const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: " + validStatuses.join(", "),
      });
    }

    const booking = await Bookings.findByIdAndUpdate(
      bookingId,
      { status },
      { new: true }
    )
      .populate("doctor", "name email")
      .populate("patient", "name email");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully.",
      data: booking,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while updating booking status.",
      error: error.message,
    });
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const { listingId, doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID and Date are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Doctor ID.",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Listing ID.",
      });
    }
    let bookingDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      bookingDate = new Date(date + "T00:00:00.000Z");
    } else {
      bookingDate = new Date(date);
    }
    if (isNaN(bookingDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format.",
      });
    }

    const doctorListing = await Listing.findById(listingId);

    if (!doctorListing) {
      return res.status(404).json({
        success: false,
        message: "Doctor listing not found.",
        receivedDate: date,
        parsedDate: bookingDate,
      });
    }
    const dayOfWeek = bookingDate.getDay();
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const currentDay = dayNames[dayOfWeek];
    let workingHours = null;
    try {
      const workingHoursStr = doctorListing.values?.get
        ? doctorListing.values.get("working hours")
        : doctorListing.values?.["working hours"];

      if (workingHoursStr) {
        workingHours = parseWorkingHours(workingHoursStr, currentDay);
      }
    } catch (e) {
  }
const dateString =
      date.length === 10 ? date : bookingDate.toISOString().split("T")[0];
    const bookings = await Bookings.find({
      doctor: doctorId,
      status: { $ne: "cancelled" },
      $expr: {
        $eq: [
          { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          dateString,
        ],
      },
    });
    let availableTimeSlots = [];

    if (workingHours && !workingHours.closed) {
      availableTimeSlots = generateSlotsFromWorkingHours(workingHours);
    } else {
      availableTimeSlots = [];
    }
    const bookedSlots = bookings.map((booking) => booking.time);
    const availableSlots = availableTimeSlots.filter(
      (slot) => !bookedSlots.includes(slot)
    );
    const slotsWithStatus = availableTimeSlots.map((slot) => ({
      time: slot,
      available: !bookedSlots.includes(slot),
      booked: bookedSlots.includes(slot),
    }));

    return res.status(200).json({
      success: true,
      data: availableSlots, // Keep backward compatibility
      allSlots: slotsWithStatus, // New enhanced data
      workingHours: workingHours,
      dayInfo: {
        day: currentDay,
        closed: workingHours?.closed || false,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while fetching available slots.",
      error: error.message,
    });
  }
};
const parseWorkingHours = (workingHoursStr, day) => {
  try {
    if (!workingHoursStr) {
      return getDefaultWorkingHours(day);
    }
    const dayAbbrev = day.substring(0, 3).toLowerCase();
    if (day === "Friday") {
      const friMatch = workingHoursStr.match(/fri[^)]*\(([^)]+)\)/i);
      if (friMatch) {
        const timeStr = friMatch[1];
        return parseTimeRange(timeStr);
      }
    }

    if (day === "Saturday" || day === "Sunday") {
      const weekendMatch = workingHoursStr.match(
        new RegExp(`${dayAbbrev}[^)]*\\(([^)]+)\\)`, "i")
      );
      if (weekendMatch) {
        const timeStr = weekendMatch[1];
        return parseTimeRange(timeStr);
      } else {
        return { closed: true, startTime: null, endTime: null };
      }
    }
    if (["Monday", "Tuesday", "Wednesday", "Thursday"].includes(day)) {
      const monThuMatch = workingHoursStr.match(/mon-thu[^)]*\(([^)]+)\)/i);
      if (monThuMatch) {
        const timeStr = monThuMatch[1];
        return parseTimeRange(timeStr);
      }
    }

    return getDefaultWorkingHours(day);
  } catch (error) {
    return getDefaultWorkingHours(day);
  }
};
const parseTimeRange = (timeStr) => {
  try {
    if (!timeStr || timeStr.toLowerCase().includes("closed")) {
      return { closed: true, startTime: null, endTime: null };
    }

    const timeMatch = timeStr.match(/(\d+)\s*([ap]m?)\s*-\s*(\d+)\s*([ap]m?)/i);
    if (timeMatch) {
      const startHour = parseInt(timeMatch[1]);
      const startPeriod = timeMatch[2].toLowerCase();
      const endHour = parseInt(timeMatch[3]);
      const endPeriod = timeMatch[4].toLowerCase();

      let startTime24 = startHour;
      let endTime24 = endHour;
      if (startPeriod.includes("p") && startHour !== 12) {
        startTime24 += 12;
      } else if (startPeriod.includes("a") && startHour === 12) {
        startTime24 = 0;
      }

      if (endPeriod.includes("p") && endHour !== 12) {
        endTime24 += 12;
      } else if (endPeriod.includes("a") && endHour === 12) {
        endTime24 = 0;
      }

      return {
        closed: false,
        startTime: startTime24,
        endTime: endTime24,
      };
    }

    return { closed: true, startTime: null, endTime: null };
  } catch {
    return { closed: true, startTime: null, endTime: null };
  }
};
const getDefaultWorkingHours = (day) => {
  if (day === "Friday") {
    return { closed: false, startTime: 9, endTime: 17 }; // 9 AM to 5 PM (same as other weekdays)
  } else if (day === "Saturday" || day === "Sunday") {
    return { closed: true, startTime: null, endTime: null };
  } else {
    return { closed: false, startTime: 9, endTime: 17 }; // 9 AM to 5 PM
  }
};
const generateSlotsFromWorkingHours = (workingHours) => {
  if (workingHours.closed) {
    return [];
  }

  const slots = [];
  const { startTime, endTime } = workingHours;

  for (let hour = startTime; hour < endTime; hour++) {
    if (hour === 12) continue;

    let timeStr;
    if (hour === 0) {
      timeStr = "12:00 AM";
    } else if (hour < 12) {
      timeStr = `${hour}:00 AM`;
    } else if (hour === 12) {
      timeStr = "12:00 PM";
    } else {
      timeStr = `${hour - 12}:00 PM`;
    }

    slots.push(timeStr);
  }

  return slots;
};
export const checkDateAvailability = async (req, res) => {
  try {
    const { doctorId, startDate, endDate } = req.query;

    if (!doctorId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID, start date, and end date are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Doctor ID.",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format.",
      });
    }

    const doctorListing = await Listing.findById(doctorId);

    if (!doctorListing) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found.",
      });
    }

    const dateAvailability = {};
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().split("T")[0];
      const dayOfWeek = currentDate.getDay();
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const currentDay = dayNames[dayOfWeek];
      let workingHours = null;
      try {
        const workingHoursStr = doctorListing.values?.get
          ? doctorListing.values.get("working hours")
          : doctorListing.values?.["working hours"];

        if (workingHoursStr) {
          workingHours = parseWorkingHours(workingHoursStr, currentDay);
        }
      } catch (e) {
  }
if (workingHours && !workingHours.closed) {
        const availableTimeSlots = generateSlotsFromWorkingHours(workingHours);
        const bookings = await Bookings.find({
          doctor: doctorId,
          date: currentDate,
          status: { $ne: "cancelled" },
        });

        const bookedSlots = bookings.map((booking) => booking.time);
        const availableSlots = availableTimeSlots.filter(
          (slot) => !bookedSlots.includes(slot)
        );

        dateAvailability[dateKey] = {
          hasSlots: availableSlots.length > 0,
          slotsCount: availableSlots.length,
          totalSlots: availableTimeSlots.length,
          workingDay: true,
        };
      } else {
        dateAvailability[dateKey] = {
          hasSlots: false,
          slotsCount: 0,
          totalSlots: 0,
          workingDay: false,
        };
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return res.status(200).json({
      success: true,
      data: dateAvailability,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while checking date availability.",
      error: error.message,
    });
  }
};
