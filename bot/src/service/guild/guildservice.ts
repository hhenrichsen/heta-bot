import { Service } from "typedi";
import { GuildRepository } from "../../repositories/guild.repository";
import { Guild } from "./guild";

@Service()
export class GuildService {
    private readonly guildMap: Map<string, Guild> = new Map();

    constructor(private readonly guildRepository: GuildRepository) {

    }

    /**
     * All guilds with the same ID should return the same instance.
     */
    public async getGuild(guildId: string): Promise<Guild> {
        const fromMap = this.guildMap.get(guildId);
        if (fromMap) {
            return fromMap;
        }
        else {
            const guild = new Guild(await this.guildRepository.createOrGetGuild(guildId));
            this.guildMap.set(guildId, guild);
            return guild;
        }
    }
}
