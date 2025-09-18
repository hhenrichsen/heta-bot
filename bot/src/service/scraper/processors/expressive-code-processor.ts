import { Service } from 'typedi';
import Logger from 'bunyan';
import { BaseCodeProcessor, TurndownRule } from './base-processor';

@Service()
export class ExpressiveCodeProcessor extends BaseCodeProcessor {
    constructor(logger: Logger) {
        super(logger);
    }

    getRuleName(): string {
        return 'expressiveCode';
    }

    getRule(): TurndownRule {
        return {
            filter: (node: Node) => {
                const element = node as Element;
                const isExpressiveCode =
                    node.nodeName === 'DIV' &&
                    element.classList.contains('expressive-code') &&
                    element.querySelector('pre') !== null;

                if (isExpressiveCode) {
                    this.logger.debug('Processing expressive-code block');
                }

                return isExpressiveCode;
            },
            replacement: (content: string, node: Node) => {
                const element = node as Element;
                const pre = element.querySelector('pre');
                if (!pre) return content;

                // Get the language from data-language attribute
                const language = pre.getAttribute('data-language') || 'text';

                // Extract the code content by processing each .ec-line
                const codeLines: string[] = [];
                const ecLines = pre.querySelectorAll('.ec-line');

                if (ecLines.length > 0) {
                    ecLines.forEach((line) => {
                        const codeSpan = line.querySelector('.code');
                        if (codeSpan) {
                            // Get the text content and clean it up
                            let lineText = codeSpan.textContent || '';

                            // Remove any remaining HTML entities and clean up
                            lineText = lineText
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/&amp;/g, '&')
                                .replace(/&quot;/g, '"')
                                .replace(/&#39;/g, "'")
                                .replace(/&nbsp;/g, ' ');

                            codeLines.push(lineText);
                        } else {
                            // Preserve empty lines even if no .code span
                            codeLines.push('');
                        }
                    });
                } else {
                    // Fallback: try to get text from .code spans directly
                    const codeSpans = pre.querySelectorAll('.code');
                    codeSpans.forEach((span) => {
                        const lineText = span.textContent || '';
                        // Preserve empty lines by not checking for trim()
                        codeLines.push(lineText);
                    });
                }

                // If no lines found, fallback to all text content
                let code =
                    codeLines.length > 0
                        ? codeLines.join('\n')
                        : pre.textContent || '';

                // Clean up the final code
                code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

                return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
            },
        };
    }
}
