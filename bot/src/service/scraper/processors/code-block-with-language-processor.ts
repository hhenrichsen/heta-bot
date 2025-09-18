import { Service } from 'typedi';
import Logger from 'bunyan';
import { BaseCodeProcessor, TurndownRule } from './base-processor';

@Service()
export class CodeBlockWithLanguageProcessor extends BaseCodeProcessor {
    constructor(logger: Logger) {
        super(logger);
    }

    getRuleName(): string {
        return 'codeBlockWithLanguage';
    }

    getRule(): TurndownRule {
        return {
            filter: (node: Node) => {
                const element = node as Element;
                const isCodeBlock =
                    node.nodeName === 'PRE' &&
                    element.querySelector('code') !== null;

                if (isCodeBlock) {
                    this.logger.debug(
                        'Processing code block with language detection',
                    );
                }

                return isCodeBlock;
            },
            replacement: (content: string, node: Node) => {
                const element = node as Element;
                const codeElement = element.querySelector('code');
                if (!codeElement) return content;

                const language = this.detectCodeLanguage(codeElement);

                // Use innerHTML to preserve formatting, then convert HTML entities
                let code = codeElement.innerHTML || '';

                // Convert HTML entities back to their characters
                code = code
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&nbsp;/g, ' ');

                // Remove any remaining HTML tags that might have been preserved
                code = code.replace(/<[^>]*>/g, '');

                // Preserve the original whitespace and line breaks
                code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
            },
        };
    }

    private detectCodeLanguage(codeElement: Element): string {
        // Check for Prism.js classes (language-*)
        const classList = Array.from(codeElement.classList);
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
        const dataLanguage = codeElement.getAttribute('data-language');
        if (dataLanguage) {
            return dataLanguage;
        }

        // Check for data-lang attribute
        const dataLang = codeElement.getAttribute('data-lang');
        if (dataLang) {
            return dataLang;
        }

        // Check for class patterns like 'brush: language'
        const brushClass = classList.find((cls) => cls.startsWith('brush:'));
        if (brushClass) {
            return brushClass.replace('brush:', '').trim();
        }

        // Check for syntax-* classes
        const syntaxClass = classList.find((cls) => cls.startsWith('syntax-'));
        if (syntaxClass) {
            return syntaxClass.replace('syntax-', '');
        }

        // Check parent pre element for language classes
        const preElement = codeElement.closest('pre');
        if (preElement) {
            const preClasses = Array.from(preElement.classList);
            const prePrismClass = preClasses.find((cls) =>
                cls.startsWith('language-'),
            );
            if (prePrismClass) {
                return prePrismClass.replace('language-', '');
            }

            const preHljsClass = preClasses.find(
                (cls) => cls.startsWith('hljs') && cls !== 'hljs',
            );
            if (preHljsClass) {
                return preHljsClass.replace('hljs-', '');
            }

            const preDataLanguage = preElement.getAttribute('data-language');
            if (preDataLanguage) {
                return preDataLanguage;
            }
        }

        // Try to detect language from content patterns
        const content = codeElement.textContent || '';
        const detectedLanguage = this.detectLanguageFromContent(content);
        if (detectedLanguage) {
            return detectedLanguage;
        }

        return ''; // No language detected
    }

    private detectLanguageFromContent(content: string): string | null {
        const trimmedContent = content.trim();

        // Common patterns for different languages
        const patterns = [
            { pattern: /^#!\/bin\/(bash|sh)/, language: 'bash' },
            {
                pattern: /^#!\/usr\/bin\/env\s+(python|python3)/,
                language: 'python',
            },
            { pattern: /^#!\/usr\/bin\/env\s+node/, language: 'javascript' },
            { pattern: /^import\s+.*from\s+['"]/, language: 'javascript' },
            { pattern: /^const\s+\w+\s*=\s*\(/, language: 'javascript' },
            { pattern: /^function\s+\w+\s*\(/, language: 'javascript' },
            { pattern: /^class\s+\w+/, language: 'javascript' },
            { pattern: /^def\s+\w+\s*\(/, language: 'python' },
            { pattern: /^import\s+\w+/, language: 'python' },
            { pattern: /^from\s+\w+\s+import/, language: 'python' },
            { pattern: /^#include\s*<.*>/, language: 'cpp' },
            { pattern: /^#include\s*".*"/, language: 'cpp' },
            { pattern: /^using\s+namespace\s+std;/, language: 'cpp' },
            { pattern: /^public\s+class\s+\w+/, language: 'java' },
            { pattern: /^package\s+\w+;/, language: 'java' },
            { pattern: /^import\s+java\./, language: 'java' },
            { pattern: /^<\?php/, language: 'php' },
            { pattern: /^<\?=/, language: 'php' },
            { pattern: /^<!DOCTYPE\s+html/, language: 'html' },
            { pattern: /^<html[^>]*>/, language: 'html' },
            { pattern: /^<div[^>]*>/, language: 'html' },
            { pattern: /^body\s*{/, language: 'css' },
            { pattern: /^\.\w+\s*{/, language: 'css' },
            { pattern: /^SELECT\s+.*FROM/i, language: 'sql' },
            { pattern: /^INSERT\s+INTO/i, language: 'sql' },
            { pattern: /^UPDATE\s+.*SET/i, language: 'sql' },
            { pattern: /^DELETE\s+FROM/i, language: 'sql' },
            { pattern: /^CREATE\s+TABLE/i, language: 'sql' },
            { pattern: /^fn\s+\w+\s*\(/, language: 'rust' },
            { pattern: /^use\s+\w+::/, language: 'rust' },
            { pattern: /^go\s+func/, language: 'go' },
            { pattern: /^package\s+main/, language: 'go' },
            { pattern: /^import\s+\(/, language: 'go' },
        ];

        for (const { pattern, language } of patterns) {
            if (pattern.test(trimmedContent)) {
                return language;
            }
        }

        return null;
    }
}
