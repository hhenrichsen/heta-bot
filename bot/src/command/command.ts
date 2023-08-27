import {
    CacheType,
    ChatInputCommandInteraction,
    RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import { Constructor } from '../types/constructor';
import { GuildEntity } from '../entities/guild.entity';

export abstract class Command {
    public abstract readonly declaration: RESTPostAPIApplicationCommandsJSONBody;
    protected abstract type: Constructor<Command>;
    public abstract run(
        interaction: ChatInputCommandInteraction<CacheType>,
        guild?: GuildEntity | undefined
    ): Promise<void> | void;
}
