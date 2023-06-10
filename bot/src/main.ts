// Set up reflection
import 'reflect-metadata';

// Load environment
import { config as loadEnv } from 'dotenv';
loadEnv();

import Container from 'typedi';
import { BotInitializer } from './botinitializer';
import Logger, { createLogger } from 'bunyan';

Container.set(
    Logger,
    createLogger({
        name: 'bot',
        stream: process.stdout,
        level:
            process.env['NODE_ENV']?.toLowerCase() != 'production'
                ? 'debug'
                : 'info',
    })
);

Container.get(BotInitializer).init();
