import {
  addEmailJob,
  addSmsJob,
  addProfileJob,
  JOB_TYPES,
} from "../config/queue.js";

/**
 * Service for managing authentication-related background jobs
 */
export class AuthJobService {
  /**
   * Send verification email via job queue
   */
  static async sendVerificationEmail(
    email,
    name,
    verificationCode,
    options = {}
  ) {
    try {
      const job = await addEmailJob(
        JOB_TYPES.EMAIL.VERIFICATION,
        {
          to: email,
          name,
          verificationCode,
        },
        {
          delay: options.delay || 0,
          priority: options.priority || 1,
        }
      );

      console.log(`Verification email job queued: ${job.id} for ${email}`);
      return job;
    } catch (error) {
      console.error("Error queueing verification email job:", error);
      throw error;
    }
  }

  /**
   * Send password reset email via job queue
   */
  static async sendPasswordResetEmail(email, name, resetCode, options = {}) {
    try {
      const job = await addEmailJob(
        JOB_TYPES.EMAIL.PASSWORD_RESET,
        {
          to: email,
          name,
          resetCode,
        },
        {
          delay: options.delay || 0,
          priority: options.priority || 2,
        }
      );

      console.log(`Password reset email job queued: ${job.id} for ${email}`);
      return job;
    } catch (error) {
      console.error("Error queueing password reset email job:", error);
      throw error;
    }
  }

  /**
   * Send verification SMS via job queue
   */
  static async sendVerificationSMS(
    phoneNumber,
    verificationCode,
    options = {}
  ) {
    try {
      const job = await addSmsJob(
        JOB_TYPES.SMS.VERIFICATION,
        {
          to: phoneNumber,
          verificationCode,
        },
        {
          delay: options.delay || 0,
          priority: options.priority || 1,
        }
      );

      console.log(`Verification SMS job queued: ${job.id} for ${phoneNumber}`);
      return job;
    } catch (error) {
      console.error("Error queueing verification SMS job:", error);
      throw error;
    }
  }

  /**
   * Send password reset SMS via job queue
   */
  static async sendPasswordResetSMS(phoneNumber, resetCode, options = {}) {
    try {
      const job = await addSmsJob(
        JOB_TYPES.SMS.PASSWORD_RESET,
        {
          to: phoneNumber,
          resetCode,
        },
        {
          delay: options.delay || 0,
          priority: options.priority || 2,
        }
      );

      console.log(
        `Password reset SMS job queued: ${job.id} for ${phoneNumber}`
      );
      return job;
    } catch (error) {
      console.error("Error queueing password reset SMS job:", error);
      throw error;
    }
  }

  /**
   * Create user profile via job queue
   */
  static async createUserProfile(userId, options = {}) {
    try {
      const job = await addProfileJob(
        JOB_TYPES.PROFILE.CREATE,
        {
          userId,
        },
        {
          delay: options.delay || 0,
          priority: options.priority || 1,
        }
      );

      console.log(`Profile creation job queued: ${job.id} for user ${userId}`);
      return job;
    } catch (error) {
      console.error("Error queueing profile creation job:", error);
      throw error;
    }
  }

  /**
   * Send communication (email or SMS) based on verification method
   */
  static async sendVerificationCode(
    verificationMethod,
    contact,
    name,
    verificationCode,
    options = {}
  ) {
    if (verificationMethod === "phone") {
      return await this.sendVerificationSMS(contact, verificationCode, options);
    } else {
      return await this.sendVerificationEmail(
        contact,
        name,
        verificationCode,
        options
      );
    }
  }

  /**
   * Send password reset communication based on method
   */
  static async sendPasswordResetCode(
    verificationMethod,
    contact,
    name,
    resetCode,
    options = {}
  ) {
    if (verificationMethod === "phone") {
      return await this.sendPasswordResetSMS(contact, resetCode, options);
    } else {
      return await this.sendPasswordResetEmail(
        contact,
        name,
        resetCode,
        options
      );
    }
  }
}
