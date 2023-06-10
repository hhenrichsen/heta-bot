import {
    ActionRowBuilder,
    ButtonBuilder,
    Client,
    DiscordAPIError,
    MessageReaction,
    User,
} from 'discord.js';
import { Guild } from '../entities/guild.entity';
import { ReactionResponse } from './reaction';
import { MessageToEmbed } from '../service/message/messagetoembed';
import { unpartial } from '../util/unpartial';
import { DeleteResponse } from '../interactionresponse/deleteresponse';
import { Service } from 'typedi';
import Logger from 'bunyan';
import { SentryService } from '../service/error/sentryservice';

@Service()
export class Bookmark extends ReactionResponse {
    constructor(
        private readonly messageToEmbed: MessageToEmbed,
        private readonly deleteResponse: DeleteResponse,
        private readonly logger: Logger,
        private readonly sentry: SentryService
    ) {
        super();
    }

    public shouldHandle(
        client: Client,
        reaction: MessageReaction,
        user: User,
        guild?: Guild | undefined
    ): boolean | Promise<boolean> {
        if (!guild) {
            this.logger.debug(
                `Skipping handling reaction ${reaction.emoji.name} in ${reaction.message.channel}: no guild`
            );
            return false;
        }
        if (
            guild.bookmarkEnabled &&
            (reaction.emoji.name == guild.bookmarkEmoji ||
                reaction.emoji.id == guild.bookmarkEmoji)
        ) {
            return true;
        }
        this.logger.debug(
            `Skipping handling reaction ${reaction.emoji.name} in ${reaction.message.channel}: wrong emoji`
        );
        return false;
    }

    public async run(
        client: Client,
        reaction: MessageReaction,
        user: User,
        guild?: Guild | undefined,
        ignoreReactions = false
    ): Promise<void> {
        const [embed, attachments] = this.messageToEmbed.convert(
            await unpartial(reaction.message)
        );

        this.logger.debug(
            `Skipping handling reaction ${reaction.emoji.name} in ${reaction.message.channel}: wrong emoji`
        );
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            this.deleteResponse.button
        );

        try {
            await user.send({
                embeds: [embed],
                files: ignoreReactions ? undefined : attachments,
                components: [buttonRow],
            });
        } catch (error) {
            if (error instanceof DiscordAPIError) {
                if (error.code == 413 && !ignoreReactions) {
                    return this.run(client, reaction, user, guild, true);
                }
            }
            this.sentry.handleError(error);
        }
    }
}
