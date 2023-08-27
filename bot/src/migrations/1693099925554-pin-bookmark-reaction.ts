import { MigrationInterface, QueryRunner } from "typeorm";

export class pinBookmarkReaction1693099925554 implements MigrationInterface {
    name = 'pinBookmarkReaction1693099925554'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild" ADD "bookmarkEmoji" character varying(32) DEFAULT '🔖'`);
        await queryRunner.query(`ALTER TABLE "guild" ADD "bookmarkEnabled" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "guild" ADD "pinEmoji" character varying(32) DEFAULT '📌'`);
        await queryRunner.query(`ALTER TABLE "guild" ADD "pinEnabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "guild" ADD "pinThreshold" integer NOT NULL DEFAULT '3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "pinThreshold"`);
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "pinEnabled"`);
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "pinEmoji"`);
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "bookmarkEnabled"`);
        await queryRunner.query(`ALTER TABLE "guild" DROP COLUMN "bookmarkEmoji"`);
    }

}
