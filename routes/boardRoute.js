import express from 'express'
import { createBoard , getBoards ,getBoard , deleteBoard , updateBoard} from '../controllers/boardController.js';
import {protect,authorize} from '../middlewares/authMiddleware.js';
import {checkCache} from '../middlewares/cacheMiddleware.js'
const router = express.Router();

router.get('/',protect,checkCache('boards'),getBoards)
router.get('/:id',protect , checkCache('board'),getBoard);

router.post('/',protect,authorize('ADMIN','MANAGER'),createBoard);

router.put('/' , protect , authorize('ADMIN','MANAGER') ,updateBoard );

router.delete('/:id',protect ,authorize('ADMIN'), deleteBoard);

export default router;