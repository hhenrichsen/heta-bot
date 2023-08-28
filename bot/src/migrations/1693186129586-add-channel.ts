import { MigrationInterface, QueryRunner } from "typeorm";

export class addChannel1693186129586 implements MigrationInterface {
    name = 'addChannel1693186129586'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild" ADD "channelCategoryId" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "guild" ADD "channelsEnabled" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "channelsEnabled"`);
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "channelCategoryId"`);
    }

}
