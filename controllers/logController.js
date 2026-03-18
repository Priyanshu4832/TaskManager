import asyncHandler from 'express-async-handler'
import prisma from '../config/client.js'
import redisClient from '../config/redisClient.js';


// @desc  Get all the activity logs of ticket
// @route GET /api/logs/ticket/:ticketId
// @acces Private
export const getTicketLogs = asyncHandler(async (req , res)=>{
    const {ticketId} = req.params;

    const ticket = await prisma.getTicketLogs.findUnique({where :{id:ticketId}});
    if(!ticket){
        res.status(404);
        throw new Error("Ticket not Found");
    }
  

    const logs = await prisma.activityLog.findMany({
        where : { ticketId},
        orderBy : { createdAt : 'desc'},
        include:{
            user : {
                select : {
                    name : true ,
                    email:true
                }
            }
        }
    })

    // Added caching 
    await redisClient.setEx(req.cacheKey , 3600 , JSON.stringify(logs));

    res.status(200).json(logs);
})


// @desc    Get all activity logs for an entire board
// @route   GET /api/logs/board/:boardId
// @access  Private
export const getBoardLogs = asyncHandler(async (req, res) => {
    const { boardId } = req.params;

    const board = await prisma.board.findUnique({where :{id:boardId}});
    if(!board){
        res.status(404);
        throw new Error("Board not Found");
    }
    const logs = await prisma.activityLog.findMany({
        where: { boardId },
        orderBy: { createdAt: 'desc' }, 
        include: {
            user: { select: { name: true, email: true } }
        }
    });

    // Added caching 
    await redisClient.setEx(req.cacheKey , 3600 , JSON.stringify(logs));

    res.status(200).json(logs);
});