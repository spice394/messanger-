import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import callsRouter from "./calls";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/conversations", conversationsRouter);
router.use("/conversations/:conversationId/messages", messagesRouter);
router.use("/calls", callsRouter);
router.use(storageRouter);

export default router;
