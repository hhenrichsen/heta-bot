import { Service } from 'typedi';
import Logger from 'bunyan';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export interface ScrapedContent {
    title: string;
    content: string;
    url: string;
    timestamp: Date;
    author?: string;
    publicationDate?: Date;
    description?: string;
    siteName?: string;
}

@Service()
export class ScraperService {
    private turndown: TurndownService;

    constructor(private readonly logger: Logger) {
        this.turndown = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            emDelimiter: '*',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            linkReferenceStyle: 'full',
        });

        // Add custom rules for better code block handling
        this.setupCustomTurndownRules();
    }

    public async scrapeUrl(url: string): Promise<ScrapedContent | null> {
        try {
            this.logger.debug(`Scraping URL: ${url}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            });

            if (!response.ok) {
                this.logger.warn(
                    `Failed to fetch URL ${url}: ${response.status} ${response.statusText}`,
                );
                return null;
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            // Remove script and style elements
            $(
                'script, style, nav, header, footer, aside, .advertisement, .ads',
            ).remove();

            // Extract title
            let title = $('title').text().trim();
            if (!title) {
                title = $('h1').first().text().trim();
            }
            if (!title) {
                title = 'Untitled';
            }

            // Extract metadata
            const author = this.extractAuthor($);
            const publicationDate = this.extractPublicationDate($);
            const description = this.extractDescription($);
            const siteName = this.extractSiteName($, url);

            // Extract main content with proper formatting
            let content = '';

            // Try to find the best content area using priority and content analysis
            const contentElement = this.findBestContentElement($);
            if (contentElement) {
                content = this.extractFormattedContent(contentElement);
            } else {
                // Fallback to body content
                content = this.extractFormattedContent($('body'));
            }

            if (!content) {
                this.logger.warn(`No content found for URL: ${url}`);
                return null;
            }

            return {
                title,
                content,
                url,
                timestamp: new Date(),
                author,
                publicationDate,
                description,
                siteName,
            };
        } catch (error) {
            this.logger.error(`Error scraping URL ${url}:`, error);
            return null;
        }
    }

    public extractUrls(text: string): string[] {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = text.match(urlRegex) || [];

        // Filter out common non-content URLs
        const filteredUrls = urls.filter((url) => {
            const lowerUrl = url.toLowerCase();
            return (
                !lowerUrl.includes('discord.com') &&
                !lowerUrl.includes('discordapp.com') &&
                !lowerUrl.includes('youtube.com/watch') &&
                !lowerUrl.includes('youtu.be') &&
                !lowerUrl.includes('twitter.com') &&
                !lowerUrl.includes('x.com') &&
                !lowerUrl.includes('instagram.com') &&
                !lowerUrl.includes('tiktok.com') &&
                !lowerUrl.includes('facebook.com') &&
                !lowerUrl.includes('reddit.com') &&
                !lowerUrl.endsWith('.jpg') &&
                !lowerUrl.endsWith('.jpeg') &&
                !lowerUrl.endsWith('.png') &&
                !lowerUrl.endsWith('.gif') &&
                !lowerUrl.endsWith('.webp') &&
                !lowerUrl.endsWith('.mp4') &&
                !lowerUrl.endsWith('.webm')
            );
        });

        return filteredUrls;
    }

    private findBestContentElement(
        $: cheerio.CheerioAPI,
    ): cheerio.Cheerio<unknown> | null {
        // Get total text content length for percentage calculation
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const totalLength = bodyText.length;

        if (totalLength === 0) {
            return null;
        }

        // Define content selectors in order of preference
        const contentSelectors = [
            'article',
            'main',
            '.content',
            '.post',
            '.entry',
            '#content',
            '.main-content',
            '.article-content',
            '.post-content',
            '.entry-content',
            '[role="main"]',
            '.page-content',
            '.story-content',
        ];

        let bestElement: cheerio.Cheerio<unknown> | null = null;
        let bestSelector: string | null = null;
        let bestScore = 0;

        for (const selector of contentSelectors) {
            const elements = $(selector);

            for (let i = 0; i < elements.length; i++) {
                const element = elements.eq(i);
                const elementText = element.text().replace(/\s+/g, ' ').trim();
                const elementLength = elementText.length;

                if (elementLength === 0) {
                    continue;
                }

                // Calculate content percentage
                const contentPercentage = (elementLength / totalLength) * 100;

                // Calculate score based on content percentage and element type
                let score = contentPercentage;

                // Boost score for article elements
                if (selector === 'article') {
                    score *= 3.0;
                }

                // Boost score for main elements
                if (selector === 'main') {
                    score *= 1.1;
                }

                // Penalize very short content
                if (elementLength < 100) {
                    score *= 0.1;
                }

                // Only consider elements with at least 10% of content
                if (contentPercentage >= 10 && score > bestScore) {
                    bestElement = element;
                    bestScore = score;
                    bestSelector = selector;
                }
            }
        }

        // If we found an article with at least 40% content, use it
        if (bestElement && bestScore >= 40) {
            const elementText = (bestElement as any)
                .text()
                .replace(/\s+/g, ' ')
                .trim();
            const percentage = (
                (elementText.length / totalLength) *
                100
            ).toFixed(1);
            this.logger.debug(
                `Using ${bestSelector} element with ${percentage}% of page content`,
            );
            return bestElement;
        }

        // If we found any good content element, use it
        if (bestElement) {
            const elementText = (bestElement as any)
                .text()
                .replace(/\s+/g, ' ')
                .trim();
            const percentage = (
                (elementText.length / totalLength) *
                100
            ).toFixed(1);
            this.logger.debug(
                `Using ${bestSelector} element with ${percentage}% of page content`,
            );
            return bestElement;
        }

        // Fallback to first available content element
        for (const selector of contentSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                this.logger.debug(
                    `Using fallback content element: ${selector}`,
                );
                return element;
            }
        }

        return null;
    }

    private extractFormattedContent(element: cheerio.Cheerio<unknown>): string {
        // Clone the element to avoid modifying the original
        const clonedElement = (
            element as {
                clone(): {
                    find(selector: string): { remove(): void };
                    html(): string | null;
                };
            }
        ).clone();

        // Remove unwanted elements but keep structure
        clonedElement
            .find(
                'script, style, nav, header, footer, aside, .advertisement, .ads, .social-share, .share-buttons, .comments, .comment-section',
            )
            .remove();

        // Convert to markdown
        const html = clonedElement.html() || '';
        if (!html.trim()) {
            return '';
        }

        let markdown = this.turndown.turndown(html);

        // Clean up the markdown
        markdown = this.cleanupMarkdown(markdown);

        return markdown;
    }

    private setupCustomTurndownRules(): void {
        // Add rule for code blocks with language detection
        this.turndown.addRule('codeBlockWithLanguage', {
            filter: (node: Node) => {
                return (
                    node.nodeName === 'PRE' &&
                    (node as Element).querySelector('code') !== null
                );
            },
            replacement: (content: string, node: Node) => {
                const element = node as Element;
                const codeElement = element.querySelector('code');
                if (!codeElement) return content;

                const language = this.detectCodeLanguage(codeElement);
                const code = codeElement.textContent || '';

                return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
            },
        });

        // Add rule for inline code
        this.turndown.addRule('inlineCode', {
            filter: (node: Node) => {
                return (
                    node.nodeName === 'CODE' &&
                    (node as Element).parentElement?.nodeName !== 'PRE'
                );
            },
            replacement: (content: string) => {
                return `\`${content}\``;
            },
        });
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

    private cleanupMarkdown(markdown: string): string {
        return (
            markdown
                // Remove excessive line breaks (more than 2 consecutive)
                .replace(/\n{3,}/g, '\n\n')
                // Fix spacing around headers
                .replace(/\n(#{1,6})\s+/g, '\n$1 ')
                // Fix spacing around lists
                .replace(/\n(\s*[-*+])\s+/g, '\n$1 ')
                // Fix spacing around code blocks
                .replace(/\n(```[\s\S]*?```)\n/g, '\n\n$1\n\n')
                // Remove trailing whitespace from lines
                .replace(/[ \t]+$/gm, '')
                // Ensure proper spacing around links
                .replace(/([^!])\[([^\]]+)\]\(([^)]+)\)/g, '$1 [$2]($3)')
                // Clean up multiple spaces
                .replace(/[ \t]{2,}/g, ' ')
                // Remove empty lines at start/end
                .trim()
        );
    }

    private extractAuthor($: cheerio.CheerioAPI): string | undefined {
        // Try various meta tags and selectors for author
        const authorSelectors = [
            'meta[name="author"]',
            'meta[property="article:author"]',
            'meta[property="og:article:author"]',
            '[rel="author"]',
            '.author',
            '.byline',
            '[data-author]',
        ];

        for (const selector of authorSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                const content =
                    element.attr('content') || element.text().trim();
                if (content) {
                    return content;
                }
            }
        }

        return undefined;
    }

    private extractPublicationDate($: cheerio.CheerioAPI): Date | undefined {
        // Try various meta tags for publication date
        const dateSelectors = [
            'meta[name="article:published_time"]',
            'meta[property="article:published_time"]',
            'meta[name="date"]',
            'meta[property="og:article:published_time"]',
            'time[datetime]',
            '[data-published]',
        ];

        for (const selector of dateSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                const dateStr =
                    element.attr('content') ||
                    element.attr('datetime') ||
                    element.text().trim();
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        return date;
                    }
                }
            }
        }

        return undefined;
    }

    private extractDescription($: cheerio.CheerioAPI): string | undefined {
        // Try various meta tags for description
        const descSelectors = [
            'meta[name="description"]',
            'meta[property="og:description"]',
            'meta[name="twitter:description"]',
        ];

        for (const selector of descSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                const content = element.attr('content');
                if (content && content.trim()) {
                    return content.trim();
                }
            }
        }

        return undefined;
    }

    private extractSiteName(
        $: cheerio.CheerioAPI,
        url: string,
    ): string | undefined {
        // Try various meta tags for site name
        const siteSelectors = [
            'meta[property="og:site_name"]',
            'meta[name="application-name"]',
            'meta[property="og:title"]',
        ];

        for (const selector of siteSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                const content = element.attr('content');
                if (content && content.trim()) {
                    return content.trim();
                }
            }
        }

        // Fallback to domain name
        try {
            const domain = new URL(url).hostname;
            return domain.replace('www.', '');
        } catch {
            return undefined;
        }
    }
}
