import { Service } from 'typedi';
import { DataSource } from 'typeorm';
import { GuildEntity } from '../entities/guild.entity';
import { Environment } from '../service/environment';
import { CachedRepo } from './cachedrepo';

@Service()
export class GuildRepository extends CachedRepo<GuildEntity> {
    constructor(environment: Environment, dataSource: DataSource) {
        super(environment, dataSource.getRepository(GuildEntity));
    }

    public async getGuildById(id: string): Promise<GuildEntity | undefined> {
        return this.findOneCached(id, { where: { id } });
    }

    public async createOrGetGuild(id: string): Promise<GuildEntity> {
        const old = await this.getGuildById(id);
        if (old) {
            return old;
        }
        const guild = await this.repo.create({ id });
        await this.repo.save(guild);
        this.updateCache(id, guild);
        return guild;
    }

    public saveGuild(id: string, guild: GuildEntity): void {
        this.updateCache(id, guild);
        this.repo.update(id, guild);
    }
}
