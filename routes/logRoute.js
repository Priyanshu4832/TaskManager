import express from 'express'
import {getTicketLogs , getBoardLogs} from '../controllers/logController.js'
import {protect} from '../middlewares/authMiddleware.js'
import { checkCache } from '../middlewares/cacheMiddleware.js';

const router = express.Router();

router.get('/ticket/:ticketId',protect, checkCache('logs:ticket'),getTicketLogs)
router.get('/board/:boardId',protect,checkCache('logs:board'),getBoardLogs)

export default router;