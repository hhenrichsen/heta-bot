import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import { Guild } from '../service/guild/guild';

export abstract class Command {
    public abstract readonly declaration: RESTPostAPIApplicationCommandsJSONBody;
    public abstract run(
        interaction: ChatInputCommandInteraction,
        guild?: Guild | undefined
    ): Promise<void> | void;
    public autocomplete(
        interaction: AutocompleteInteraction,
        guild?: Guild | undefined
    ): Promise<void> | void { };
}
