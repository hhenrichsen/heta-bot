import { Service } from 'typedi';
import Logger from 'bunyan';
import { BaseCodeProcessor, TurndownRule } from './base-processor';

@Service()
export class PrismCodeBlockProcessor extends BaseCodeProcessor {
    constructor(logger: Logger) {
        super(logger);
    }

    getRuleName(): string {
        return 'prismCodeBlock';
    }

    getRule(): TurndownRule {
        return {
            filter: (node: Node) => {
                const element = node as Element;
                const isPrismCodeBlock =
                    node.nodeName === 'DIV' &&
                    element.classList.contains('codeBlockContainer_ZGJx') &&
                    element.querySelector('pre.prism-code') !== null &&
                    // Only process if it's a direct code block container, not nested
                    !element.parentElement?.classList.contains(
                        'codeBlockContainer_ZGJx',
                    );

                if (isPrismCodeBlock) {
                    this.logger.debug('Processing Prism code block');
                }

                return isPrismCodeBlock;
            },
            replacement: (content: string, node: Node) => {
                const element = node as Element;
                const pre = element.querySelector('pre');
                if (!pre) return content;

                // Get the language from the class name (check both container and pre)
                let languageClass = Array.from(element.classList).find((cls) =>
                    cls.startsWith('language-'),
                );

                if (!languageClass) {
                    const preClasses = Array.from(pre.classList);
                    languageClass = preClasses.find((cls) =>
                        cls.startsWith('language-'),
                    );
                }

                const language = languageClass
                    ? languageClass.replace('language-', '')
                    : 'javascript';

                // Extract the code content by processing each .token-line
                const codeLines: string[] = [];
                const tokenLines = pre.querySelectorAll('.token-line');

                if (tokenLines.length > 0) {
                    tokenLines.forEach((line) => {
                        // Get all text content from the line, ignoring token classes
                        const lineText = line.textContent || '';
                        // Preserve empty lines by not checking for trim()
                        codeLines.push(lineText);
                    });
                } else {
                    // Fallback: get all text content from the pre element
                    const codeElement = pre.querySelector('code');
                    if (codeElement) {
                        const allText = codeElement.textContent || '';
                        const lines = allText.split('\n');
                        lines.forEach((line) => {
                            // Preserve empty lines by not checking for trim()
                            codeLines.push(line);
                        });
                    }
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
