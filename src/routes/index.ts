import { Router } from "express";

import paymentListRoutes from "./paymentListRoutes";
import paymentTapListRoutes from "./paymentTapListRoutes";

const router = Router();

router.use("/payment-list", paymentListRoutes);
router.use("/payment-tap-list", paymentTapListRoutes);

export default router;
