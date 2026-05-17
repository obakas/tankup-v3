import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

declare module "express";

export const app = express();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`TankUp V3 backend running on port ${PORT}`);
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "tankup-v3-backend",
  });
});