import { CronJob } from "cron";

import { backup } from "./backup";
import { env } from "./env";

const runner = async () => {
  try {
    await backup();
  } catch (error) {
    console.error("Error while running backup: ", error);
  }
};
const job = new CronJob(env.BACKUP_CRON_SCHEDULE, runner);

job.start();

console.log("Backup cron scheduled...");

void runner();
