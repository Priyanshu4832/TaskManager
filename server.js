import express from 'express'
import colors from 'colors';
import { errorHandler } from './middlewares/errorMiddleware.js';
import authRoutes from './routes/authRoute.js';
import boardRoutes from './routes/boardRoute.js'
import ticketRoutes from './routes/ticketRoute.js'
import logRoutes from './routes/logRoute.js';
import dotenv from 'dotenv'
import redisClient from './config/redisClient.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;





//middleware
app.use(express.json());
app.use(express.urlencoded({extended : false}));

//routes
app.use('/api/auth' , authRoutes);
app.use('/api/boards',boardRoutes);
app.use('/api/tickets',ticketRoutes);
app.use('/api/logs',logRoutes);

//middleware
app.use(errorHandler)

app.listen(PORT , ()=>{console.log(`port is running at ${PORT}`.green.underline)});