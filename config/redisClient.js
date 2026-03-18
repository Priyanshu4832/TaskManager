import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config(); // Ensures it can read the .env file

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis connected successfully!'.red.underline));

// Connect immediately, but DO NOT disconnect!
await redisClient.connect();

export default redisClient;