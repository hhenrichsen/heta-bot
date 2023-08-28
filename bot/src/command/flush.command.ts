import {
    CacheType,
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from 'discord.js';
import { Service } from 'typedi';
import { Command } from './command';
import { GuildService } from '../service/guild/guildservice';

@Service()
export class FlushCommand extends Command {
    declaration = new SlashCommandBuilder()
        .setName('flush')
        .setDescription('for developer use -- does nothing for you')
        .toJSON();

    constructor(private readonly guildService: GuildService) {
        super();
    }
    async run(
        interaction: ChatInputCommandInteraction<CacheType>
    ): Promise<void> {
        if (interaction.user.id != '108324874082058240') {
            await interaction.reply({});
            return;
        }
        this.guildService.flush();
        await interaction.reply({
            ephemeral: true,
            content: 'Flushed!',
        });
    }
}
