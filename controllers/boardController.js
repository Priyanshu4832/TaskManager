import asyncHandler from 'express-async-handler'
import prisma from '../config/client.js';
import redisClient from '../config/redisClient.js';
import { clearCache } from '../middlewares/cacheMiddleware.js';

// @desc     create board 
// @route    POST: /api/boards
// @acces    private

export const createBoard = asyncHandler(async (req , res)=>{

    const {name , description} = req.body;

    // check if theres name for creating board
    if(!name){
        res.status(400)
        throw new Error("Name is needed for creating a board!")
    }

    const result = await prisma.$transaction( async (tx)=>{

        // create board
        const newBoard = await tx.board.create({
            data:{
                name : name,
                description : description,
                ownerId: req.user.id
            }
        })

        // create activity log
        await tx.activityLog.create({
            data:{
                boardId : newBoard.id,
                userId : req.user.id,
                action : 'BOARD_CREATED',
                details :`Created project board: ${newBoard.name}`
            }
        })

        return newBoard;
    })

    
    //Cache Invalidation : Wipe out the old data hehe
    await clearCache(`boards:${req.user.id}`);
    

    res.status(201).json(result);

})



// @desc    Delete a board
// @route   DELETE /api/boards/:id
// @access  Private
export const deleteBoard = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const board = await prisma.board.findUnique({ where: { id } });

    if (!board) {
        res.status(404);
        throw new Error("Board not found");
    }

    // Only the owner can delete it
    if (board.ownerId !== req.user.id && req.user.role!=='ADMIN') {
        res.status(403);
        throw new Error("Not authorized to delete this board");
    }

    await prisma.$transaction( async (tx)=>{

        await tx.activityLog.create({
            data:{
                boardId : id,
                userId : req.user.id,
                action : 'BOARD_DELETED',
                details :`Deleted project board: ${board.name}`
            }
        })
        await tx.ticket.deleteMany({where:{boardId:id}});
        await tx.board.delete({where :{ id }});
    })
    
    //Cache Invalidation : Wipe out the old data hehe
    await clearCache(`boards:${req.user.id}` ,`board:${id}` , `logs:board:${id}`);

    res.status(200).json({ message: "Board and all its tickets, deleted successfully" });
});


// @desc     update board 
// @route    PUT: /api/boards/:Id
// @acces    private

export const updateBoard = asyncHandler(async (req,res)=>{

    const {id} = req.params;
    const { name , description} = req.body;


    const oldBoard = await prisma.board.findUnique({where:{ id }})

    if(!oldBoard){
        res.status(404);
        throw new Error("Board not found")
    }

    // only owner or ADMIN can update board

    if(oldBoard.ownerId!==req.user.id && req.user.role !== 'ADMIN'){
        res.status(403);
        throw new Error("Access Denied: You do not have permission to edit this board.");
    }

    let changes = [];

    if(name && name!==oldBoard.name) changes.push(`changes name to ${name}`);
    if(description && description!==oldBoard.description) changes.push(`Description changed to ${description}`);

    if(changes.length==0){
        return res.status(200).json(oldBoard);
    }

    const result = await prisma.$transaction( async (tx)=>{
        const updatedBoard = await tx.board.update({
            where:{id},
            data:{
                name : name || oldBoard.name,
                description : description!==undefined? description : oldBoard.description
            }
        })

        const log = await tx.activityLog.create({
            data:{
                boardId : id,
                userId : req.user.id,
                action : 'BOARD_UPDATED',
                details : changes.join(' | ')
            }
        })
        return {updatedBoard,log};
    })

    await clearCache(
        `board:${id}`,
        `boards:${req.user.id}`,
        `logs:board:${id}`
    )
    res.status(200).json(result.updatedBoard);

})

// @desc     get board 
// @route    GET: /api/boards
// @acces    private
export const getBoards = asyncHandler(async (req,res)=>{

    // boards where I'm the owner OR boards where at least one ticket is assigned to me.
    const boards = await prisma.board.findMany({
        where: {
            OR: [
                { ownerId: req.user.id },
                { tickets: { some: { assigneeId: req.user.id } } }
            ]
        }
    });

    // Added caching 
    await redisClient.setEx(req.cacheKey , 3600 , JSON.stringify(boards));


    res.status(200).json(boards);

})


// @desc     get single boards and its tickets
// @route    GET: /api/boards/:id
// @acces    private

export const getBoard = asyncHandler(async (req,res)=>{
    const { id } = req.params;

    const board = await prisma.board.findUnique({
        where:{id:id},
        include: {
            tickets: {
                include: {
                    assignee: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } }
                }
            }
        }
    })

    if(!board){
        res.status(404);
        throw new Error("NO board found");
    }

    // you can acces this if you are the owner
    if(board.ownerId!==req.user.id && req.user.role !== 'ADMIN' ){
        res.status(403);
        throw new Error("Not auhtorised to get board")
    }

    // Added caching 
    await redisClient.setEx(req.cacheKey , 3600 , JSON.stringify(board));


    res.status(200).json(board);
})