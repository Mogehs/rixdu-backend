import { Worker } from "bullmq";
import redis from "../config/redis.js";
import { JOB_TYPES } from "../config/queue.js";
import {
  sendEmail,
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
} from "../utils/emailService.js";

export const emailWorker = new Worker(
  "email",
  async (job) => {
    const { name: type, data } = job;

    console.log(`Processing email job: ${type} for ${data.to}`);

    switch (type) {
      case JOB_TYPES.EMAIL.VERIFICATION: {
        const verificationTemplate = getVerificationEmailTemplate(
          data.name,
          data.verificationCode
        );
        await sendEmail({
          to: data.to,
          subject: verificationTemplate.subject,
          text: verificationTemplate.text,
          html: verificationTemplate.html,
        });
        break;
      }

      case JOB_TYPES.EMAIL.PASSWORD_RESET: {
        const resetTemplate = getPasswordResetEmailTemplate(
          data.name,
          data.resetCode
        );
        await sendEmail({
          to: data.to,
          subject: resetTemplate.subject,
          text: resetTemplate.text,
          html: resetTemplate.html,
        });
        break;
      }

      default:
        throw new Error(`Unknown email job type: ${type}`);
    }

    return { success: true, type, to: data.to };
  },
  {
    connection: redis,
    concurrency: 5, // Process up to 5 email jobs concurrently
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

emailWorker.on("completed", (job, result) => {
  console.log(`Email worker completed job ${job.id}:`, result);
});

emailWorker.on("failed", (job, err) => {
  console.error(`Email worker failed job ${job.id}:`, err.message);
});

emailWorker.on("error", (err) => {
  console.error("Email worker error:", err);
});
