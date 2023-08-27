import { Service } from "typedi";
import { GuildRepository } from "../../repositories/guild.repository";
import { Guild } from "./guild";

@Service()
export class GuildService {
    constructor(private readonly guildRepository: GuildRepository) {

    }
    
    public async getGuild(guildId: string) {
        return new Guild(await this.guildRepository.createOrGetGuild(guildId));
    }
}
