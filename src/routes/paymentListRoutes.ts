import { Router } from "express";

import { getPaymentListController } from "../controllers/paymentListController";
import { apiKeyAuth } from "../middleware/apiKeyAuth";

const paymentListRoutes = Router();

paymentListRoutes.get("/", apiKeyAuth, getPaymentListController);

export default paymentListRoutes;
