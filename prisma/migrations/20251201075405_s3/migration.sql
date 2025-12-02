/*
  Warnings:

  - Added the required column `s3URL` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "File" ADD COLUMN     "s3URL" TEXT NOT NULL;
