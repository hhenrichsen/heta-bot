import { Service } from 'typedi';
import Logger from 'bunyan';

export interface TurndownRule {
    filter: (node: Node) => boolean;
    replacement: (content: string, node: Node) => string;
}

export abstract class BaseCodeProcessor {
    constructor(protected readonly logger: Logger) {}

    abstract getRule(): TurndownRule;
    abstract getRuleName(): string;
}
