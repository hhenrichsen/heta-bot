import { MigrationInterface, QueryRunner } from "typeorm";

export class guildBookmark1686368225448 implements MigrationInterface {
    name = 'guildBookmark1686368225448'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild" ADD "bookmarkEmoji" character varying(32) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "guild" ADD "bookmarkEnabled" boolean NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "bookmarkEnabled"`);
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "bookmarkEmoji"`);
    }

}
