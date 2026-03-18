import prisma from '../config/client.js'
import asyncHandler from 'express-async-handler'
import redisClient from '../config/redisClient.js';
import { clearCache } from '../middlewares/cacheMiddleware.js';

// @desc     create ticket 
// @route    POST: /api/tickets
// @acces    private

export const createTicket = asyncHandler(async (req , res)=>{
    const {title , description , boardId}  = req.body;

    if(!title || !boardId){
        res.status(400)
        throw new Error("title and board id is needed for creating a ticket!")
    }

    // check if board exists or not
    const board = await prisma.board.findUnique({where:{id :boardId}})
    if(!board){
        res.status(404);
        throw new Error("Board not found");
    }


    // create ticket
    const result = await prisma.$transaction(async (tx)=>{
        const newTicket = await tx.ticket.create({
            data:{
                title:title,
                description:description,
                boardId: boardId  ,
                createdById : req.user.id,
            }
        })

        await tx.activityLog.create({
            data:{
                ticketId : newTicket.id,
                userId : req.user.id,
                action : 'TICKET_CREATED',
                details :`Created task :${newTicket.title}`
            }
        })

        return newTicket;
    })
    

    await clearCache(
        `tickets:board:${boardId}`, 
        `board:${boardId}`, 
        `logs:board:${boardId}`
    );
    res.status(201).json(result);
})


// @desc     update ticket status
// @route    POST: /api/tickets/:id/status
// @acces    private

const allowedTransitions = {
    'BACKLOG': ['TODO'],
    'TODO': ['IN_PROGRESS', 'BACKLOG'],
    'IN_PROGRESS': ['REVIEW', 'TODO'],
    'REVIEW': ['DONE', 'IN_PROGRESS'],
    'DONE': ['IN_PROGRESS']
};

export const updateTicket = asyncHandler(async (req , res)=>{
    const { id } = req.params;
    const { title , description , status , assigneeId } = req.body;


    const oldTicket = await prisma.ticket.findUnique({where:{id}});
    const boardId = oldTicket.boardId;

    if(!oldTicket){
        res.status(404);
        throw new Error("Ticket not found")
    }

    // check if status is allowed and not something like "this work done?"
    if(status){
        const validStatuses = Object.keys(allowedTransitions);
        if(!validStatuses.includes(status)){
            res.status(400);
            throw new Error(`Invalid status . Must be one of ${validStatuses.join(', ')}`)
        }
    }
    
    //check the status is valid and it was sent
    if(status && status!==oldTicket.status){
        const validNextStates = allowedTransitions[oldTicket.status] || [];
        if(!validNextStates.includes(status)){
            res.status(400);
            throw new Error(`State Machine Error: Cannot move ticket from ${oldTicket.status} to ${status}. Allowed: ${validNextStates.join(', ')}`);

        }
    }
    

    
    // the difference engine
    let changes = [];
    if (title && title !== oldTicket.title) changes.push(`Changed title to '${title}'`);
    if (description !== undefined && description !== oldTicket.description) changes.push(`Updated description`);
    if (status && status !== oldTicket.status) changes.push(`Moved from ${oldTicket.status} to ${status}`);
    if (assigneeId && assigneeId !== oldTicket.assigneeId) changes.push(`Reassigned ticket`);
    
    
    if(changes.length===0){
        return res.status(200).json(oldTicket);
    }

    const result = await prisma.$transaction(async (tx)=>{
        const updatedTicket = await tx.ticket.update({
            where:{ id },
            data:{
                title: title || oldTicket.title, 
                description: description !== undefined ? description : oldTicket.description, 
                status: status || oldTicket.status, 
                assigneeId: assigneeId || oldTicket.assigneeId
            }
        })

        const log = await tx.activityLog.create({
            data: {
                ticketId: id,
                userId: req.user.id,
                action: 'TICKET_UPDATED',
                details: changes.join(' | ') 
            }
        })
        return {updatedTicket , log}

    })
    
    await clearCache(
        `ticket:${id}`, 
        `tickets:board:${boardId}`, 
        `board:${boardId}`, 
        `logs:ticket:${id}`, 
        `logs:board:${boardId}`
    );
    res.status(200).json(result.updatedTicket);
})


// @desc    Delete a ticket
// @route   DELETE /api/tickets/:id
// @access  Private
export const deleteTicket = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({ where: { id } });

    if (!ticket) {
        res.status(404);
        throw new Error("Ticket not found");
    }

    if(req.user.role === 'DEVELOPER' && ticket.createdById !== req.user.id){
        res.status(403);
        throw new Error("Developers can only delete tickets they created");
    }

    await prisma.$transaction(async (tx)=>{
        await tx.activityLog.create({
            data: {
                ticketId: id,
                userId: req.user.id,
                action: 'TICKET_DELETED',
                details: `Deleted task: "${ticket.title}"`
            }
        })
        await tx.ticket.delete({ where: { id } });
    })


    const boardId = ticket.boardId;
    await clearCache(
        `ticket:${id}`, 
        `tickets:board:${boardId}`, 
        `board:${boardId}`, 
        `logs:ticket:${id}`, 
        `logs:board:${boardId}`
    );
    res.status(200).json({ message: "Ticket deleted successfully" });
});




// @desc    Get a single ticket with its activity logs
// @route   GET /api/tickets/:id
// @access  Private
export const getTicket = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: {
            assignee: {
                select: { id: true, name: true, email: true }
            },
            createdBy: {
                select: { id: true, name: true, email: true }
            },
            activityLogs: {
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { id: true, name: true }
                    }
                }
            }
        }
    });

    if (!ticket) {
        res.status(404);
        throw new Error("Ticket not found");
    }


    await redisClient.setEx(req.cacheKey , 3600 , JSON.stringify(ticket))
    res.status(200).json(ticket);
});

// @desc    Get all tickets for a board
// @route   GET /api/tickets/board/:boardId
// @access  Private
export const getTickets = asyncHandler(async (req, res) => {
    const { boardId } = req.params;

    // check the board exists
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
        res.status(404);
        throw new Error("Board not found");
    }

    // fetch all tickets belonging to this board
    const tickets = await prisma.ticket.findMany({
        where: { boardId },
        orderBy: { createdAt: 'desc' },
        include: {
            assignee: {
                select: { id: true, name: true, email: true }
            },
            createdBy: {
                select: { id: true, name: true, email: true }
            }
        }
    });

    await redisClient.setEx(req.cacheKey , 3600 , JSON.stringify(tickets))
    res.status(200).json(tickets);
});
