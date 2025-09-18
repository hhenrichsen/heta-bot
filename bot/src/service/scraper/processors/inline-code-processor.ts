import { Service } from 'typedi';
import Logger from 'bunyan';
import { BaseCodeProcessor, TurndownRule } from './base-processor';

@Service()
export class InlineCodeProcessor extends BaseCodeProcessor {
    constructor(logger: Logger) {
        super(logger);
    }

    getRuleName(): string {
        return 'inlineCode';
    }

    getRule(): TurndownRule {
        return {
            filter: (node: Node) => {
                return (
                    node.nodeName === 'CODE' &&
                    (node as Element).parentElement?.nodeName !== 'PRE'
                );
            },
            replacement: (content: string) => {
                return `\`${content}\``;
            },
        };
    }
}
