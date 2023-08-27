import { Client, MessageReaction, User } from 'discord.js';
import { GuildEntity } from '../entities/guild.entity';
import { Guild } from '../service/guild/guild';

export abstract class ReactionResponse {
    public abstract shouldHandle(
        client: Client,
        reaction: MessageReaction,
        user: User,
        guild?: Guild | undefined
    ): boolean | Promise<boolean>;

    public abstract run(
        client: Client,
        reaction: MessageReaction,
        user: User,
        guild?: Guild | undefined
    ): void | Promise<void>;
}
