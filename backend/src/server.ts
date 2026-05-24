import "dotenv/config";
import { app } from "./app.js";
import { startAssignmentWorker } from "./modules/assignment/assignment.worker.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`TankUp V3 backend running on port ${PORT}`);
  startAssignmentWorker();
});
