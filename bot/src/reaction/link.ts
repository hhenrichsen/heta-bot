import { Client, Message, MessageReaction, User } from 'discord.js';
import { ReactionResponse } from './reaction';
import { Service } from 'typedi';
import Logger from 'bunyan';
import { Guild } from '../service/guild/guild';
import { SentryService } from '../service/error/sentryservice';
import { ScraperService } from '../service/scraper/scraperservice';
import { MarkdownService } from '../service/markdown/markdownservice';
import { ThreadService } from '../service/thread/threadservice';

@Service()
export class LinkResponse extends ReactionResponse {
    constructor(
        private readonly logger: Logger,
        private readonly sentry: SentryService,
        private readonly scraperService: ScraperService,
        private readonly markdownService: MarkdownService,
        private readonly threadService: ThreadService,
    ) {
        super();
    }

    public shouldHandle(
        _client: Client,
        reaction: MessageReaction,
        _user: User,
        _guild?: Guild | undefined,
    ): boolean | Promise<boolean> {
        // Check if the reaction emoji is the link emoji (🔗)
        return reaction.emoji.name === '📝' && reaction.count === 1;
    }

    public async run(
        _client: Client,
        reaction: MessageReaction,
        _user: User,
        _guild?: Guild | undefined,
    ): Promise<void> {
        try {
            this.logger.debug('Handling link scraping reaction');

            const message = reaction.message;
            await message.fetch();

            this.logger.debug(`Message: ${JSON.stringify(message)}`);

            if (!message.content) {
                this.logger.debug('Message has no content to scrape');
                return;
            }

            // Extract URLs from the message content
            const urls = this.scraperService.extractUrls(message.content);
            if (urls.length === 0) {
                this.logger.debug('No valid URLs found in message');
                return;
            }

            this.logger.debug(
                `Found ${urls.length} URLs to scrape: ${urls.join(', ')}`,
            );

            // Scrape all URLs
            const scrapedContents: any[] = [];
            const errors: string[] = [];

            for (const url of urls) {
                try {
                    this.logger.debug(`Scraping URL: ${url}`);
                    const scrapedContent =
                        await this.scraperService.scrapeUrl(url);

                    if (scrapedContent) {
                        scrapedContents.push(scrapedContent);
                        this.logger.debug(`Successfully scraped: ${url}`);
                    } else {
                        errors.push(`Failed to scrape: ${url}`);
                        this.logger.warn(`Failed to scrape URL: ${url}`);
                    }
                } catch (error) {
                    const errorMsg = `Error scraping ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    this.logger.error(`Error scraping URL ${url}:`, error);
                }
            }

            if (scrapedContents.length === 0) {
                this.logger.warn('No content could be scraped from any URLs');
                return;
            }

            // Determine thread name and filename based on number of pages
            let threadName: string;
            let filename: string;

            if (scrapedContents.length === 1) {
                const content = scrapedContents[0];
                threadName = content.title || 'Scraped Content';
                filename = this.threadService.generateSafeFilename(
                    content.title || 'content',
                );
            } else {
                threadName = `Scraped Content (${scrapedContents.length} links)`;
                filename = `scraped-content-${Date.now()}.md`;
            }

            // Get or create thread - cast to Message since we know it's not partial after fetch
            const thread = await this.threadService.getOrCreateThread(
                message as Message,
                threadName,
            );

            if (!thread) {
                this.logger.warn(
                    'Could not create or access thread for link scraping',
                );
                return;
            }

            // Generate markdown content
            const markdown =
                this.markdownService.createCombinedMarkdown(scrapedContents);

            // Upload the markdown file
            const success = await this.threadService.uploadMarkdownFile(
                thread,
                markdown,
                filename,
            );

            if (success) {
                // Send success embed
                await this.threadService.sendSuccessEmbed(
                    thread,
                    scrapedContents.length,
                    urls.length,
                );
            } else {
                // Send error embed if no content was scraped
                await this.threadService.sendErrorEmbed(
                    thread,
                    'No content could be scraped from the provided URLs.',
                );
            }

            // Log any errors that occurred
            if (errors.length > 0) {
                this.logger.warn(
                    `Link scraping completed with ${errors.length} errors:`,
                    errors,
                );
            }
        } catch (error) {
            this.sentry.handleError(error);
            this.logger.error('Error in link scraping reaction:', error);
        }
    }
}
