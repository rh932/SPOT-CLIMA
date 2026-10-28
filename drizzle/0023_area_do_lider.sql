CREATE TYPE "public"."leader_area" AS ENUM('COZINHA', 'SALAO', 'ADM', 'DELIVERY');--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "leader_area" "leader_area";