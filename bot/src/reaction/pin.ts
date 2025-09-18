import {
    ChannelType,
    Client,
    DiscordAPIError,
    EmbedBuilder,
    MessageReaction,
    User,
} from 'discord.js';
import { ReactionResponse } from './reaction';
import { Service } from 'typedi';
import Logger from 'bunyan';
import { Guild } from '../service/guild/guild';
import { SentryService } from '../service/error/sentryservice';

@Service()
export class PinResponse extends ReactionResponse {
    constructor(
        private readonly logger: Logger,
        private readonly sentry: SentryService,
    ) {
        super();
    }

    public shouldHandle(
        client: Client,
        reaction: MessageReaction,
        user: User,
        guild?: Guild | undefined,
    ): boolean | Promise<boolean> {
        this.logger.debug('Checking if should handle pin reaction');
        if (!guild) {
            this.logger.debug(
                `Skipping handling reaction ${reaction.emoji.name} in ${reaction.message.channel}: no guild`,
            );
            return false;
        }
        if (
            !guild.shouldPin(
                reaction.emoji.name,
                reaction.emoji.id,
                reaction.count,
            )
        ) {
            this.logger.debug(
                `Skipping handling reaction ${reaction.emoji.name} in ${reaction.message.channel}: wrong emoji`,
            );
            return false;
        }
        return true;
    }

    public async run(
        _client: Client,
        reaction: MessageReaction,
        _user: User,
        _guild?: Guild | undefined,
        _ignoreReactions = false,
    ): Promise<void> {
        try {
            if (reaction.message.channel.type == ChannelType.GuildText) {
                const pinned =
                    await reaction.message.channel.messages.fetchPinned();
                while (pinned.size >= 50) {
                    await pinned.last()?.unpin();
                }
            }
            await reaction.message.pin();
        } catch (error) {
            if (error instanceof DiscordAPIError) {
                if (error.status == 403) {
                    const embedBuilder = new EmbedBuilder();
                    embedBuilder
                        .setTitle('Error pinning message')
                        .setDescription(
                            'I need the `MANAGE_MESSAGES` permission to pin messages.',
                        )
                        .setColor('Red');
                    if (
                        reaction.message.channel.type ===
                            ChannelType.GuildText ||
                        reaction.message.channel.type ===
                            ChannelType.GuildAnnouncement
                    ) {
                        reaction.message.channel.send({
                            embeds: [embedBuilder.toJSON()],
                        });
                    }
                    return;
                }
            }
            this.sentry.handleError(error);
            this.logger.error(error);
        }
    }
}
