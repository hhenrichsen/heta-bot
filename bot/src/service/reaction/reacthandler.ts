import { Client, MessageReaction, User } from 'discord.js';
import { Service } from 'typedi';
import { ReactionResponse } from '../../reaction/reaction';
import { Bookmark as BookmarkResponse } from '../../reaction/bookmark';
import { GuildService } from '../guild/guildservice';
import { PinResponse } from '../../reaction/pin';
import { LinkResponse } from '../../reaction/link';

@Service()
export class ReactHandler {
    private readonly reactions: ReactionResponse[];

    constructor(
        private readonly guildService: GuildService,
        bookmark: BookmarkResponse,
        pin: PinResponse,
        link: LinkResponse,
    ) {
        this.reactions = [bookmark, pin, link];
    }

    public async handle(client: Client, reaction: MessageReaction, user: User) {
        if (user.bot) {
            return;
        }
        const guild =
            (reaction.message.guildId &&
                (await this.guildService.getGuild(reaction.message.guildId))) ||
            undefined;
        for (const response of this.reactions) {
            if (await response.shouldHandle(client, reaction, user, guild)) {
                return response.run(client, reaction, user, guild);
            }
        }
    }
}
