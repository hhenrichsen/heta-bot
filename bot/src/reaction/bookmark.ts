import {
    ActionRowBuilder,
    ButtonBuilder,
    Client,
    DiscordAPIError,
    MessageReaction,
    User,
} from 'discord.js';
import { ReactionResponse } from './reaction';
import { MessageToEmbed } from '../service/message/messagetoembed';
import { unpartial } from '../util/unpartial';
import { DeleteResponse } from '../interactionresponse/deleteresponse';
import { Service } from 'typedi';
import Logger from 'bunyan';
import { SentryService } from '../service/error/sentryservice';
import { Guild } from '../service/guild/guild';

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
        this.logger.debug('Checking if should handle bookmark reaction');
        if (!guild) {
            this.logger.debug(
                `Skipping handling reaction ${reaction.emoji.name} in ${reaction.message.channel}: no guild`
            );
            return false;
        }
        if (!guild.shouldBookmark(reaction.emoji.name, reaction.emoji.id)) {
            return false;
        }
        return true;
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
