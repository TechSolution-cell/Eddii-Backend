import * as Joi from 'joi';

export const envSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    PORT: Joi.number().default(4000),

    JWT_SECRET: Joi.string().min(16).required(),
    JWT_EXPIRES_IN: Joi.string().default('1d'),

    JWT_REFRESH_SECRET: Joi.string().min(16).required(),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
    JWT_REFRESH_EXPIRES_IN_REMEMBER: Joi.string().default('30d'),

    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().required(),
    DB_NAME: Joi.string().required(),
    DB_USER: Joi.string().required(),
    DB_PASS: Joi.string().allow('').required(),

    TWILIO_ACCOUNT_SID: Joi.string().required(),
    TWILIO_AUTH_TOKEN: Joi.string().required(),
    TWILIO_WEBHOOK_BASE_URL: Joi.string().uri().required(),

    AWS_REGION: Joi.string().required(),
    AWS_ACCESS_KEY_ID: Joi.string().required(),
    AWS_SECRET_ACCESS_KEY: Joi.string().required(),
    S3_BUCKET: Joi.string().required(),

    DEEPGRAM_API_KEY: Joi.string().required(),

    OPENAI_API_KEY: Joi.string().required(),

    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().default(6379),
    REDIS_USERNAME: Joi.string().required(),
    REDIS_PASSWORD: Joi.string().required(),
    BULL_PREFIX: Joi.string().required(),
    WORKER_CONCURRENCY: Joi.number().default(2)
});
