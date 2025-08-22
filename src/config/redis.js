/**
 * Redis Configuration for Caching and Sessions
 * Speichern als: backend/src/config/redis.js
 */

const redis = require('redis');
const logger = require('../utils/logger');

// Redis Client Configuration
const redisConfig = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                logger.error('Redis: Max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
            }
            const delay = Math.min(retries * 100, 3000);
            logger.info(`Redis: Reconnecting in ${delay}ms...`);
            return delay;
        }
    },
    legacyMode: false
};

// Create Redis Client
const redisClient = redis.createClient(redisConfig);

// Error Handling
redisClient.on('error', (err) => {
    logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
    logger.info('Redis Client Connected');
});

redisClient.on('ready', () => {
    logger.info('Redis Client Ready');
});

redisClient.on('reconnecting', () => {
    logger.warn('Redis Client Reconnecting...');
});

// Connect to Redis
const connectRedis = async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
        return true;
    } catch (error) {
        logger.error('Failed to connect to Redis:', error);
        // App kann ohne Redis laufen, aber mit eingeschränkter Funktionalität
        return false;
    }
};

// Cache Helper Functions
const cache = {
    // Get cached data
    get: async (key) => {
        try {
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`Redis GET error for key ${key}:`, error);
            return null;
        }
    },

    // Set cache with expiration (default 1 hour)
    set: async (key, value, expireInSeconds = 3600) => {
        try {
            const serialized = JSON.stringify(value);
            await redisClient.setEx(key, expireInSeconds, serialized);
            return true;
        } catch (error) {
            logger.error(`Redis SET error for key ${key}:`, error);
            return false;
        }
    },

    // Delete cached data
    del: async (key) => {
        try {
            await redisClient.del(key);
            return true;
        } catch (error) {
            logger.error(`Redis DEL error for key ${key}:`, error);
            return false;
        }
    },

    // Delete multiple keys by pattern
    delPattern: async (pattern) => {
        try {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
            return true;
        } catch (error) {
            logger.error(`Redis DEL pattern error for ${pattern}:`, error);
            return false;
        }
    },

    // Check if key exists
    exists: async (key) => {
        try {
            return await redisClient.exists(key);
        } catch (error) {
            logger.error(`Redis EXISTS error for key ${key}:`, error);
            return false;
        }
    },

    // Get TTL for a key
    ttl: async (key) => {
        try {
            return await redisClient.ttl(key);
        } catch (error) {
            logger.error(`Redis TTL error for key ${key}:`, error);
            return -1;
        }
    },

    // Invalidate all cache for a restaurant
    invalidateRestaurant: async (restaurantId) => {
        try {
            const patterns = [
                `restaurant:${restaurantId}:*`,
                `tables:${restaurantId}:*`,
                `qrcodes:${restaurantId}:*`,
                `analytics:${restaurantId}:*`
            ];
            
            for (const pattern of patterns) {
                await cache.delPattern(pattern);
            }
            
            logger.info(`Cache invalidated for restaurant ${restaurantId}`);
            return true;
        } catch (error) {
            logger.error(`Failed to invalidate restaurant cache:`, error);
            return false;
        }
    },

    // Clear all cache
    flush: async () => {
        try {
            await redisClient.flushAll();
            logger.info('All cache cleared');
            return true;
        } catch (error) {
            logger.error('Failed to flush cache:', error);
            return false;
        }
    }
};

// Session Store
const sessionStore = {
    // Save session
    save: async (sessionId, data, expireInSeconds = 86400) => { // 24 hours default
        try {
            const key = `session:${sessionId}`;
            await redisClient.setEx(key, expireInSeconds, JSON.stringify(data));
            return true;
        } catch (error) {
            logger.error('Session save error:', error);
            return false;
        }
    },

    // Get session
    get: async (sessionId) => {
        try {
            const key = `session:${sessionId}`;
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Session get error:', error);
            return null;
        }
    },

    // Update session expiration
    touch: async (sessionId, expireInSeconds = 86400) => {
        try {
            const key = `session:${sessionId}`;
            await redisClient.expire(key, expireInSeconds);
            return true;
        } catch (error) {
            logger.error('Session touch error:', error);
            return false;
        }
    },

    // Delete session
    destroy: async (sessionId) => {
        try {
            const key = `session:${sessionId}`;
            await redisClient.del(key);
            return true;
        } catch (error) {
            logger.error('Session destroy error:', error);
            return false;
        }
    },

    // Get all active sessions for a user
    getUserSessions: async (userId) => {
        try {
            const pattern = `session:user:${userId}:*`;
            const keys = await redisClient.keys(pattern);
            const sessions = [];
            
            for (const key of keys) {
                const data = await redisClient.get(key);
                if (data) {
                    sessions.push(JSON.parse(data));
                }
            }
            
            return sessions;
        } catch (error) {
            logger.error('Get user sessions error:', error);
            return [];
        }
    }
};

// Rate Limiting Store
const rateLimitStore = {
    // Increment counter for rate limiting
    increment: async (key, windowInSeconds = 60) => {
        try {
            const fullKey = `ratelimit:${key}`;
            const current = await redisClient.incr(fullKey);
            
            if (current === 1) {
                await redisClient.expire(fullKey, windowInSeconds);
            }
            
            return current;
        } catch (error) {
            logger.error('Rate limit increment error:', error);
            return 0;
        }
    },

    // Get current count
    getCount: async (key) => {
        try {
            const fullKey = `ratelimit:${key}`;
            const count = await redisClient.get(fullKey);
            return count ? parseInt(count) : 0;
        } catch (error) {
            logger.error('Rate limit get count error:', error);
            return 0;
        }
    },

    // Reset rate limit
    reset: async (key) => {
        try {
            const fullKey = `ratelimit:${key}`;
            await redisClient.del(fullKey);
            return true;
        } catch (error) {
            logger.error('Rate limit reset error:', error);
            return false;
        }
    }
};

// Queue for background jobs (simple implementation)
const queue = {
    // Add job to queue
    push: async (queueName, job) => {
        try {
            const key = `queue:${queueName}`;
            await redisClient.rPush(key, JSON.stringify(job));
            return true;
        } catch (error) {
            logger.error(`Queue push error for ${queueName}:`, error);
            return false;
        }
    },

    // Get job from queue
    pop: async (queueName) => {
        try {
            const key = `queue:${queueName}`;
            const job = await redisClient.lPop(key);
            return job ? JSON.parse(job) : null;
        } catch (error) {
            logger.error(`Queue pop error for ${queueName}:`, error);
            return null;
        }
    },

    // Get queue length
    length: async (queueName) => {
        try {
            const key = `queue:${queueName}`;
            return await redisClient.lLen(key);
        } catch (error) {
            logger.error(`Queue length error for ${queueName}:`, error);
            return 0;
        }
    }
};

// Analytics Counter
const analytics = {
    // Increment counter
    increment: async (metric, value = 1) => {
        try {
            const key = `analytics:${metric}`;
            await redisClient.incrBy(key, value);
            return true;
        } catch (error) {
            logger.error(`Analytics increment error for ${metric}:`, error);
            return false;
        }
    },

    // Get counter value
    get: async (metric) => {
        try {
            const key = `analytics:${metric}`;
            const value = await redisClient.get(key);
            return value ? parseInt(value) : 0;
        } catch (error) {
            logger.error(`Analytics get error for ${metric}:`, error);
            return 0;
        }
    },

    // Record daily metric
    recordDaily: async (metric, value = 1) => {
        try {
            const date = new Date().toISOString().split('T')[0];
            const key = `analytics:daily:${metric}:${date}`;
            await redisClient.incrBy(key, value);
            await redisClient.expire(key, 2592000); // 30 days
            return true;
        } catch (error) {
            logger.error(`Analytics daily record error:`, error);
            return false;
        }
    }
};

// Lock mechanism for distributed systems
const lock = {
    // Acquire lock
    acquire: async (resource, ttlSeconds = 10) => {
        try {
            const key = `lock:${resource}`;
            const token = Math.random().toString(36).substring(7);
            const result = await redisClient.setNX(key, token);
            
            if (result) {
                await redisClient.expire(key, ttlSeconds);
                return token;
            }
            
            return null;
        } catch (error) {
            logger.error(`Lock acquire error for ${resource}:`, error);
            return null;
        }
    },

    // Release lock
    release: async (resource, token) => {
        try {
            const key = `lock:${resource}`;
            const currentToken = await redisClient.get(key);
            
            if (currentToken === token) {
                await redisClient.del(key);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`Lock release error for ${resource}:`, error);
            return false;
        }
    }
};

module.exports = {
    redisClient,
    connectRedis,
    cache,
    sessionStore,
    rateLimitStore,
    queue,
    analytics,
    lock
};