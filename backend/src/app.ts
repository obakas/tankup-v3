import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { devDeliveryRoutes } from "./routes/dev.delivery.routes.ts";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/dev", devDeliveryRoutes);

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "tankup-v3-backend",
  });
});