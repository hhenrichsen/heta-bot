import Logger from 'bunyan';
import Container, { Service } from 'typedi';
import { DataSource } from 'typeorm';
import { Bot } from './service/bot';
import { DataSourceFactory } from './service/datasourcefactory';

@Service()
export class BotInitializer {
    constructor(
        private readonly dataSourceFactory: DataSourceFactory,
        private readonly logger: Logger
    ) {}

    public async init() {
        this.logger.debug('Using debug logger');
        this.logger.info('Connecting to database...');
        const dataSource = this.dataSourceFactory.create();
        await dataSource.initialize();
        Container.set(DataSource, dataSource);
        this.logger.info('Connected!');

        const bot = Container.get(Bot);
        this.logger.info('Connected to Discord...');
        bot.login();
        this.logger.info('Connected!');
    }
}
