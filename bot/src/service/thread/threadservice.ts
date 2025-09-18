import { Service } from 'typedi';
import Logger from 'bunyan';
import {
    ChannelType,
    Client,
    DiscordAPIError,
    EmbedBuilder,
    Message,
    PartialMessage,
    TextChannel,
    ThreadChannel,
} from 'discord.js';

@Service()
export class ThreadService {
    constructor(private readonly logger: Logger) {}

    public async getOrCreateThread(
        message: Message,
        threadName: string = 'Scraped Content',
    ): Promise<ThreadChannel | null> {
        try {
            // Check if message already has a thread
            if (message.thread) {
                this.logger.debug(
                    `Using existing thread: ${message.thread.name}`,
                );
                return message.thread;
            }

            // Check if channel supports threads
            if (message.channel.type !== ChannelType.GuildText) {
                this.logger.warn(
                    `Channel ${message.channel.id} does not support threads`,
                );
                return null;
            }

            const textChannel = message.channel as TextChannel;

            // Create a new thread
            const thread = await textChannel.threads.create({
                name: threadName,
                startMessage: message,
                autoArchiveDuration: 60, // 1 hour
            });

            this.logger.debug(`Created new thread: ${thread.name}`);
            return thread;
        } catch (error) {
            if (error instanceof DiscordAPIError) {
                if (error.status === 403) {
                    this.logger.warn(
                        `Insufficient permissions to create thread in channel ${message.channel.id}`,
                    );
                } else {
                    this.logger.error(
                        `Discord API error creating thread: ${error.message}`,
                    );
                }
            } else {
                this.logger.error('Error creating thread:', error);
            }
            return null;
        }
    }

    public async uploadMarkdownFile(
        thread: ThreadChannel,
        content: string,
        filename: string = 'content.md',
    ): Promise<boolean> {
        try {
            // Discord has a 8MB file size limit, so we need to check content size
            const contentBytes = Buffer.byteLength(content, 'utf8');
            const maxSize = 8 * 1024 * 1024; // 8MB

            if (contentBytes > maxSize) {
                this.logger.warn(
                    `Content too large (${contentBytes} bytes), truncating`,
                );
                content = content.substring(0, Math.floor(maxSize * 0.9)); // Leave some buffer
            }

            const buffer = Buffer.from(content, 'utf8');

            await thread.send({
                files: [
                    {
                        attachment: buffer,
                        name: filename,
                    },
                ],
            });

            this.logger.debug(`Uploaded markdown file to thread: ${filename}`);
            return true;
        } catch (error) {
            if (error instanceof DiscordAPIError) {
                this.logger.error(
                    `Discord API error uploading file: ${error.message}`,
                );
            } else {
                this.logger.error('Error uploading markdown file:', error);
            }
            return false;
        }
    }

    public async sendErrorEmbed(
        thread: ThreadChannel,
        errorMessage: string,
    ): Promise<void> {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Error Scraping Content')
                .setDescription(errorMessage)
                .setColor('Red')
                .setTimestamp();

            await thread.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error('Error sending error embed:', error);
        }
    }

    public async sendSuccessEmbed(
        thread: ThreadChannel,
        scrapedCount: number,
        totalUrls: number,
    ): Promise<void> {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Content Scraped Successfully')
                .setDescription(
                    `Successfully scraped ${scrapedCount} out of ${totalUrls} links`,
                )
                .setColor('Green')
                .setTimestamp();

            await thread.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error('Error sending success embed:', error);
        }
    }

    public generateSafeFilename(
        title: string,
        extension: string = 'md',
    ): string {
        // Remove or replace invalid filename characters
        const safeTitle = title
            .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            .substring(0, 100); // Limit length

        return `${safeTitle || 'content'}.${extension}`;
    }
}
