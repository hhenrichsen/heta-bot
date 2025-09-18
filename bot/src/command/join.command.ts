import {
    AutocompleteInteraction,
    CacheType,
    ChannelType,
    ChatInputCommandInteraction,
    DiscordAPIError,
    SlashCommandBuilder,
    TextChannel,
} from 'discord.js';
import { Service } from 'typedi';
import { Command } from './command';
import { SentryService } from '../service/error/sentryservice';
import { Guild } from '../service/guild/guild';
import { Guild as DiscordGuild } from 'discord.js';
import { unpartial } from '../util/unpartial';

@Service()
export class JoinCommand extends Command {
    declaration = new SlashCommandBuilder()
        .setName('join')
        .setDescription('join or create a channel')
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription('The name of the channel to join or create')
                .setRequired(true)
                .setAutocomplete(true),
        )
        .toJSON();

    constructor(private readonly sentry: SentryService) {
        super();
    }

    private async getChannels(
        guild: Guild,
        discordGuild: DiscordGuild,
    ): Promise<readonly string[]> {
        const catId = guild.getChannelCategoryId();
        if (!catId) {
            return [];
        }
        const channels = guild.getChannels();
        if (!channels || channels.length == 0) {
            const category = await discordGuild.channels.cache.get(catId);
            if (!category || category.type != ChannelType.GuildCategory) {
                return [];
            }
            const fetchedCategory = await unpartial(category);
            const channels = fetchedCategory.children.cache.filter(
                (channel): channel is TextChannel =>
                    !!channel && channel.type == ChannelType.GuildText,
            );
            guild.setChannels(channels.map((channel) => channel.name));
        }
        return channels;
    }

    public async autocomplete(
        interaction: AutocompleteInteraction<CacheType>,
        guild?: Guild | undefined,
    ): Promise<void> {
        if (!guild || !interaction.guild) {
            return;
        }
        const name =
            interaction.options.getString('name', true) ??
            interaction.options.data[0] ??
            '';
        interaction.respond(
            (await this.getChannels(guild, interaction.guild))
                .filter((channel) => channel.startsWith(name))
                .map((channel) => ({ name: channel, value: channel })),
        );
    }

    async run(
        interaction: ChatInputCommandInteraction<CacheType>,
        guild: Guild | undefined,
    ): Promise<void> {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        const discordGuild = interaction.guild;
        if (!discordGuild || !guild) {
            return;
        }
        if (!guild.isChannelsEnabled()) {
            await interaction.reply({
                ephemeral: true,
                content: "Sorry, that's not enabled on this server.",
            });
        }
        let channel: TextChannel | undefined;

        try {
            const name =
                interaction.options.getString('name', true) ??
                interaction.options.data[0];

            if (!name) {
                await interaction.reply({
                    ephemeral: true,
                    content: 'Please give me a channel title.',
                });
                return;
            }
            const channelName = name.replaceAll(/[^\w_]/g, '-').toLowerCase();

            const channels = await this.getChannels(guild, discordGuild);

            channel =
                discordGuild.channels.cache.find(
                    (channel): channel is TextChannel =>
                        channel.name == channelName &&
                        channel.parentId == guild.getChannelCategoryId() &&
                        channel.type == ChannelType.GuildText,
                ) ??
                (await discordGuild.channels.create({
                    name: channelName,
                    parent: guild.getChannelCategoryId(),
                }));
            guild.setChannels(new Set([...channels, channelName]));
        } catch (error) {
            if (error instanceof DiscordAPIError) {
                if (error.status == 403) {
                    await interaction.reply({
                        ephemeral: true,
                        content:
                            "I don't have permission to edit channels. Please contact an admin.",
                    });
                    return;
                }
            }
            this.sentry.handleError(error);
            await interaction.reply({
                ephemeral: true,
                content: 'An error occurred while creating the channel.',
            });
        }

        try {
            if (channel) {
                await channel.permissionOverwrites.edit(interaction.user, {
                    ViewChannel: true,
                });
                await interaction.reply({
                    content: `Hey <@${interaction.user.id}>, welcome to <#${channel.id}>! Be sure to click 'Add to Channel List' to keep the channel available.`,
                    ephemeral: true,
                });
            }
        } catch (error) {
            if (error instanceof DiscordAPIError) {
                if (error.status == 403) {
                    await interaction.reply({
                        ephemeral: true,
                        content:
                            "I don't have permission to add you to that channel. Check the 'Browse channels' menu.",
                    });
                    return;
                }
            }
            this.sentry.handleError(error);
            await interaction.reply({
                ephemeral: true,
                content: 'An error occurred while creating the channel.',
            });
        }
    }
}
