import { S3Client } from '@aws-sdk/client-s3';

if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION is not configured');
}

if (!process.env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET is not configured');
}

export const s3Client = new S3Client({
    region: process.env.AWS_REGION
});

export const s3Bucket = process.env.AWS_S3_BUCKET;