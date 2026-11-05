/*
  Warnings:

  - You are about to drop the column `search_vector` on the `BlogPost` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "BlogPost_search_vector_idx";

-- AlterTable
ALTER TABLE "BlogPost" DROP COLUMN "search_vector";
