import {
    CacheType,
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from 'discord.js';
import { Service } from 'typedi';
import { Command } from './command';

@Service()
export class PingCommand extends Command {
    declaration = new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Checks if the bot is working')
        .toJSON();

    async run(
        interaction: ChatInputCommandInteraction<CacheType>
    ): Promise<void> {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        await interaction.reply('Pong!');
    }
}
