import { Token } from 'typedi';
import { EntitySchema } from 'typeorm';

/* eslint-disable @typescript-eslint/no-unsafe-function-type*/
export const EntityToken = new Token<string | Function | EntitySchema<unknown>>(
    'entities',
);
