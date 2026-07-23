import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notifyRouter from "./notify";
import matchRouter from "./match";
import settingsRouter from "./settings";
import aiDetectDirectionRouter from "./ai-detect-direction";
import authProxyRouter from "./auth-proxy";

const router: IRouter = Router();

router.use(authProxyRouter);
router.use(healthRouter);
router.use(notifyRouter);
router.use(matchRouter);
router.use(settingsRouter);
router.use(aiDetectDirectionRouter);

export default router;
