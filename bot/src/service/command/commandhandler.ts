import Logger from 'bunyan';
import {
    ChatInputCommandInteraction,
    CacheType,
    AutocompleteInteraction,
} from 'discord.js';
import { Service } from 'typedi';
import { CommandRegistry } from './commandregistry';
import { GuildRepository } from '../../repositories/guild.repository';
import { GuildService } from '../guild/guildservice';

@Service()
export class CommandHandler {
    constructor(
        private readonly logger: Logger,
        private readonly commandRegistry: CommandRegistry,
        private readonly guildService: GuildService
    ) {}

    public async handle(
        interaction: ChatInputCommandInteraction | AutocompleteInteraction
    ) {
        this.logger.debug(`Handling command ${interaction.commandName}`);
        const guild =
            (interaction.guildId &&
                (await this.guildService.getGuild(interaction.guildId))) ||
            undefined;
        const command = this.commandRegistry.getCommand(
            interaction.commandName
        );
        if (command) {
            if (interaction.isAutocomplete()) {
                command.autocomplete(interaction, guild);
            } else {
                command.run(interaction, guild);
            }
        } else {
            this.logger.warn(
                `Trying to execute nonexistent command ${interaction.commandName}`
            );
        }
    }
}
