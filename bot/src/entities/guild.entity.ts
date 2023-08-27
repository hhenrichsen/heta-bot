import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import Container from 'typedi';
import { EntityToken } from './base';

@Entity('guild')
export class GuildEntity {
    constructor(props: Partial<GuildEntity>) {
        Object.assign(this, props);
    }

    @PrimaryColumn('varchar', { length: 32 })
    id = '';

    @CreateDateColumn()
    createdAt: Date = new Date();

    @UpdateDateColumn()
    updatedAt: Date = new Date();

    @VersionColumn()
    version = 0;

    @Column('varchar', { length: 32, nullable: true, default: '🔖' })
    bookmarkEmoji: string | null = '🔖';

    @Column('bool', { default: true })
    bookmarkEnabled = true;

    @Column('varchar', { length: 32, nullable: true, default: '📌' })
    pinEmoji: string | null = '📌';

    @Column('bool', { default: false })
    pinEnabled = true;

    @Column('int', { default: 3 })
    pinThreshold = 3;
}

// Inject so we can retrieve this model when we create the connection.
// The syntax here is weird because we need the _class_, not an instance.
Container.set({ id: EntityToken, multiple: true, value: GuildEntity });
