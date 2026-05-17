import { pathToFileURL } from "node:url";
import { formatOperatorQueueDoctorReport } from "./operator-runner.js";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(formatOperatorQueueDoctorReport());
}
