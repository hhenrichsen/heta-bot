import { Attachment, EmbedBuilder, Message } from 'discord.js';
import { Service } from 'typedi';
import { unpartial } from '../../util/unpartial';
import Logger from 'bunyan';

@Service()
export class MessageToEmbed {
    constructor(private readonly logger: Logger) { }

    public convert(message: Message): [EmbedBuilder, Attachment[]] {
        const embedBuilder = new EmbedBuilder();

        if (message.guild) {
            const guild = message.guild;
            if (
                message.channel &&
                message.channel.isTextBased() &&
                !message.channel.isDMBased()
            ) {
                embedBuilder.setTitle(
                    `Message from ${guild.name} #${message.channel.name}`
                );
            } else {
                embedBuilder.setTitle(`Message from ${guild.name}`);
            }
        }

        this.logger.info(message);
        message.url && embedBuilder.setURL(message.url);
        if (message.content) {
            embedBuilder.setDescription(message.content);
        }
        else {
            embedBuilder.setDescription('*(no content)*\n\nThis may be an indication that the server has opted not to share message content with Heta.')
        }
        embedBuilder.setAuthor({
            name:
                message.author.username +
                (message.author.discriminator != '0'
                    ? `#${message.author.discriminator}`
                    : ''),
            iconURL: message.author.displayAvatarURL({
                size: 64,
            }),
        });

        return [embedBuilder, message.attachments.toJSON()];
    }
}
