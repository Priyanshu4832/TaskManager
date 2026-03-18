import express from 'express'
import { createTicket , updateTicket , deleteTicket , getTicket , getTickets} from '../controllers/ticketController.js';
import {protect,authorize} from '../middlewares/authMiddleware.js';
import { checkCache } from '../middlewares/cacheMiddleware.js';

const router = express.Router();


router.get('/board/:boardId', protect, checkCache('tickets:board'),getTickets);    
router.get('/:id', protect,checkCache('ticket'), getTicket);                  

router.post('/',protect,authorize('ADMIN','MANAGER','DEVELOPER'),createTicket);
router.put('/:id',protect,authorize('ADMIN','MANAGER','DEVELOPER'),updateTicket);
router.delete('/:id', protect, authorize('ADMIN','MANAGER','DEVELOPER'),deleteTicket);

export default router;