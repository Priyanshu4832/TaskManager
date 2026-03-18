import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken'
import prisma from '../config/client.js'

export const protect = asyncHandler (async (req , res , next)=>{

    let token;

    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
        try{

            token = req.headers.authorization.split(" ")[1];

            //verify token using my secret key
            const decoded = jwt.verify(token,process.env.JWT_SECRET);

            // fetch user
            req.user = await prisma.user.findUnique({
                where : {id:decoded.id},
                select:{
                    id:true,
                    name:true,
                    email:true,
                    role:true 
                }
            })

            // token exisits after 7 days but user doesn't
            if(!req.user){
                req.status(401);
                throw new Error("user does not exist");
            }
            next();
        }
        catch(error){
            res.status(401);
            throw new Error("Not authorized, token failed or expired");
        }
    }

    if(!token){
        res.status(401);
        throw new Error(" NOT authorized , no token")
    }
})

export const authorize = (...roles)=>{
    return (req,res,next)=>{

        if(!roles.includes(req.user.role)){
            res.status(403);
            throw new Error(`Your role ${req.user.role} is not authorized! to do this`)
        }
        next();
    }
}