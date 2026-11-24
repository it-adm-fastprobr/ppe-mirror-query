import { Router } from "express";

import { getPaymentTapListController } from "../controllers/paymentTapListController";
import { apiKeyAuth } from "../middleware/apiKeyAuth";

const paymentTapListRoutes = Router();

paymentTapListRoutes.get("/", apiKeyAuth, getPaymentTapListController);

export default paymentTapListRoutes;
