import { Attachment, EmbedBuilder, Message } from 'discord.js';
import { Service } from 'typedi';

@Service()
export class MessageToEmbed {
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

        embedBuilder.setURL(message.url);
        embedBuilder.setDescription(message.content);
        embedBuilder.setAuthor({
            name: message.author.tag,
            iconURL: message.author.displayAvatarURL({
                size: 64,
            }),
        });

        return [embedBuilder, message.attachments.toJSON()];
    }
}
