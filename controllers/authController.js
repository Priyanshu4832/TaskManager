import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import prisma from "../config/client.js";



// @desc     Register user
// @route    POST: /api/auth/register
// @acces    

export const registerUser = asyncHandler(async ( req , res ) =>{

    const {name , email , password} = req.body;

    if(!name || !email || !password){
        res.status(400);
        throw new Error("please enter all the fields!");
    }

    // check if the user already exists or not
    const exsistingUser = await prisma.user.findUnique({where : {email}});
    if(exsistingUser){
        res.status(400);
        throw new Error("user already exsist!");
    }

    // hash password
    const salt = await bcrypt.genSalt(10); // number of rounds
    const hashedPassword = await bcrypt.hash(password,salt);


    // creating user
    const newUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            }
        });

        // The user logs their own creation!
        await tx.activityLog.create({
            data: {
                userId: user.id, 
                action: 'USER_REGISTERED',
                details: `New user registered: ${user.name} (${user.email})`
            }
        });

        return user;
    });
    // JWT token generation 
    const token = jwt.sign(
        {id : newUser.id , role:newUser.role},
        process.env.JWT_SECRET,
        {expiresIn : '7d'}
    )

    
    res.status(201).json({
        message : 'user created ',
        user:{
            id:newUser.id,
            name :newUser.name,
            email:newUser.email,
            role:newUser.role,
        },
        token

    })
    
    
})

// @desc     login user
// @route    POST: /api/auth/login
// @acces    

export const loginUser = asyncHandler( async (req , res)=>{

    const {email , password} = req.body;

    if(!email || !password){
        res.status(400);
        throw new Error('Pleas enter all fields!')
    }

    const user = await prisma.user.findUnique({where :{email}});

    if(user && (await bcrypt.compare(password , user.password))){

        await prisma.activityLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN',
                details: `User logged in: ${user.name}`
            }
        });
        const token = jwt.sign(
            {id : user.id , role:user.role},
            process.env.JWT_SECRET,
            {expiresIn:'7d'}
        )
        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            token
        });
    }
    else{
        res.status(401);
        throw new Error("user does not exist or password is wrong!");
    }
})

// @desc     get user data
// @route    GET: /api/auth/me
// @acces    

export const getMe = asyncHandler(async (req , res)=>{
    
    res.status(200).json(req.user);
})