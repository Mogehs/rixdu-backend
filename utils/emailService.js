import nodemailer from "nodemailer";

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
    console.log("Email sent:", info.messageId);
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
