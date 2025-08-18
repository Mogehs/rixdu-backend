import nodemailer from "nodemailer";
import process from "process";

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

export const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || "Rixdu"} <${
        process.env.EMAIL_FROM || "noreply@rixdu.com"
      }>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export const getVerificationEmailTemplate = (name, verificationCode) => {
  return {
    subject: "Rixdu - Email Verification Code",
    text: `Hello ${name},\n\nYour email verification code is: ${verificationCode}\n\nThis code will expire in 15 minutes.\n\nThank you,\nThe Rixdu Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h2>Rixdu Email Verification</h2>
        </div>
        <div style="padding: 20px;">
          <p>Hello ${name},</p>
          <p>Your email verification code is:</p>
          <div style="background-color: #f0f0f0; padding: 15px; font-size: 24px; text-align: center; font-weight: bold; margin: 20px 0; letter-spacing: 5px;">
            ${verificationCode}
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
          <p>Thank you,<br>The Rixdu Team</p>
        </div>
      </div>
    `,
  };
};

export const getPasswordResetEmailTemplate = (name, resetCode) => {
  return {
    subject: "Rixdu - Password Reset Code",
    text: `Hello ${name},\n\nYour password reset code is: ${resetCode}\n\nThis code will expire in 15 minutes.\n\nThank you,\nThe Rixdu Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h2>Rixdu Password Reset</h2>
        </div>
        <div style="padding: 20px;">
          <p>Hello ${name},</p>
          <p>Your password reset code is:</p>
          <div style="background-color: #f0f0f0; padding: 15px; font-size: 24px; text-align: center; font-weight: bold; margin: 20px 0; letter-spacing: 5px;">
            ${resetCode}
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
          <p>Thank you,<br>The Rixdu Team</p>
        </div>
      </div>
    `,
  };
};

export const getListingNotificationEmail = ({
  title = "New Listing",
  message = "",
  image,
  ctaUrl,
  storeName = "Rixdu",
}) => {
  const subject = `${storeName} - ${title}`;
  const text = `${title}\n\n${message}\n\nView Listing: ${ctaUrl || ""}`;
  const html = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
      <tr>
        <td>
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" align="center" style="margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Inter,Segoe UI,Arial,Helvetica,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #f1f1f5;display:flex;align-items:center;gap:12px;">
                <img src="https://rixdu.com/rixdu-logo.png" alt="Rixdu" width="28" height="28" style="border-radius:6px;display:block" />
                <div style="font-weight:700;font-size:16px;color:#111827;">${storeName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <div style="font-size:18px;font-weight:700;color:#111827;line-height:1.3;margin-bottom:8px;">${title}</div>
                <div style="font-size:14px;color:#374151;line-height:1.6;">${message}</div>
              </td>
            </tr>
            ${
              image
                ? `
            <tr>
              <td style="padding:12px 24px 0 24px;">
                <img src="${image}" alt="Listing" style="width:100%;max-height:280px;object-fit:cover;border-radius:10px;display:block" />
              </td>
            </tr>`
                : ""
            }
            ${
              ctaUrl
                ? `
            <tr>
              <td style="padding:20px 24px 28px 24px;">
                <a href="${ctaUrl}"
                   style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">
                  View Listing
                </a>
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:16px 24px 20px 24px;border-top:1px solid #f1f1f5;font-size:12px;color:#6b7280;">
                You’re receiving this because you enabled notifications for ${storeName}. If this wasn’t you, you can update your preferences in your account settings.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  return { subject, text, html };
};

export const getBookingEmail = ({
  patientName,
  doctorName,
  appointmentDate,
  appointmentTime,
  consultationType,
}) => {
  const subject = `Appointment Confirmation - ${doctorName}`;
  const text = `Hello ${patientName},\n\nYour appointment with Dr. ${doctorName} has been confirmed.\n\nDetails:\n- Date: ${appointmentDate}\n- Time: ${appointmentTime}\n- Consultation Type: ${consultationType}\n\nThank you,\nThe Rixdu Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
        <h2>Appointment Confirmation</h2>
      </div>
      <div style="padding: 20px;">
        <p>Hello ${patientName},</p>
        <p>Your appointment with Dr. ${doctorName} has been confirmed.</p>
        <p><strong>Details:</strong></p>
        <ul>
          <li>Date: ${appointmentDate}</li>
          <li>Time: ${appointmentTime}</li>
          <li>Consultation Type: ${consultationType}</li>
        </ul>
        <p>Thank you,<br>The Rixdu Team</p>
      </div>
    </div>
  `;
  return { subject, text, html };
};
