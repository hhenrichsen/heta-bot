import { Service } from 'typedi';
import Logger from 'bunyan';
import { BaseCodeProcessor, TurndownRule } from './base-processor';

@Service()
export class CodeBlockDirectProcessor extends BaseCodeProcessor {
    constructor(logger: Logger) {
        super(logger);
    }

    getRuleName(): string {
        return 'codeBlockDirect';
    }

    getRule(): TurndownRule {
        return {
            filter: (node: Node) => {
                const element = node as Element;
                const isDirectCodeBlock =
                    node.nodeName === 'PRE' &&
                    element.querySelector('code') === null;

                if (isDirectCodeBlock) {
                    this.logger.debug(
                        'Processing direct code block (pre only)',
                    );
                }

                return isDirectCodeBlock;
            },
            replacement: (content: string, node: Node) => {
                const element = node as Element;
                let code = element.innerHTML || '';

                // Convert HTML entities back to their characters
                code = code
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&nbsp;/g, ' ');

                // Remove any remaining HTML tags
                code = code.replace(/<[^>]*>/g, '');

                // Preserve the original whitespace and line breaks
                code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                // Try to detect language from class names
                const language = this.detectCodeLanguageFromPre(element);

                return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
            },
        };
    }

    private detectCodeLanguageFromPre(preElement: Element): string {
        // Check for Prism.js classes (language-*)
        const classList = Array.from(preElement.classList);
        const prismClass = classList.find((cls) => cls.startsWith('language-'));
        if (prismClass) {
            return prismClass.replace('language-', '');
        }

        // Check for highlight.js classes (hljs language-*)
        const hljsClass = classList.find(
            (cls) => cls.startsWith('hljs') && cls !== 'hljs',
        );
        if (hljsClass) {
            return hljsClass.replace('hljs-', '');
        }

        // Check for data-language attribute
        const dataLanguage = preElement.getAttribute('data-language');
        if (dataLanguage) {
            return dataLanguage;
        }

        // Check for common class patterns
        const commonClasses = [
            'javascript',
            'js',
            'typescript',
            'ts',
            'python',
            'py',
            'java',
            'cpp',
            'c',
            'csharp',
            'cs',
            'php',
            'ruby',
            'rb',
            'go',
            'rust',
            'swift',
            'kotlin',
            'scala',
            'html',
            'css',
            'sql',
            'bash',
            'shell',
            'powershell',
            'yaml',
            'json',
            'xml',
        ];

        for (const className of classList) {
            if (commonClasses.includes(className.toLowerCase())) {
                return className.toLowerCase();
            }
        }

        return 'text';
    }
}
