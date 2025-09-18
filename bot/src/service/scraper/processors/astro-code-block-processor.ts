import { Service } from 'typedi';
import Logger from 'bunyan';
import { BaseCodeProcessor, TurndownRule } from './base-processor';

@Service()
export class AstroCodeBlockProcessor extends BaseCodeProcessor {
    constructor(logger: Logger) {
        super(logger);
    }

    getRuleName(): string {
        return 'astroCodeBlock';
    }

    getRule(): TurndownRule {
        return {
            filter: (node: Node) => {
                const element = node as Element;
                const isAstroCodeBlock =
                    node.nodeName === 'PRE' &&
                    element.classList.contains('astro-code') &&
                    element.querySelector('code') !== null;

                if (isAstroCodeBlock) {
                    this.logger.debug('Processing Astro code block');
                }

                return isAstroCodeBlock;
            },
            replacement: (content: string, node: Node) => {
                const element = node as Element;
                const codeElement = element.querySelector('code');
                if (!codeElement) return content;

                // Get language from data-language attribute or class
                const language =
                    element.getAttribute('data-language') ||
                    Array.from(element.classList)
                        .find((cls) => cls.startsWith('language-'))
                        ?.replace('language-', '') ||
                    'text';

                // Extract code by processing .line spans
                const codeLines: string[] = [];
                const lines = codeElement.querySelectorAll('.line');

                if (lines && lines.length > 0) {
                    // Convert NodeList to Array to ensure forEach works
                    const linesArray = Array.from(lines);
                    linesArray.forEach((line) => {
                        // Get all text content from the line, preserving HTML entities
                        let lineText = line.innerHTML || '';

                        // Decode HTML entities
                        lineText = lineText
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'")
                            .replace(/&nbsp;/g, ' ');

                        // Remove only styling/color spans, preserve actual HTML tags
                        // Remove spans with style attributes and class attributes for styling
                        lineText = lineText
                            .replace(/<span[^>]*style="[^"]*"[^>]*>/g, '')
                            .replace(/<span[^>]*class="[^"]*"[^>]*>/g, '')
                            .replace(/<\/span>/g, '');

                        codeLines.push(lineText);
                    });
                } else {
                    // Fallback to regular text content
                    let code = codeElement.textContent || '';
                    code = code
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/&nbsp;/g, ' ');
                    codeLines.push(code);
                }

                const code = codeLines
                    .join('\n')
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n');
                return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
            },
        };
    }
}
