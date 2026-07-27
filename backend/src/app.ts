import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { businessProfileRouter } from "./routes/businessProfile.routes";
import { aiRouter } from "./routes/ai.routes";
import { expenseCategoryRouter } from "./routes/expenseCategory.routes";
import { expenseRecordRouter } from "./routes/expenseRecord.routes";
import { salesRecordRouter } from "./routes/salesRecord.routes";
import { recordsRouter } from "./routes/records.routes";
import { receiptRouter } from "./routes/receipt.routes";
import { csvImportRouter } from "./routes/csvImport.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { notificationRouter } from "./routes/notification.routes";
import { insightsRouter } from "./routes/insights.routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/business-profiles", businessProfileRouter);
app.use("/api/v1/ai", aiRouter);
app.use("/api/v1/records/categories", expenseCategoryRouter);
app.use("/api/v1/records/expenses", expenseRecordRouter);
app.use("/api/v1/records/sales", salesRecordRouter);
app.use("/api/v1/records/receipts", receiptRouter);
app.use("/api/v1/records/csv-imports", csvImportRouter);
app.use("/api/v1/records", recordsRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/insights", insightsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
