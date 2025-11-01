import { sendEmail } from "../utils/emailService.js";
import logger from "../utils/logger.js";

// @desc    Send contact form message
// @route   POST /api/contact
// @access  Public
export const sendContactMessage = async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and message",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Create email template for admin
    const adminEmailTemplate = {
      subject: `New Contact Form Submission from ${name}`,
      text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}

Message:
${message}

---
This message was sent from the Rixdu contact form.
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
              <h2 style="color: #1f2937; margin: 0;">New Contact Form Submission</h2>
            </div>
            
            <div style="margin-bottom: 20px;">
              <div style="display: inline-block; width: 100px; font-weight: bold; color: #4b5563;">Name:</div>
              <div style="display: inline-block; color: #1f2937;">${name}</div>
            </div>
            
            <div style="margin-bottom: 20px;">
              <div style="display: inline-block; width: 100px; font-weight: bold; color: #4b5563;">Email:</div>
              <div style="display: inline-block;">
                <a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a>
              </div>
            </div>
            
            <div style="margin-bottom: 20px;">
              <div style="display: inline-block; width: 100px; font-weight: bold; color: #4b5563;">Phone:</div>
              <div style="display: inline-block; color: #1f2937;">${
                phone || "Not provided"
              }</div>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <div style="font-weight: bold; color: #4b5563; margin-bottom: 10px;">Message:</div>
              <div style="color: #1f2937; line-height: 1.6; white-space: pre-wrap;">${message}</div>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                This message was sent from the Rixdu contact form at ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      `,
    };

    // Send email to admin
    await sendEmail({
      to: process.env.CONTACT_EMAIL || process.env.EMAIL_USER,
      ...adminEmailTemplate,
    });

    // Send confirmation email to user
    const userEmailTemplate = {
      subject: "Thank you for contacting Rixdu",
      text: `
Hello ${name},

Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.

Your Message:
${message}

Best regards,
The Rixdu Team
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h2 style="color: #2563eb; margin: 0;">Thank You for Contacting Us!</h2>
            </div>
            
            <p style="color: #1f2937; line-height: 1.6;">Hello ${name},</p>
            
            <p style="color: #1f2937; line-height: 1.6;">
              Thank you for reaching out to us. We have received your message and will get back to you as soon as possible, typically within 24-48 hours.
            </p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <p style="color: #4b5563; margin: 0 0 10px 0; font-weight: bold;">Your Message:</p>
              <p style="color: #1f2937; margin: 0; line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>
            
            <p style="color: #1f2937; line-height: 1.6;">
              If you have any urgent inquiries, please feel free to call us directly at ${
                process.env.CONTACT_PHONE || "123-456-789"
              }.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #1f2937; margin: 0;">Best regards,</p>
              <p style="color: #2563eb; font-weight: bold; margin: 5px 0 0 0;">The Rixdu Team</p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                This is an automated confirmation email. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `,
    };

    await sendEmail({
      to: email,
      ...userEmailTemplate,
    });

    logger.info(`Contact form submitted by ${name} (${email})`);

    res.status(200).json({
      success: true,
      message:
        "Your message has been sent successfully. We'll get back to you soon!",
    });
  } catch (error) {
    logger.error("Error sending contact message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
