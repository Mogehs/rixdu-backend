import { emailQueue, smsQueue, profileQueue } from "../config/queue.js";

/**
 * Queue monitoring utility for checking job queue status
 */
export class QueueMonitor {
  /**
   * Get statistics for all queues
   */
  static async getQueueStats() {
    try {
      const [emailStats, smsStats, profileStats] = await Promise.all([
        this.getQueueInfo(emailQueue, "Email"),
        this.getQueueInfo(smsQueue, "SMS"),
        this.getQueueInfo(profileQueue, "Profile"),
      ]);

      return {
        email: emailStats,
        sms: smsStats,
        profile: profileStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting queue stats:", error);
      throw error;
    }
  }

  /**
   * Get info for a specific queue
   */
  static async getQueueInfo(queue, name) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        name,
        counts: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
        },
        jobs: {
          waiting: waiting.slice(0, 5).map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            timestamp: job.timestamp,
          })),
          active: active.slice(0, 5).map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            processedOn: job.processedOn,
          })),
          failed: failed.slice(0, 5).map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            failedReason: job.failedReason,
            finishedOn: job.finishedOn,
          })),
        },
      };
    } catch (error) {
      console.error(`Error getting info for ${name} queue:`, error);
      return {
        name,
        error: error.message,
      };
    }
  }

  /**
   * Clean up completed and failed jobs
   */
  static async cleanQueues() {
    try {
      const queues = [emailQueue, smsQueue, profileQueue];
      const cleanupPromises = queues.map((queue) =>
        queue
          .clean(24 * 60 * 60 * 1000, 100, "completed")
          .then(() => queue.clean(7 * 24 * 60 * 60 * 1000, 50, "failed"))
      );

      await Promise.all(cleanupPromises);
      console.log("Queue cleanup completed successfully");
      return { success: true, message: "Queue cleanup completed" };
    } catch (error) {
      console.error("Error cleaning queues:", error);
      throw error;
    }
  }

  /**
   * Retry all failed jobs in a queue
   */
  static async retryFailedJobs(queueName) {
    try {
      let queue;
      switch (queueName.toLowerCase()) {
        case "email":
          queue = emailQueue;
          break;
        case "sms":
          queue = smsQueue;
          break;
        case "profile":
          queue = profileQueue;
          break;
        default:
          throw new Error(`Unknown queue: ${queueName}`);
      }

      const failedJobs = await queue.getFailed();
      const retryPromises = failedJobs.map((job) => job.retry());
      await Promise.all(retryPromises);

      console.log(
        `Retried ${failedJobs.length} failed jobs in ${queueName} queue`
      );
      return {
        success: true,
        retriedCount: failedJobs.length,
        message: `Retried ${failedJobs.length} failed jobs`,
      };
    } catch (error) {
      console.error(`Error retrying failed jobs in ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Pause/Resume a queue
   */
  static async pauseQueue(queueName) {
    try {
      const queue = this.getQueueByName(queueName);
      await queue.pause();
      console.log(`Paused ${queueName} queue`);
      return { success: true, message: `${queueName} queue paused` };
    } catch (error) {
      console.error(`Error pausing ${queueName} queue:`, error);
      throw error;
    }
  }

  static async resumeQueue(queueName) {
    try {
      const queue = this.getQueueByName(queueName);
      await queue.resume();
      console.log(`Resumed ${queueName} queue`);
      return { success: true, message: `${queueName} queue resumed` };
    } catch (error) {
      console.error(`Error resuming ${queueName} queue:`, error);
      throw error;
    }
  }

  /**
   * Get queue by name
   */
  static getQueueByName(queueName) {
    switch (queueName.toLowerCase()) {
      case "email":
        return emailQueue;
      case "sms":
        return smsQueue;
      case "profile":
        return profileQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }
}
