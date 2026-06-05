import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notifyRouter from "./notify";
import matchRouter from "./match";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notifyRouter);
router.use(matchRouter);
router.use(settingsRouter);

export default router;
