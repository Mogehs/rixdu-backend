import twilio from "twilio";

const createClient = () => {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

export const sendSMS = async (options) => {
  try {
    const client = createClient();
    const phoneNumber = formatPhoneNumber(options.to);

    const message = await client.messages.create({
      body: options.body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    console.log("SMS sent with SID:", message.sid);
    return message;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
};

// SMS templates
export const getVerificationSMSTemplate = (verificationCode) => {
  return `Your verification code is: ${verificationCode}. This code will expire in 15 minutes. If you did not request this code, please ignore this message.`;
};

export const getPasswordResetSMSTemplate = (resetCode) => {
  return `Your password reset code is: ${resetCode}. This code will expire in 15 minutes. If you did not request this code, please ignore this message.`;
};

export const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;

  phoneNumber = phoneNumber.replace(/\D/g, "");

  if (phoneNumber.startsWith("0")) {
    phoneNumber = "+92" + phoneNumber.substring(1);
  } else if (!phoneNumber.startsWith("+")) {
    phoneNumber = "+" + phoneNumber;
  }

  return phoneNumber;
};
