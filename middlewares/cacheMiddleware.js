import asyncHandler from 'express-async-handler'
import redisClient from '../config/redisClient.js'



export const checkCache = (keyPrefix) => asyncHandler(async (req , res , next)=>{


    let cacheKey = '';

    // build all the keys based on endpoint hitting
    
    if(keyPrefix==='boards'){
        cacheKey = `boards:${req.user.id}`;
    }
    else if(keyPrefix==='board'){
        cacheKey = `board:${req.params.id}`;
    }
    else if(keyPrefix==='ticket'){
        cacheKey = `ticket:${req.params.id}`;
    }
    else if(keyPrefix==='tickets:board'){
        cacheKey = `tickets:board:${req.params.boardId}`;
    }
    else if(keyPrefix==='logs:board'){
        cacheKey = `logs:board:${req.params.boardId}`;
    }
    else if(keyPrefix==='logs:ticket'){
        cacheKey = `logs:ticket:${req.params.ticketId}`;
    }
    

    req.cacheKey = cacheKey;

    const cachedData = await redisClient.get(cacheKey);

    if(cachedData){
        console.log("cache hit!  Serving from Redis")
        return res.status(200).json(JSON.parse(cachedData));
    }

    console.log("cache MISS! Fetching from postgres")
    next();
})


export const clearCache = async (...keys) =>{
    for(const key of keys){
        try {
            if(key) await redisClient.del(key);
        } catch(err) {
            console.error(`Cache clear failed for key ${key}:`, err);
        }
    }
}