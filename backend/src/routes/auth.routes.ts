import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadPhoto } from "../middleware/upload.middleware";
import { asyncHandler } from "../lib/asyncHandler";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(authController.register));
authRouter.post("/login", asyncHandler(authController.login));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.post("/recover-password", asyncHandler(authController.recoverPassword));
authRouter.post("/change-password", requireAuth, asyncHandler(authController.changePassword));
authRouter.get("/me", requireAuth, asyncHandler(authController.getMe));
authRouter.patch("/me", requireAuth, asyncHandler(authController.updateMe));
authRouter.post("/me/avatar", requireAuth, uploadPhoto.single("file"), asyncHandler(authController.uploadAvatar));
