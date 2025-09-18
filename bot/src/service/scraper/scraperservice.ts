import { Service } from 'typedi';
import Logger from 'bunyan';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { ExpressiveCodeProcessor } from './processors/expressive-code-processor';
import { PrismCodeBlockProcessor } from './processors/prism-code-block-processor';
import { AstroCodeBlockProcessor } from './processors/astro-code-block-processor';
import { CodeBlockDirectProcessor } from './processors/code-block-direct-processor';
import { InlineCodeProcessor } from './processors/inline-code-processor';
import { CodeBlockWithLanguageProcessor } from './processors/code-block-with-language-processor';

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

    constructor(
        private readonly logger: Logger,
        private readonly expressiveCodeProcessor: ExpressiveCodeProcessor,
        private readonly prismCodeBlockProcessor: PrismCodeBlockProcessor,
        private readonly astroCodeBlockProcessor: AstroCodeBlockProcessor,
        private readonly codeBlockDirectProcessor: CodeBlockDirectProcessor,
        private readonly inlineCodeProcessor: InlineCodeProcessor,
        private readonly codeBlockWithLanguageProcessor: CodeBlockWithLanguageProcessor,
    ) {
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
        // Register all the code block processors
        const processors = [
            this.expressiveCodeProcessor,
            this.prismCodeBlockProcessor,
            this.astroCodeBlockProcessor,
            this.codeBlockDirectProcessor,
            this.codeBlockWithLanguageProcessor,
            this.inlineCodeProcessor,
        ];

        // Add rules from all processors
        processors.forEach((processor) => {
            const rule = processor.getRule();
            this.turndown.addRule(processor.getRuleName(), rule);
            this.logger.debug(
                `Added turndown rule: ${processor.getRuleName()}`,
            );
        });
    }

    private cleanupMarkdown(markdown: string): string {
        // First, protect code blocks from whitespace cleanup
        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlocks: string[] = [];
        let protectedMarkdown = markdown.replace(codeBlockRegex, (match) => {
            const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
            codeBlocks.push(match);
            return placeholder;
        });

        // Clean up the protected markdown
        protectedMarkdown = protectedMarkdown
            // Remove excessive line breaks (more than 2 consecutive)
            .replace(/\n{3,}/g, '\n\n')
            // Fix spacing around headers
            .replace(/\n(#{1,6})\s+/g, '\n$1 ')
            // Fix spacing around lists
            .replace(/\n(\s*[-*+])\s+/g, '\n$1 ')
            // Remove trailing whitespace from lines
            .replace(/[ \t]+$/gm, '')
            // Ensure proper spacing around links
            .replace(/([^!])\[([^\]]+)\]\(([^)]+)\)/g, '$1 [$2]($3)')
            // Clean up multiple spaces (but not in code blocks)
            .replace(/[ \t]{2,}/g, ' ')
            // Remove empty lines at start/end
            .trim();

        // Restore code blocks
        let cleanedMarkdown = protectedMarkdown;
        codeBlocks.forEach((codeBlock, index) => {
            cleanedMarkdown = cleanedMarkdown.replace(
                `__CODE_BLOCK_${index}__`,
                codeBlock,
            );
        });

        // Fix spacing around code blocks
        cleanedMarkdown = cleanedMarkdown.replace(
            /\n(```[\s\S]*?```)\n/g,
            '\n\n$1\n\n',
        );

        return cleanedMarkdown;
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
