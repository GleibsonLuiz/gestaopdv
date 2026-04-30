import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { resetarSistema } from "../controllers/adminController.js";

const router = Router();

router.use(authRequired);
router.use(requireRole("ADMIN"));

router.post("/reset", resetarSistema);

export default router;
