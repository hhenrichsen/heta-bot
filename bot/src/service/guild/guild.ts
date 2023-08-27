import { GuildEntity } from "../../entities/guild.entity";

export class Guild {
    constructor(
        private readonly model: GuildEntity
    ) { }

    public shouldPin(emojiName: string | null, emojiId: string | null, reactionCount: number): boolean {
        if (!this.model.pinEnabled) {
            console.log('pin disabled');
            return false;
        }
        const emojiToCompare = this.model.pinEmoji || '📌';
        if (emojiName != emojiToCompare && emojiId != emojiToCompare) {
            console.log('wrong emoji');
            return false;
        }
        if (reactionCount < this.model.pinThreshold) {
            console.log('not enough reactions');
            return false;
        }
        return true;
    }

    public shouldBookmark(emojiName: string | null, emojiId: string | null) { 
        if (!this.model.bookmarkEnabled) {
            return false;
        }
        const emojiToCompare = this.model.bookmarkEmoji || '🔖';
        if (emojiName != emojiToCompare && emojiId != emojiToCompare) {
            return false;
        }
        return true;
    }

}
