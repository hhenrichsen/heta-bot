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

@Entity()
export class Guild {
    constructor(props: Partial<Guild>) {
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

    @Column('varchar', { length: 32 })
    bookmarkEmoji = '🔖';

    @Column('bool')
    bookmarkEnabled = true;
}

// Inject so we can retrieve this model when we create the connection.
// The syntax here is weird because we need the _class_, not an instance.
Container.set({ id: EntityToken, multiple: true, value: Guild });
